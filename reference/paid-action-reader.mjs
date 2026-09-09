// Original offline consumer of the fixed paid-action experiment's block logs.
// No writer, model, harness or application canonicalization imports. Capture
// endpoints and runtime hashes are supplied as separate trust; this is not a
// block-header/receipt-trie proof, signature verifier or live authority source.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { keccak256Hex } from './keccak256.mjs';

const MAX = (1n << 256n) - 1n;
const ZERO = '0x' + '00'.repeat(20);
const TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452';
const FEE = 5000000000000000000000n;
const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, nodes: 100000, blocks: 512, transactions: 256, logs: 2048 });
const word = value => BigInt(value).toString(16).padStart(64, '0');
const hexUtf8 = text => '0x' + Buffer.from(text, 'utf8').toString('hex');
const digest = text => keccak256Hex(hexUtf8(text));
const SIG = Object.freeze({
  transfer: digest('Transfer(address,address,uint256)'),
  approval: digest('Approval(address,address,uint256)'),
  operator: digest('ApprovalForAll(address,address,bool)'),
  deposit: digest('Deposited(uint256,address,uint256,uint256,uint256)'),
  withdraw: digest('Withdrawn(uint256,address,uint256,uint256,uint256)'),
  stake: digest('Staked(uint256,address,uint256,uint256,uint256)'),
  unstake: digest('Unstaked(uint256,address,uint256,uint256,uint256)'),
  post: digest('Posted(uint256,uint256,address,uint256,uint256,bytes,uint256,bytes32,uint256,uint256,uint256,uint256)')
});
const CALL = Object.freeze(Object.fromEntries(['deposit', 'withdraw', 'stake', 'unstake'].map(name => [name, digest(name + '(uint256,uint256,uint256)').slice(0, 10)])));
const POST_CALL = digest('post((uint256,uint256,uint256,uint256,uint256,bytes32,bytes),bytes)').slice(0, 10);
function fail(code) {
  const error = new Error('Paid history rejected: ' + code + '.');
  error.code = 'PAID_HISTORY_' + code;
  throw error;
}
function need(condition, code) { if (!condition) fail(code); }

// Descriptor-only capture rejects accessors and exotic objects. Hostile Proxy
// traps and modified native built-ins are outside this plain-data boundary.
function capture(input) {
  let nodes = 0, bytes = 0;
  function copy(value, depth) {
    bytes += 8; need(++nodes <= LIMITS.nodes && depth <= 12 && bytes <= LIMITS.bytes, 'LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0), 'INTEGER'); return value; }
    if (typeof value === 'string') {
      need(value.length <= 262144, 'LIMIT'); bytes += Buffer.byteLength(value, 'utf8'); need(bytes <= LIMITS.bytes, 'LIMIT');
      need(value.isWellFormed(), 'UNICODE'); return value;
    }
    need(value !== null && typeof value === 'object', 'SCHEMA');
    const isArray = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    need(isArray ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'SCHEMA');
    if (isArray) {
      const descriptor = Object.getOwnPropertyDescriptor(value, 'length');
      need(descriptor && Object.hasOwn(descriptor, 'value') && Number.isSafeInteger(descriptor.value) && descriptor.value <= 2048, 'LIMIT');
      const keys = Reflect.ownKeys(value); need(keys.length === descriptor.value + 1, 'SCHEMA');
      const result = [];
      for (let i = 0; i < descriptor.value; i++) {
        const entry = Object.getOwnPropertyDescriptor(value, String(i));
        need(entry && entry.enumerable && Object.hasOwn(entry, 'value'), 'SCHEMA'); result.push(copy(entry.value, depth + 1));
      }
      return result;
    }
    const keys = Reflect.ownKeys(value); need(keys.length <= 64 && keys.every(key => typeof key === 'string' && key.length <= 96), 'SCHEMA');
    const result = Object.create(null);
    for (const key of keys) {
      bytes += Buffer.byteLength(key, 'utf8'); need(bytes <= LIMITS.bytes, 'LIMIT');
      const entry = Object.getOwnPropertyDescriptor(value, key);
      need(entry.enumerable && Object.hasOwn(entry, 'value'), 'SCHEMA'); result[key] = copy(entry.value, depth + 1);
    }
    return result;
  }
  return copy(input, 0);
}
function fields(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]);
  need(keys.every(key => allowed.has(key)) && required.every(key => Object.hasOwn(value, key)), 'SCHEMA');
}
function address(value, allowZero = false) { need(typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value) && (allowZero || value !== ZERO), 'ADDRESS'); return value; }
function data(value, max = 65536, exact = null) {
  need(typeof value === 'string' && value.length <= 2 + max * 2 && /^0x(?:[0-9a-f]{2})*$/.test(value), 'HEX');
  if (exact !== null) need(value.length === 2 + exact * 2, 'HEX'); return value;
}
function hash(value) { return data(value, 32, 32); }
function decimal(value) { need(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value), 'DECIMAL'); const n = BigInt(value); need(n <= MAX, 'INTEGER'); return n; }
function quantity(value) { need(typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/.test(value), 'QUANTITY'); return BigInt(value); }
function receiptTimestamp(value) {
  const n = typeof value === 'number'
    ? (need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'RECEIPT'), BigInt(value))
    : quantity(value);
  need(n <= BigInt(Number.MAX_SAFE_INTEGER), 'RECEIPT'); return n;
}
function constructorTail(value) {
  need(value.length > 130, 'CONSTRUCTOR');
  return ['0x' + value.slice(-128, -64), '0x' + value.slice(-64)];
}
function words(value, count) {
  data(value, count * 32, count * 32);
  return Array.from({ length: count }, (_, i) => BigInt('0x' + value.slice(2 + i * 64, 66 + i * 64)));
}
function topicAddress(value) { hash(value); need(/^0x0{24}[0-9a-f]{40}$/.test(value), 'ADDRESS'); return '0x' + value.slice(-40); }
function account(value) { need(value >= 1n && value <= 3n, 'ACCOUNT'); return Number(value - 1n); }
function plus(value, delta) { const next = value + delta; need(next >= 0n && next <= MAX, 'ACCOUNTING'); return next; }
function utf8(value) {
  data(value, 1680); const bytes = Buffer.from(value.slice(2), 'hex'); let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { fail('TEXT'); }
  need(Buffer.from(text, 'utf8').equals(bytes), 'TEXT');
  need([...text].length >= 1 && [...text].length <= 420, 'TEXT'); return text;
}
function frozen(value) { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; }
const HEADER_REQUIRED = ['hash', 'parentHash', 'number', 'timestamp', 'transactions', 'gasUsed', 'gasLimit'];
const HEADER_OPTIONAL = ['sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot', 'receiptsRoot', 'logsBloom', 'difficulty', 'totalDifficulty', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas', 'withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot', 'requestsHash', 'size', 'uncles', 'withdrawals'];
function header(value) {
  fields(value, HEADER_REQUIRED, HEADER_OPTIONAL); hash(value.hash); hash(value.parentHash);
  const number = quantity(value.number), time = quantity(value.timestamp), gasUsed = quantity(value.gasUsed), gasLimit = quantity(value.gasLimit);
  need(gasUsed <= gasLimit && Array.isArray(value.transactions) && value.transactions.length <= LIMITS.transactions, 'HEADER');
  value.transactions.forEach(hash); need(new Set(value.transactions).size === value.transactions.length, 'HEADER');
  for (const key of ['sha3Uncles', 'stateRoot', 'transactionsRoot', 'receiptsRoot', 'mixHash', 'withdrawalsRoot', 'parentBeaconBlockRoot', 'requestsHash']) if (value[key] !== undefined && value[key] !== null) hash(value[key]);
  for (const key of ['difficulty', 'totalDifficulty', 'baseFeePerGas', 'blobGasUsed', 'excessBlobGas', 'size']) if (value[key] !== undefined && value[key] !== null) quantity(value[key]);
  if (value.miner !== undefined) address(value.miner, true);
  if (value.logsBloom !== undefined) data(value.logsBloom, 256, 256);
  if (value.extraData !== undefined) data(value.extraData, 32768);
  if (value.nonce !== undefined) data(value.nonce, 8, 8);
  if (value.uncles !== undefined) { need(Array.isArray(value.uncles), 'HEADER'); value.uncles.forEach(hash); }
  if (value.withdrawals !== undefined) need(Array.isArray(value.withdrawals), 'HEADER');
  return { number, time, gasUsed, gasLimit };
}

function abiWord(bytes, offset) {
  need(Number.isSafeInteger(offset) && offset >= 0 && offset + 32 <= bytes.length, 'ABI');
  return BigInt('0x' + bytes.subarray(offset, offset + 32).toString('hex'));
}
function abiBytes(bytes, offset, maximum) {
  const length = abiWord(bytes, offset); need(length <= BigInt(maximum), 'ABI');
  const size = Number(length), end = offset + 32 + size, padded = offset + 32 + Math.ceil(size / 32) * 32;
  need(padded <= bytes.length && bytes.subarray(end, padded).every(value => value === 0), 'ABI');
  return { hex: '0x' + bytes.subarray(offset + 32, end).toString('hex'), padded };
}
function postEvent(value) {
  data(value, 2048); const bytes = Buffer.from(value.slice(2), 'hex');
  need(abiWord(bytes, 64) === 288n, 'ABI');
  const text = abiBytes(bytes, 288, 1680); need(text.padded === bytes.length, 'ABI'); utf8(text.hex);
  return { epoch: abiWord(bytes, 0), nonce: abiWord(bytes, 32), text: text.hex,
    fee: abiWord(bytes, 96), distribution: '0x' + bytes.subarray(128, 160).toString('hex'),
    allocations: [160, 192, 224].map(offset => abiWord(bytes, offset)), dust: abiWord(bytes, 256) };
}
function postCall(value) {
  data(value, 8192); need(value.slice(0, 10) === POST_CALL, 'CALLDATA');
  const bytes = Buffer.from(value.slice(10), 'hex'); need(abiWord(bytes, 0) === 64n, 'ABI');
  need(abiWord(bytes, 256) === 224n, 'ABI');
  const text = abiBytes(bytes, 288, 1680); need(abiWord(bytes, 32) === BigInt(text.padded), 'ABI');
  const signature = abiBytes(bytes, text.padded, 4096); need(signature.padded === bytes.length, 'ABI');
  return { id: abiWord(bytes, 64), epoch: abiWord(bytes, 96), nonce: abiWord(bytes, 128),
    validAfter: abiWord(bytes, 160), deadline: abiWord(bytes, 192),
    distribution: '0x' + bytes.subarray(224, 256).toString('hex'), text: text.hex };
}
const FINAL_FIELDS = ['owners', 'epochs', 'credits', 'stakes', 'nonces', 'totalCredits', 'poolDust', 'messageCount', 'tokenBalance'];
const RECEIPT_FIELDS = ['status', 'cumulativeGasUsed', 'logs', 'transactionHash', 'transactionIndex', 'blockHash', 'blockNumber', 'gasUsed', 'from', 'to', 'contractAddress'];
const RECEIPT_OPTIONAL = ['type', 'logsBloom', 'effectiveGasPrice', 'blobGasPrice', 'blobGasUsed', 'blockTimestamp'];
const LOG_FIELDS = ['address', 'topics', 'data', 'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'];

/** Reconstruct the fixed experiment only. The manifest is external trust, not
 * authenticated consensus, receipt-trie proof, signature checking or freshness.
 * Runtime hashes and constructor-tail consistency do not authenticate execution
 * of the creation bytecode or prove its resulting constructor state. */
export function reconstruct(historyInput, manifestInput) {
  need(arguments.length === 2, 'SCHEMA');
  const h = capture(historyInput), manifest = capture(manifestInput);
  fields(h, ['schema', 'chain_id', 'addresses', 'registry_runtime', 'probe_runtime', 'start_block', 'end_block', 'blocks', 'final']);
  fields(manifest, ['chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash']);
  need(h.schema === 'caw-paid-history/1' && h.chain_id === 31337 && manifest.chain_id === h.chain_id, 'CONTEXT');
  for (const value of [h.addresses, manifest.addresses]) {
    fields(value, ['registry', 'probe', 'token']); Object.values(value).forEach(item => address(item));
    need(new Set(Object.values(value)).size === 3 && value.token === TOKEN, 'CONTEXT');
  }
  for (const key of ['registry', 'probe', 'token']) need(h.addresses[key] === manifest.addresses[key], 'CONTEXT');
  for (const name of ['registry', 'probe']) {
    const code = data(h[name + '_runtime']); need(code.length > 2, 'RUNTIME');
    const expected = manifest[name + '_runtime_sha256']; need(typeof expected === 'string' && /^[0-9a-f]{64}$/.test(expected), 'RUNTIME');
    need(createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex') === expected, 'RUNTIME');
  }
  hash(manifest.start_block_hash); hash(manifest.end_block_hash);
  const start = header(h.start_block), end = header(h.end_block);
  need(h.start_block.hash === manifest.start_block_hash && h.end_block.hash === manifest.end_block_hash, 'ENDPOINT');
  need(Array.isArray(h.blocks) && h.blocks.length >= 1 && h.blocks.length <= LIMITS.blocks, 'LIMIT');
  need(end.number - start.number === BigInt(h.blocks.length), 'CONTINUITY');
  fields(h.final, FINAL_FIELDS);
  const reg = h.addresses.registry, probe = h.addresses.probe;
  const owners = [null, null, null], epochs = [0n, 0n, 0n], credits = [0n, 0n, 0n], stakes = [0n, 0n, 0n], nonces = [0n, 0n, 0n];
  let totalCredits = 0n, poolDust = 0n, messageCount = 0n, tokenBalance = 0n;
  let registryCreated = false, probeCreated = false, transactionCount = 0, logCount = 0;
  let mintOwners = null;
  let previousHeader = h.start_block, previous = start;
  const messages = [], blockHashes = new Set([h.start_block.hash]), transactionHashes = new Set();
  function invariant() {
    need(credits.reduce((a, b) => a + b, 0n) === totalCredits, 'ACCOUNTING');
    need(totalCredits + poolDust <= MAX && tokenBalance >= totalCredits + poolDust, 'BACKING');
    need(stakes.every((amount, id) => amount <= credits[id] && amount <= MAX / FEE), 'STAKE');
  }
  function authority(id, owner, epoch) { need(owners[id] === owner && epochs[id] === epoch, 'AUTHORITY'); }
  function processLogs(logs, tx, receipt, blockTime) {
    let probeEvents = 0; const movements = [];
    for (const [logOffset, entry] of logs.entries()) {
      const topics = entry.topics, sig = topics[0];
      if (entry.address === TOKEN) {
        need(topics.length === 3 && (sig === SIG.transfer || sig === SIG.approval), 'TOKEN_EVENT');
        const from = topicAddress(topics[1]), to = topicAddress(topics[2]), amount = words(entry.data, 1)[0];
        if (sig === SIG.transfer && (from === probe || to === probe)) {
          need(probeCreated, 'ORDER');
          if (from === probe) tokenBalance = plus(tokenBalance, -amount);
          if (to === probe) tokenBalance = plus(tokenBalance, amount);
          movements.push({ from, to, amount, consumed: false });
        }
        continue;
      }
      if (entry.address === reg) {
        need(registryCreated && tx.to !== probe, 'ORDER');
        if (sig === SIG.operator) {
          need(topics.length === 3, 'REGISTRY_EVENT'); topicAddress(topics[1]); topicAddress(topics[2]); need(words(entry.data, 1)[0] <= 1n, 'REGISTRY_EVENT');
        } else {
          need(topics.length === 4 && (sig === SIG.transfer || sig === SIG.approval) && entry.data === '0x', 'REGISTRY_EVENT');
          const from = topicAddress(topics[1]), to = topicAddress(topics[2]), id = account(BigInt(topics[3]));
          if (sig === SIG.approval) { need(owners[id] === from, 'AUTHORITY'); continue; }
          need(to !== ZERO, 'REGISTRY_EVENT');
          if (from === ZERO) {
            need(receipt.contractAddress === reg && owners[id] === null && owners.filter(value => value !== null).length === id, 'MINT');
            need(mintOwners !== null && mintOwners[id] === to, 'CONSTRUCTOR'); owners[id] = to;
          } else {
            need(owners[id] === from, 'AUTHORITY');
            const clearing = logs[logOffset - 1];
            need(clearing && clearing.address === reg && clearing.topics.length === 4 && clearing.topics[0] === SIG.approval &&
              clearing.topics[1] === topics[1] && clearing.topics[2] === '0x' + word(0) && clearing.topics[3] === topics[3] && clearing.data === '0x', 'APPROVAL_CLEAR');
            owners[id] = to; epochs[id] = plus(epochs[id], 1n);
          }
        }
        continue;
      }
      need(entry.address === probe && probeCreated && owners.every(value => value !== null), 'EVENT_ADDRESS');
      need(++probeEvents === 1 && tx.to === probe, 'CALLDATA');
      if (sig === SIG.post) {
        need(topics.length === 4, 'POST_EVENT');
        const id = account(BigInt(topics[2])), owner = topicAddress(topics[3]), value = postEvent(entry.data), request = postCall(tx.data);
        authority(id, owner, value.epoch);
        need(request.id === BigInt(id + 1) && request.epoch === value.epoch && request.nonce === value.nonce && request.distribution === value.distribution && request.text === value.text, 'CALLDATA');
        need(request.validAfter < request.deadline && blockTime >= request.validAfter && blockTime < request.deadline, 'WINDOW');
        need(value.nonce === nonces[id] && value.fee === FEE && credits[id] - stakes[id] >= FEE, 'POST_STATE');
        const distribution = keccak256Hex('0x' + stakes.map(word).join('')); need(distribution === value.distribution, 'DISTRIBUTION');
        const eligible = stakes.reduce((sum, amount, index) => index === id ? sum : sum + amount, 0n); need(eligible > 0n, 'ELIGIBILITY');
        const allocations = stakes.map((amount, index) => index === id ? 0n : FEE * amount / eligible);
        const dust = FEE - allocations.reduce((a, b) => a + b, 0n);
        need(allocations.every((amount, index) => amount === value.allocations[index]) && dust === value.dust, 'ALLOCATION');
        credits[id] = plus(credits[id], -FEE);
        allocations.forEach((amount, index) => { credits[index] = plus(credits[index], amount); });
        poolDust = plus(poolDust, dust); totalCredits = plus(totalCredits, -dust);
        nonces[id] = plus(nonces[id], 1n); messageCount = plus(messageCount, 1n); need(BigInt(topics[1]) === messageCount, 'MESSAGE_ID');
        messages.push({ id: String(messageCount), accountId: String(id + 1), owner, epoch: String(value.epoch), nonce: String(value.nonce), text_hex: value.text,
          fee: String(FEE), distributionHash: value.distribution, allocations: allocations.map(String), dust: String(dust) });
      } else {
        const kind = ['deposit', 'withdraw', 'stake', 'unstake'].find(name => SIG[name] === sig); need(kind && topics.length === 3, 'PROBE_EVENT');
        const id = account(BigInt(topics[1])), owner = topicAddress(topics[2]), [amount, resulting, epoch] = words(entry.data, 3);
        authority(id, owner, epoch); need(tx.from === owner && amount > 0n, 'AUTHORITY');
        need(tx.data === CALL[kind] + word(id + 1) + word(epoch) + word(amount), 'CALLDATA');
        if (kind === 'deposit' || kind === 'withdraw') {
          const incoming = kind === 'deposit', movement = movements.find(value => !value.consumed && value.from === (incoming ? owner : probe) && value.to === (incoming ? probe : owner) && value.amount === amount);
          need(movement, 'TOKEN_MOVEMENT'); movement.consumed = true;
          if (!incoming) need(amount <= credits[id] - stakes[id], 'LOCKED_CREDIT');
          credits[id] = plus(credits[id], incoming ? amount : -amount); totalCredits = plus(totalCredits, incoming ? amount : -amount);
          need(resulting === credits[id], 'CREDIT');
        } else {
          if (kind === 'stake') need(amount <= credits[id] - stakes[id], 'LOCKED_CREDIT');
          stakes[id] = plus(stakes[id], kind === 'stake' ? amount : -amount); need(resulting === stakes[id], 'STAKE');
        }
      }
      invariant();
    }
    if (tx.to === probe && receipt.status === '0x1') {
      need(probeEvents === 1, 'MISSING_EVENT');
      need(movements.every(value => value.consumed), 'TOKEN_MOVEMENT');
    }
    if (receipt.contractAddress === reg && receipt.status === '0x1') need(owners.every(value => value !== null), 'MINT');
    invariant();
  }
  for (const block of h.blocks) {
    fields(block, ['header', 'transactions']); const current = header(block.header);
    need(current.number === previous.number + 1n && block.header.parentHash === previousHeader.hash && current.time >= previous.time, 'CONTINUITY');
    need(!blockHashes.has(block.header.hash), 'CONTINUITY'); blockHashes.add(block.header.hash);
    need(Array.isArray(block.transactions) && block.transactions.length === block.header.transactions.length, 'TRANSACTIONS');
    let cumulative = 0n, nextLog = 0n;
    for (let transactionIndex = 0; transactionIndex < block.transactions.length; transactionIndex++) {
      need(++transactionCount <= LIMITS.transactions, 'LIMIT');
      const envelope = block.transactions[transactionIndex]; fields(envelope, ['transaction', 'receipt']);
      const tx = envelope.transaction, receipt = envelope.receipt;
      fields(tx, ['from', 'to', 'data', 'gas', 'gasPrice', 'value']); address(tx.from); if (tx.to !== null) address(tx.to);
      data(tx.data); const gas = quantity(tx.gas); need(gas > 0n && gas <= 4000000n && quantity(tx.value) === 0n, 'TRANSACTION'); quantity(tx.gasPrice);
      fields(receipt, RECEIPT_FIELDS, RECEIPT_OPTIONAL);
      need(receipt.status === '0x0' || receipt.status === '0x1', 'RECEIPT');
      hash(receipt.transactionHash); need(receipt.transactionHash === block.header.transactions[transactionIndex] && !transactionHashes.has(receipt.transactionHash), 'TRANSACTION_HASH'); transactionHashes.add(receipt.transactionHash);
      need(receipt.blockHash === block.header.hash && receipt.blockNumber === block.header.number && quantity(receipt.transactionIndex) === BigInt(transactionIndex), 'RECEIPT');
      need(receipt.from === tx.from && receipt.to === tx.to, 'RECEIPT');
      const used = quantity(receipt.gasUsed); need(used > 0n && used <= gas, 'GAS'); cumulative += used; need(quantity(receipt.cumulativeGasUsed) === cumulative, 'GAS');
      if (receipt.effectiveGasPrice !== undefined) need(quantity(receipt.effectiveGasPrice) === quantity(tx.gasPrice), 'GAS');
      for (const key of ['type', 'blobGasPrice', 'blobGasUsed']) if (receipt[key] !== undefined && receipt[key] !== null) quantity(receipt[key]);
      if (receipt.blockTimestamp !== undefined) need(receiptTimestamp(receipt.blockTimestamp) === current.time, 'RECEIPT');
      if (receipt.logsBloom !== undefined) data(receipt.logsBloom, 256, 256);
      if (tx.to !== null) need(receipt.contractAddress === null, 'CREATION');
      else if (receipt.contractAddress !== null) address(receipt.contractAddress);
      if (receipt.status === '0x1' && tx.to === null) {
        need(receipt.contractAddress !== null, 'CREATION');
        if (receipt.contractAddress === reg) {
          need(!registryCreated && !probeCreated, 'CREATION');
          const [firstWord, secondWord] = constructorTail(tx.data), first = address(topicAddress(firstWord)), second = address(topicAddress(secondWord));
          mintOwners = [first, first, second]; registryCreated = true;
        }
        if (receipt.contractAddress === probe) {
          need(registryCreated && !probeCreated && owners.every(value => value !== null), 'CREATION');
          const [registryWord, registryHash] = constructorTail(tx.data);
          need(topicAddress(registryWord) === reg && registryHash === keccak256Hex(h.registry_runtime), 'CONSTRUCTOR'); probeCreated = true;
        }
      }
      need(Array.isArray(receipt.logs) && receipt.logs.length <= LIMITS.logs, 'LOGS');
      if (receipt.status === '0x0') need(receipt.logs.length === 0, 'FAILED_LOGS');
      for (const entry of receipt.logs) {
        need(++logCount <= LIMITS.logs, 'LIMIT'); fields(entry, LOG_FIELDS, ['blockTimestamp']); address(entry.address);
        need([TOKEN, reg, probe].includes(entry.address), 'EVENT_ADDRESS');
        need(Array.isArray(entry.topics) && entry.topics.length >= 1 && entry.topics.length <= 4, 'TOPICS'); entry.topics.forEach(hash); data(entry.data, 4096);
        need(entry.blockHash === block.header.hash && entry.blockNumber === block.header.number && entry.transactionHash === receipt.transactionHash && entry.transactionIndex === receipt.transactionIndex, 'LOG_POSITION');
        need(quantity(entry.logIndex) === nextLog++ && entry.removed === false, 'LOG_POSITION');
        if (entry.blockTimestamp !== undefined) need(quantity(entry.blockTimestamp) === current.time, 'LOG_POSITION');
      }
      processLogs(receipt.logs, tx, receipt, current.time);
    }
    need(cumulative === current.gasUsed, 'GAS'); previous = current; previousHeader = block.header;
  }
  need(registryCreated && probeCreated && previousHeader.hash === h.end_block.hash && previous.number === end.number && previous.time === end.time, 'ENDPOINT');
  for (const key of ['parentHash', 'gasUsed', 'gasLimit']) need(previousHeader[key] === h.end_block[key], 'ENDPOINT');
  need(previousHeader.transactions.length === h.end_block.transactions.length && previousHeader.transactions.every((value, index) => value === h.end_block.transactions[index]), 'ENDPOINT');
  const output = { owners: [...owners], epochs: epochs.map(String), credits: credits.map(String), stakes: stakes.map(String), nonces: nonces.map(String),
    totalCredits: String(totalCredits), poolDust: String(poolDust), messageCount: String(messageCount), tokenBalance: String(tokenBalance), messages };
  for (const key of ['owners', 'epochs', 'credits', 'stakes', 'nonces']) {
    need(Array.isArray(h.final[key]) && h.final[key].length === 3, 'FINAL');
    for (let i = 0; i < 3; i++) { if (key === 'owners') address(h.final[key][i]); else decimal(h.final[key][i]); need(h.final[key][i] === output[key][i], 'FINAL'); }
  }
  for (const key of ['totalCredits', 'poolDust', 'messageCount', 'tokenBalance']) { decimal(h.final[key]); need(h.final[key] === output[key], 'FINAL'); }
  return frozen(output);
}
