import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { reconstruct } from '../reference/paid-action-reader.mjs';

// Offline validation of retained reports and exact source attribution. This
// module never runs Python, a collector, an RPC callback, a node or a wallet.
// A consistent retained report is not proof that its checker was re-executed.
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path).toString('utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = json('experiments/paid-acquisition-race/replay-report.json');
const trace = json('experiments/paid-reorg/execution-trace.json');
const results = Object.fromEntries(['left', 'right'].map(branch => [branch, json('experiments/paid-acquisition-race/result-' + branch + '.json')]));
const sourcePaths = [
  'reference/paid_acquisition_session.py', 'experiments/paid-acquisition-race/replay_transport.py',
  'experiments/paid-acquisition-race/check_race.py', 'experiments/paid-reorg/execution-trace.json',
  'experiments/paid-reorg/reconstruction-python-left-number.json', 'experiments/paid-reorg/reconstruction-python-right-number.json',
  'experiments/paid-acquisition/collect_by_number.py', 'experiments/paid-acquisition/collect_by_hash.py',
  'reference/paid_action_reader.py', 'reference/fixtures/generate-ethereum-proof-fixtures.py'
];
const sourceHashes = Object.fromEntries(sourcePaths.map(path => [path, sha(read(path))]));
const traceHash = 'b12d2eeebd281e3f4b041ba5467b2de768494866ad73024966e802bea12dcd2f';
const need = (condition, code) => { if (!condition) throw new Error('Retained acquisition evidence rejected: ' + code); };
const same = (a, b, code) => need(equal(a, b), code);
const integer = (n, max) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const clone = value => structuredClone(value);

// Python sort_keys compares Unicode code points. ensure_ascii emits lower-case
// UTF-16 escapes, including surrogate pairs for supplementary characters.
function unicodeOrder(a, b) {
  const left = [...a], right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const delta = left[i].codePointAt(0) - right[i].codePointAt(0); if (delta) return delta;
  }
  return left.length - right.length;
}
function canonical(input) {
  let nodes = 0;
  function encode(value, depth) {
    need(++nodes <= 200000 && depth <= 30, 'CANONICAL_BOUND');
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0), 'CANONICAL_INTEGER'); return String(value); }
    if (typeof value === 'string') {
      need(value.length <= 262144, 'CANONICAL_STRING');
      return JSON.stringify(value).replace(/[\u007f-\uffff]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
    }
    if (Array.isArray(value)) { need(value.length <= 4096, 'CANONICAL_ARRAY'); return '[' + value.map(item => encode(item, depth + 1)).join(',') + ']'; }
    need(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype, 'CANONICAL_OBJECT');
    const keys = Object.keys(value).sort(unicodeOrder); need(keys.length <= 128, 'CANONICAL_KEYS');
    return '{' + keys.map(key => encode(key, depth + 1) + ':' + encode(value[key], depth + 1)).join(',') + '}';
  }
  return encode(input, 0);
}
const digest = value => sha(canonical(value));
const requestKey = (method, params) => canonical([method, params]);
const sources = new Map(), groups = new Map();
for (const row of trace.rpc) {
  const match = /^collector\.(left|right)\.(number|hash)\.([0-9]+)$/.exec(row.label);
  if (!match) continue;
  const [branch, strategy] = match.slice(1), group = branch + ':' + strategy, key = requestKey(row.request.method, row.request.params);
  need(!sources.has(row.request.id), 'SOURCE_ID_UNIQUE');
  const raw = JSON.parse(row.raw_response);
  same(raw, row.response, 'SOURCE_RAW_RESPONSE');
  need(raw.id === row.request.id && raw.jsonrpc === '2.0' && Object.hasOwn(raw, 'result'), 'SOURCE_ENVELOPE');
  const source = { row, branch, strategy, key, result: raw.result, sha: digest(raw.result), bytes: canonical(raw.result).length };
  sources.set(row.request.id, source);
  if (!groups.has(group)) groups.set(group, { rows: [], requests: new Map() });
  const bucket = groups.get(group); bucket.rows.push(source);
  if (!bucket.requests.has(key)) bucket.requests.set(key, []);
  const prior = bucket.requests.get(key);
  need(prior.every(item => item.sha === source.sha), 'SOURCE_REPEATED_RESPONSE');
  prior.push(source);
}
const manifests = Object.fromEntries(['left', 'right'].map(branch => [branch, json('experiments/paid-reorg/manifest-' + branch + '.json')]));
const endpoint = branch => manifests[branch].end_block_hash;
const history = branch => trace.branches[branch].collectors.number.history;
const ready = (name, branch) => ({ name, expected: 'ready', branch, selected: branch, counts: [60, 87], error: null, stage: null });
const failed = (name, counts, stage = 'number', error = 'REJECTED', selected = 'left') =>
  ({ name, expected: 'unresolved', branch: null, selected, counts, error: 'ACQUISITION_SESSION_' + error, stage });
const specs = [
  ready('stable-left', 'left'),
  failed('ready-refresh-fails', [3, 0], 'number', 'REJECTED', 'right'),
  ready('ready-refresh-fresh-right', 'right'),
  ready('stable-right', 'right'),
  failed('before-initial-end', [3, 0]),
  failed('number-interior-switch', [34, 0]),
  failed('hash-interior-missing-recorded-orphan', [57, 4], 'hash'),
  failed('number-final-boundary-switch', [57, 0]),
  failed('hash-final-boundary-switch', [57, 84], 'hash'),
  failed('number-coordinator-final-switch', [60, 84], 'final_boundaries', 'FINAL_BOUNDARY'),
  failed('hash-coordinator-final-switch', [60, 87], 'final_boundaries', 'FINAL_BOUNDARY'),
  failed('selection-during-first-response', [1, 0], null, 'SUPERSEDED', 'right'),
  ready('selection-during-first-response-fresh-right', 'right'),
  failed('selection-before-final-return', [60, 87], null, 'SUPERSEDED', 'right'),
  ready('selection-before-final-return-fresh-right', 'right'),
  failed('selection-with-late-transport-error', [1, 0], null, 'REJECTED', 'right'),
  ready('selection-with-late-transport-error-fresh-right', 'right'),
  ...[1, 2, 3, 4].map(n => failed('bounded-failed-attempt-' + n, [3, 0])),
  failed('attempt-limit', [0, 0], null, 'ATTEMPT_LIMIT', 'right')
];
const triggers = {
  'before-initial-end': { strategy: 'number', phase: 'initial', end_occurrence: 1 },
  'number-interior-switch': { strategy: 'number', phase: 'interior', end_occurrence: null },
  'hash-interior-missing-recorded-orphan': { strategy: 'hash', phase: 'interior', end_occurrence: null },
  'number-final-boundary-switch': { strategy: 'number', phase: 'collector-final', end_occurrence: 2 },
  'hash-final-boundary-switch': { strategy: 'hash', phase: 'collector-final', end_occurrence: 2 },
  'number-coordinator-final-switch': { strategy: 'number', phase: 'coordinator-final', end_occurrence: 3 },
  'hash-coordinator-final-switch': { strategy: 'hash', phase: 'coordinator-final', end_occurrence: 3 },
  'selection-during-first-response': { strategy: 'number', after_response_call: 1, late_error: false },
  'selection-before-final-return': { strategy: 'hash', after_response_call: 87, late_error: false },
  'selection-with-late-transport-error': { strategy: 'number', after_response_call: 1, late_error: true }
};
const noLiveClaims = value => {
  need(value.replay_only === true && value.network_requests === 0 && value.new_live_node === false
    && value.authenticates_consensus === false, 'REPLAY_SCOPE');
};
function validateTransport(transport, caseName, expectedStrategy) {
  need(transport.schema === 'caw-paid-acquisition-replay/1' && transport.strategy === expectedStrategy, 'TRANSPORT_SCHEMA');
  noLiveClaims(transport); need(transport.independent_provider === false && transport.source_trace_sha256 === traceHash, 'TRANSPORT_TRUST');
  need(['left', 'right'].includes(transport.initial_branch) && ['left', 'right'].includes(transport.selected_branch), 'BRANCH');
  need(integer(transport.count, 512) && Array.isArray(transport.observations) && transport.observations.length === transport.count, 'OBSERVATION_COUNT');
  need(Array.isArray(transport.boundaries) && transport.boundaries.length <= 512 && Array.isArray(transport.switches) && transport.switches.length <= 16, 'METADATA_BOUND');
  let branch = transport.initial_branch, returned = 0, missing = 0, switchIndex = 0;
  const boundaries = [];
  let lastSwitch = 0;
  for (const event of transport.switches) {
    need(integer(event.before_call, transport.count + 1) && event.before_call >= 1
      && event.before_call >= lastSwitch && event.after_call === event.before_call - 1, 'SWITCH_POSITION');
    need(['left', 'right'].includes(event.from) && ['left', 'right'].includes(event.to) && event.from !== event.to
      && ['external', 'scheduled'].includes(event.source) && ['before_request', 'after_response'].includes(event.phase), 'SWITCH_SCHEMA');
    lastSwitch = event.before_call;
  }
  function applySwitches(call) {
    while (switchIndex < transport.switches.length && transport.switches[switchIndex].before_call <= call) {
      const event = transport.switches[switchIndex++]; need(event.from === branch, 'SWITCH_ANCESTRY'); branch = event.to;
    }
  }
  for (const [index, observation] of transport.observations.entries()) {
    need(observation.call === index + 1 && typeof observation.method === 'string' && Array.isArray(observation.params), 'OBSERVATION_SHAPE');
    applySwitches(observation.call); need(observation.selected_branch === branch, 'OBSERVATION_BRANCH');
    const bucket = groups.get(branch + ':' + expectedStrategy);
    const candidates = bucket.requests.get(requestKey(observation.method, observation.params)) ?? [];
    need(Array.isArray(observation.source_request_ids) && observation.source_request_ids.length <= 4, 'SOURCE_IDS');
    same(observation.source_request_ids, candidates.map(item => item.row.request.id), 'SOURCE_ID_BINDING');
    if (!candidates.length) {
      need(caseName === 'hash-interior-missing-recorded-orphan' && expectedStrategy === 'hash'
        && branch === 'right' && observation.call === transport.count && observation.call === 4, 'UNDOCUMENTED_MISSING_RESPONSE');
      need(observation.error === 'REPLAY_MISSING_RESPONSE' && observation.response_sha256 === null, 'MISSING_RESPONSE_MARKER');
      need(observation.method === 'eth_getBlockByHash', 'ORPHAN_QUERY');
      same(observation.params, [endpoint('left'), false], 'ORPHAN_HASH'); missing++;
      continue;
    }
    need(!Object.hasOwn(observation, 'error'), 'UNEXPECTED_REPLAY_ERROR');
    for (const id of observation.source_request_ids) {
      const source = sources.get(id);
      need(source && source.branch === branch && source.strategy === expectedStrategy
        && source.row.request.method === observation.method && equal(source.row.request.params, observation.params), 'SOURCE_REQUEST');
      need(source.sha === observation.response_sha256, 'SOURCE_RESULT_DIGEST');
    }
    const source = candidates[0]; returned += source.bytes;
    if (observation.method === 'eth_getBlockByNumber' && observation.params.length === 2 && observation.params[1] === false) {
      boundaries.push({ call: observation.call, requested_number: observation.params[0], selected_branch: branch,
        observed_number: source.result.number, observed_hash: source.result.hash });
    }
  }
  applySwitches(transport.count + 1); need(switchIndex === transport.switches.length && branch === transport.selected_branch, 'FINAL_REPLAY_BRANCH');
  same(transport.boundaries, boundaries, 'BOUNDARY_OBSERVATIONS');
  need(transport.returned_bytes === returned && returned <= 8 * 1024 * 1024, 'RETURNED_BYTES');
  const observed = [...transport.observations, ...transport.boundaries, ...transport.switches].reduce((sum, value) => sum + canonical(value).length, 0);
  need(transport.observed_bytes === observed && observed <= 256 * 1024, 'OBSERVED_BYTES');
  return { missing, returned };
}
function stableSequence(transport, branch) {
  const h = history(branch), expected = groups.get(branch + ':' + transport.strategy).rows.map(source => [source.row.request.method, source.row.request.params]);
  expected.push(['eth_chainId', []], ['eth_getBlockByNumber', [h.start_block.number, false]], ['eth_getBlockByNumber', [h.end_block.number, false]]);
  same(transport.observations.map(row => [row.method, row.params]), expected, 'COMPLETE_STABLE_QUERY_SEQUENCE');
  need(transport.initial_branch === branch && transport.selected_branch === branch && transport.switches.length === 0, 'STABLE_BRANCH');
  for (const header of [h.start_block, h.end_block]) {
    const reads = transport.boundaries.filter(row => row.requested_number === header.number);
    need(reads.length === 3 && reads.every(row => row.observed_hash === header.hash), 'THREE_BOUNDARY_OCCURRENCES');
  }
}
function validateReport(value) {
  need(value.schema === 'caw-paid-acquisition-race-check/1' && value.status === 'pass', 'REPORT_SCHEMA');
  noLiveClaims(value); need(value.independent_providers === false, 'PROVIDER_SCOPE');
  same(Object.keys(value.source_sha256).sort(), [...sourcePaths].sort(), 'SOURCE_PIN_SET');
  for (const path of sourcePaths) need(value.source_sha256[path] === sourceHashes[path], 'SOURCE_PIN');
  need(value.case_count === 22 && Array.isArray(value.cases) && value.cases.length === 22, 'CASE_COUNT');
  same(value.cases.map(row => row.name), specs.map(row => row.name), 'CASE_IDENTITIES');
  same(Object.keys(value.control_result_sha256).sort(), ['left', 'right'], 'CONTROL_SET');
  for (const branch of ['left', 'right']) need(value.control_result_sha256[branch] === digest(results[branch]), 'CONTROL_DIGEST');
  let missing = 0;
  for (const [index, row] of value.cases.entries()) {
    const spec = specs[index];
    need(row.status === 'pass' && row.expected === spec.expected && row.branch === spec.branch && row.error === spec.error, 'CASE_OUTCOME');
    need(row.before.status === 'unresolved' && row.after.status === spec.expected
      && row.selected_end_hash === endpoint(spec.selected), 'SELECTION_PUBLICATION');
    need(integer(row.before.calls, 1800) && integer(row.after.calls, 1800) && integer(row.after.response_bytes, 32 * 1024 * 1024)
      && integer(row.before.attempts, 4) && integer(row.after.attempts, 4)
      && integer(row.before.generation, 32) && integer(row.after.generation, 32), 'SESSION_BOUND');
    same(row.after.error, spec.stage === null ? null : { code: spec.error, stage: spec.stage }, 'FAILURE_STAGE');
    same(row.trigger ?? null, triggers[row.name] ?? null, 'CASE_TRIGGER');
    need(Array.isArray(row.transports) && row.transports.length === 2, 'TRANSPORT_COUNT');
    same(row.transports.map(item => item.count), spec.counts, 'CASE_REQUEST_COUNTS');
    for (const [offset, transport] of row.transports.entries()) missing += validateTransport(transport, row.name, offset === 0 ? 'number' : 'hash').missing;
    need(row.after.calls - row.before.calls === spec.counts[0] + spec.counts[1], 'SESSION_REQUEST_ACCOUNTING');
    need(row.after.attempts - row.before.attempts === (row.name === 'attempt-limit' ? 0 : 1), 'ATTEMPT_ACCOUNTING');
    if (spec.expected === 'ready') {
      need(row.result_sha256 === digest(results[spec.branch]), 'PUBLISHED_RESULT');
      row.transports.forEach(transport => stableSequence(transport, spec.branch));
      need(row.after.calls - row.before.calls === 147, 'FULL_RETRY');
    } else need(row.result_sha256 === null, 'PARTIAL_RESULT_PUBLISHED');
    if (row.name.startsWith('stable-')) need(row.detached_copies_and_consumed_tokens_checked === true, 'DETACHED_CHECK');
    if (triggers[row.name]?.phase) {
      const trigger = triggers[row.name], target = row.transports[trigger.strategy === 'number' ? 0 : 1];
      need(target.switches.length === 1 && target.switches[0].from === 'left' && target.switches[0].to === 'right', 'CONTROLLED_SWITCH');
      if (trigger.end_occurrence !== null) {
        const ends = target.boundaries.filter(item => item.requested_number === history('left').end_block.number);
        need(ends.length === trigger.end_occurrence && ends.at(-1).observed_hash === endpoint('right'), 'SWITCH_OCCURRENCE_REACHED');
        need(target.switches[0].before_call === ends.at(-1).call, 'SWITCH_AT_BOUNDARY');
      } else need(target.switches[0].before_call === 4, 'INTERIOR_SWITCH');
    }
    if (triggers[row.name]?.after_response_call) {
      const trigger = triggers[row.name], target = row.transports[trigger.strategy === 'number' ? 0 : 1];
      need(target.count === trigger.after_response_call && target.observations.at(-1).selected_branch === 'left'
        && row.after.generation === row.before.generation + 1 && row.after.error === null, 'NEW_SELECTION_SURVIVES_LATE_RETURN');
    }
  }
  need(missing === 1, 'EXPLICIT_SINGLE_REPLAY_MISS');
  return { cases: value.cases.length, missing, reexecutesPython: false, networkRequests: 0 };
}

test('canonical response digests match Python sorted compact ASCII JSON, including non-ASCII text', () => {
  assert.equal(canonical({ z: 'é😀\n', a: '\u007f' }), '{"a":"\\u007f","z":"\\u00e9\\ud83d\\ude00\\n"}');
  assert.equal(canonical({ '\u{10000}': 2, '\ue000': 1 }), '{"\\ue000":1,"\\ud800\\udc00":2}');
});

test('every retained replay observation binds to exact original collector requests and result bytes', () => {
  assert.equal(sourceHashes['experiments/paid-reorg/execution-trace.json'], traceHash);
  assert.deepEqual(validateReport(report), { cases: 22, missing: 1, reexecutesPython: false, networkRequests: 0 });
});

test('stable left/right results match both unchanged JavaScript rebuilds and retained Python outputs', () => {
  for (const branch of ['left', 'right']) for (const strategy of ['number', 'hash']) {
    const h = json('experiments/paid-reorg/history-' + branch + '-' + strategy + '.json');
    const python = json('experiments/paid-reorg/reconstruction-python-' + branch + '-' + strategy + '.json');
    assert.ok(equal(results[branch], reconstruct(h, manifests[branch])), 'complete JavaScript result');
    assert.ok(equal(results[branch], python), 'complete retained Python result');
    assert.ok(equal(results[branch].messages.map(item => item.text_hex), python.messages.map(item => item.text_hex)), 'exact message bytes');
  }
  assert.notEqual(results.left.messages[1].text_hex, results.right.messages[1].text_hex);
  assert.equal(results.left.messages[1].id, results.right.messages[1].id);
});

test('fresh retries and ready-state refresh retain cumulative work while publishing a full selected R rebuild', () => {
  const byName = new Map(report.cases.map(row => [row.name, row]));
  for (const name of ['selection-during-first-response', 'selection-before-final-return', 'selection-with-late-transport-error']) {
    const failed = byName.get(name), fresh = byName.get(name + '-fresh-right');
    assert.equal(fresh.before.calls, failed.after.calls); assert.equal(fresh.before.attempts, failed.after.attempts);
    assert.equal(fresh.before.generation, failed.after.generation);
    assert.equal(fresh.after.calls - fresh.before.calls, 147); assert.equal(fresh.selected_end_hash, endpoint('right'));
    assert.equal(fresh.result_sha256, digest(results.right));
  }
  const left = byName.get('stable-left'), failed = byName.get('ready-refresh-fails'), fresh = byName.get('ready-refresh-fresh-right');
  assert.equal(failed.before.calls, left.after.calls); assert.equal(failed.before.status, 'unresolved');
  assert.equal(failed.before.generation, left.after.generation + 1);
  assert.equal(failed.result_sha256, null); assert.equal(failed.selected_end_hash, endpoint('right'));
  assert.equal(fresh.before.calls, failed.after.calls); assert.equal(fresh.before.generation, failed.after.generation + 1);
  assert.equal(fresh.after.calls - fresh.before.calls, 147);
});

test('the retained limit cases stop before a fifth attempt and preserve finite cumulative counters', () => {
  for (let n = 1; n <= 4; n++) {
    const row = report.cases.find(item => item.name === 'bounded-failed-attempt-' + n);
    assert.equal(row.after.attempts, n); assert.equal(row.after.calls, n * 3);
    assert.equal(row.after.generation, n);
  }
  const stopped = report.cases.find(item => item.name === 'attempt-limit');
  assert.equal(stopped.error, 'ACQUISITION_SESSION_ATTEMPT_LIMIT');
  assert.equal(stopped.before.calls, 12); assert.equal(stopped.after.calls, 12);
  assert.equal(stopped.before.attempts, 4); assert.equal(stopped.after.attempts, 4);
  assert.ok(report.additional_checks.includes('KeyboardInterrupt and SystemExit retire the active token'));
  assert.ok(report.limitations.includes('call/byte/deadline constants are caps, not all exhausted by these fixtures'));
  assert.ok(report.limitations.includes('unobserved ABA and changes after the last read may escape detection'));
});

for (const [name, mutate] of [
  ['changed response digest', value => { value.cases[0].transports[0].observations[0].response_sha256 = '0'.repeat(64); }],
  ['writer request ID substituted for collector evidence', value => { value.cases[0].transports[0].observations[0].source_request_ids = [trace.rpc.find(row => !row.label.startsWith('collector.')).request.id]; }],
  ['wrong selected branch', value => { value.cases[0].transports[0].observations[0].selected_branch = 'right'; }],
  ['changed request parameters', value => { value.cases[0].transports[0].observations[1].params[0] = '0x3'; }],
  ['false passing outcome for a failed replacement', value => { value.cases[1].expected = 'ready'; }],
  ['missing final coordinator read', value => { value.cases[0].transports[1].observations.pop(); }],
  ['invented source response for the missing orphan query', value => {
    const row = value.cases.find(item => item.name === 'hash-interior-missing-recorded-orphan').transports[1].observations.at(-1);
    row.response_sha256 = '0'.repeat(64); row.source_request_ids = [221];
  }],
  ['stale source pin', value => { value.source_sha256['reference/paid_acquisition_session.py'] = '0'.repeat(64); }],
  ['edited retained control digest', value => { value.control_result_sha256.right = '0'.repeat(64); }]
]) {
  test('retained evidence rejects ' + name, () => {
    const changed = clone(report); mutate(changed);
    assert.throws(() => validateReport(changed), /Retained acquisition evidence rejected:/);
  });
}

