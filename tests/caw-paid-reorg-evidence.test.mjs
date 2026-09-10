import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReorgEvidence } from '../reference/paid-reorg-evidence.mjs';

const read = name => JSON.parse(readFileSync(new URL('../experiments/paid-reorg/' + name, import.meta.url)));
const trace = read('execution-trace.json');
const input = { histories: {}, manifests: {} };
for (const branch of ['left', 'right']) {
  input.histories[branch] = Object.fromEntries(['number', 'hash'].map(name => [name, read(`history-${branch}-${name}.json`)]));
  input.manifests[branch] = read(`manifest-${branch}.json`);
}
test('controlled branch capture binds all four acquisitions to retained raw RPC', () => {
  const report = validateReorgEvidence(trace, input);
  assert.equal(report.discardedBlocks, 5);
  assert.equal(report.selectedBlocks, 5);
  assert.equal(report.independentProviders, false);
  assert.equal(report.authenticatesConsensus, false);
});
test('branch capture rejects a changed collector response even with edited raw JSON', () => {
  const changed = structuredClone(trace);
  const row = changed.rpc.find(row => row.label.startsWith('collector.right.number.') && row.request.method === 'eth_getTransactionReceipt');
  row.response.result.gasUsed = '0x1';
  row.raw_response = JSON.stringify(row.response);
  assert.throws(() => validateReorgEvidence(changed, input), /rejected/i);
});
test('branch capture rejects removed requests and a changed snapshot receipt', () => {
  const removed = structuredClone(trace); removed.rpc.splice(4, 1);
  assert.throws(() => validateReorgEvidence(removed, input), /rejected/i);
  const changed = structuredClone(trace); changed.ancestor.snapshot = '0xffff';
  assert.throws(() => validateReorgEvidence(changed, input), /rejected/i);
});
test('branch capture rejects a read phase crossing the restore and wrong selected manifest', () => {
  const changed = structuredClone(trace); changed.phases[2].after_request_id++;
  assert.throws(() => validateReorgEvidence(changed, input), /rejected/i);
  assert.throws(() => validateReorgEvidence(trace, { ...input, manifests: { ...input.manifests, right: input.manifests.left } }), /rejected/i);
});
test('branch capture binds coordinated before/after state edits to observed getters', () => {
  const changed = structuredClone(trace);
  changed.orphan_rejection.before.credits[0] = changed.orphan_rejection.after.credits[0] = '1';
  assert.throws(() => validateReorgEvidence(changed, input), /rejected/i);
});
test('branch capture binds ancestor and failed-call summaries to their raw observations', () => {
  const changed = structuredClone(trace); changed.ancestor.state.nonces[0] = '99';
  assert.throws(() => validateReorgEvidence(changed, input), /rejected/i);
  const error = structuredClone(trace); error.orphan_rejection.dry_response.error.data = '0x00000000';
  assert.throws(() => validateReorgEvidence(error, input), /rejected/i);
});
