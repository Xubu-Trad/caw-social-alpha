// Offline consistency checks for one retained controlled branch experiment.
// The original acquisition validator is reused through explicit phase views.
// These derived views are not additional runs or evidence of separate nodes.
import { isDeepStrictEqual as equal } from 'node:util';
import { validateAcquisitionEvidence } from './paid-acquisition-evidence.mjs';
import { keccak256Hex } from './keccak256.mjs';

const need = (condition, code) => { if (!condition) throw new Error('Reorg evidence rejected: ' + code); };
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
const MANIFEST = ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash'];

/** Supplied, bounded plain JSON only; no transport or consensus authentication. */
export function validateReorgEvidence(trace, { histories, manifests }) {
  need(trace?.schema === 'caw-paid-reorg-run/1' && trace.status === 'pass', 'completed run');
  need(trace.selected_branch === 'right' && trace.selection_policy === 'explicit local fixture checkpoint'
    && trace.independent_providers === false && trace.authenticates_consensus === false, 'selection scope');
  need(trace.ancestor_restored_exactly === true && trace.retired_left_lease_refused_before_transport === true
    && trace.closed_right_lease_refused_before_transport === true && trace.source_pins_unchanged_after_run === true, 'controller checks');
  need(trace.owned_listener_released === true && trace.node?.stop_reason === null, 'cleanup');
  need(Array.isArray(trace.rpc) && trace.rpc.length > 0 && trace.rpc.length <= 1800
    && trace.rpc.length === trace.node.local_request_count, 'complete bounded trace');
  for (const [index, row] of trace.rpc.entries()) {
    need(row.request?.jsonrpc === '2.0' && row.request.id === index + 1
      && row.response?.jsonrpc === '2.0' && row.response.id === index + 1, 'RPC identity');
    need(typeof row.raw_response === 'string' && Buffer.byteLength(row.raw_response) <= 1024 * 1024
      && equal(JSON.parse(row.raw_response), row.response) && row.transport_error === undefined, 'raw response binding');
  }
  const phases = ['prefix', 'write-left', 'read-left', 'switch-at-ancestor', 'write-right', 'read-right', 'closed'];
  need(Array.isArray(trace.phases) && trace.phases.length === phases.length - 1, 'phase count');
  for (const [i, phase] of trace.phases.entries()) {
    need(phase.from === phases[i] && phase.to === phases[i + 1]
      && Number.isSafeInteger(phase.after_request_id) && phase.after_request_id > 0
      && phase.after_request_id <= trace.rpc.length
      && (!i || phase.after_request_id >= trace.phases[i - 1].after_request_id), 'phase sequence');
  }
  const snapshots = trace.rpc.filter(row => row.request.method === 'evm_snapshot');
  const restores = trace.rpc.filter(row => row.request.method === 'evm_revert');
  need(snapshots.length === 1 && restores.length === 1
    && snapshots[0].label === 'controller.snapshot' && snapshots[0].response.result === trace.ancestor.snapshot
    && snapshots[0].request.id === trace.phases[0].after_request_id
    && restores[0].label === 'controller.restore' && equal(restores[0].request.params, [trace.ancestor.snapshot])
    && restores[0].response.result === true && restores[0].request.id === trace.phases[3].after_request_id
    && restores[0].request.id === trace.phases[2].after_request_id + 1, 'one controlled restore');
  const ancestorRows = trace.rpc.filter(row => ['prefix.ancestor', 'right.restored_ancestor'].includes(row.label));
  need(ancestorRows.length === 2 && ancestorRows.every(row => equal(row.response.result, trace.ancestor.header)), 'observed ancestor equality');
  const word = value => BigInt(value).toString(16).padStart(64, '0');
  const selector = signature => keccak256Hex('0x' + Buffer.from(signature, 'ascii').toString('hex')).slice(0, 10);
  function observation(label, method, params) {
    const matches = trace.rpc.filter(row => row.label === label);
    need(matches.length === 1 && matches[0].request.method === method && equal(matches[0].request.params, params), 'named observation');
    return matches[0];
  }
  function stateObservations(prefix, state) {
    const addresses = trace.branches.right.config.addresses, ids = [];
    function getter(suffix, target, signature, args, expected) {
      const transaction = { from: '0x00000000000000000000000000000000ca180001', to: target,
        gas: '0x3d0900', gasPrice: '0x174876e800', value: '0x0', data: selector(signature) + args.map(word).join('') };
      const row = observation(prefix + '.' + suffix, 'eth_call', [transaction, 'latest']);
      need(row.response.result === '0x' + expected.map(word).join(''), 'state summary bound to observed getter');
      ids.push(row.request.id);
    }
    for (let i = 0; i < 3; i++) {
      getter('auth' + (i + 1), addresses.registry, 'authority(uint256)', [i + 1], [state.owners[i], state.epochs[i]]);
      for (const field of ['credits', 'stakes', 'nonces']) getter(field + (i + 1), addresses.probe, field + '(uint256)', [i + 1], [state[field][i]]);
    }
    for (const field of ['totalCredits', 'poolDust', 'messageCount']) getter(field, addresses.probe, field + '()', [], [state[field]]);
    getter('balance', addresses.token, 'balanceOf(address)', [addresses.probe], [state.tokenBalance]);
    return { first: Math.min(...ids), last: Math.max(...ids) };
  }
  const prefixState = stateObservations('prefix.ancestor_state', trace.ancestor.state);
  const restoredState = stateObservations('right.restored_state', trace.ancestor.state);
  need(prefixState.first > ancestorRows[0].request.id && prefixState.last < snapshots[0].request.id
    && restoredState.first > restores[0].request.id, 'ancestor observation order');
  need(trace.rpc.filter(row => row.request.method === 'eth_sendTransaction').length === trace.node.local_transaction_attempts, 'submitted transaction count');
  const report = {};
  for (const branch of ['left', 'right']) {
    const capture = trace.branches?.[branch], handoff = capture?.handoff;
    need(capture && handoff && handoff.writer_deleted === true && handoff.writer_trace_read_by_collectors === false
      && handoff.frontend_started === false && handoff.indexer_started === false
      && handoff.writes_sealed_for_phase === true && handoff.direct_write_refused_before_transport === true, 'read phase handoff');
    need(equal(pick(capture.config, MANIFEST), manifests[branch]), 'explicit branch trust');
    const number = capture.collectors.number, hash = capture.collectors.hash;
    const first = handoff.first_read_only_request_id, last = hash.last_request_id;
    need(Number.isSafeInteger(first) && Number.isSafeInteger(last) && first > 1 && last <= trace.rpc.length
      && number.first_request_id === first && number.last_request_id + 1 === hash.first_request_id
      && number.last_request_id - first + 1 === number.request_count
      && last - hash.first_request_id + 1 === hash.request_count, 'sequential collector intervals');
    const phaseStart = branch === 'left' ? 1 : 4, phaseEnd = branch === 'left' ? 2 : 5;
    need(trace.phases[phaseStart].after_request_id === first - 1 && trace.phases[phaseEnd].after_request_id === last, 'phase request boundaries');
    for (const name of ['number', 'hash']) {
      const c = capture.collectors[name];
      for (let id = c.first_request_id; id <= c.last_request_id; id++) {
        need(trace.rpc[id - 1].label === `collector.${branch}.${name}.${id - c.first_request_id}`, 'collector request identity');
      }
      // Number acquisition also fetches the exclusive checkpoint's receipts,
      // which are outside the reader's accounting interval. Check their gas
      // coverage too; history-byte comparison cannot cover that extra block.
      const h = histories[branch][name], calls = trace.rpc.slice(c.first_request_id - 1, c.last_request_id);
      const headers = [...(name === 'number' ? [h.start_block] : []), ...h.blocks.map(block => block.header)];
      for (const header of headers) {
        const receipts = calls.filter(row => row.request.method === 'eth_getTransactionReceipt'
          && row.response.result?.blockHash === header.hash).map(row => row.response.result);
        need(receipts.length === header.transactions.length, 'receipt gas coverage');
        let cumulative = 0n;
        for (const [index, hash] of header.transactions.entries()) {
          const matches = receipts.filter(receipt => receipt.transactionHash === hash);
          need(matches.length === 1, 'unique receipt gas coverage');
          const receipt = matches[0], used = BigInt(receipt.gasUsed);
          need(used > 0n && used <= 4000000n && BigInt(receipt.transactionIndex) === BigInt(index), 'receipt gas bound');
          cumulative += used;
          need(BigInt(receipt.cumulativeGasUsed) === cumulative, 'cumulative receipt gas');
        }
        need(cumulative === BigInt(header.gasUsed), 'complete block gas');
      }
    }
    // Reuse the unchanged alpha.22 validator on a prefix ending at this read
    // phase. Earlier phases retain exact requests/responses/IDs but get neutral
    // labels, so they cannot satisfy this phase's acquisition coverage. Only
    // metadata describing the projected interval is adjusted; no RPC is added.
    const projection = {
      schema: 'caw-paid-acquisition-run/1', status: 'pass', config: capture.config,
      node: { ...trace.node, local_request_count: last }, owned_listener_released: trace.owned_listener_released,
      handoff: { ...handoff, writes_sealed: true, write_refused: true }, collectors: capture.collectors,
      rpc: trace.rpc.slice(0, last).map(row => ({ ...row, label: row.request.id < first
        ? 'observed.prephase.' + row.request.id : row.label.replace('collector.' + branch + '.', 'collector.') }))
    };
    report[branch] = validateAcquisitionEvidence(projection, { histories: histories[branch], manifest: manifests[branch] });
  }
  need(trace.phases.at(-1).after_request_id === trace.rpc.length, 'no request after close');
  const l = histories.left.number, r = histories.right.number, ancestor = trace.ancestor.header;
  need(l.end_block.number === r.end_block.number && l.end_block.hash !== r.end_block.hash, 'equal height distinct tips');
  let common = 0;
  while (common < Math.min(l.blocks.length, r.blocks.length) && equal(l.blocks[common], r.blocks[common])) common++;
  need(common > 0 && equal(l.blocks[common - 1].header, ancestor)
    && l.blocks.length - common === 5 && r.blocks.length - common === 5, 'shared ancestor and five-block suffixes');
  const rejected = trace.orphan_rejection;
  need(rejected?.receipt.status === '0x0' && equal(rejected.receipt.logs, [])
    && equal(rejected.before, rejected.after), 'failed post preserves accounting');
  const before = stateObservations('right.orphan_rejected.before', rejected.before);
  const after = stateObservations('right.orphan_rejected.after', rejected.after);
  const dry = observation('right.orphan_rejected.dry', 'eth_call', [rejected.transaction, 'latest']);
  const sent = observation('right.orphan_rejected.send', 'eth_sendTransaction', [rejected.transaction]);
  need(equal(dry.response, rejected.dry_response) && dry.response.error?.data === selector('InvalidSignature()')
    && sent.response.result === rejected.receipt.transactionHash
    && restoredState.last < before.first && before.last < dry.request.id && dry.request.id < sent.request.id
    && sent.request.id < after.first, 'observed failed post and state order');
  // The Python oracle separately binds the exact left/right transaction data.
  // Here bind the retained rejection to the complete selected history itself.
  need(r.blocks.some(block => block.transactions.some(tx => equal(tx.receipt, rejected.receipt)
    && equal(tx.transaction, { to: null, ...rejected.transaction }))), 'failed receipt included in selected history');
  return { ...report, commonBlocks: common, discardedBlocks: 5, selectedBlocks: 5,
    sharedNode: true, sharedTransport: true, independentProviders: false, authenticatesConsensus: false };
}
