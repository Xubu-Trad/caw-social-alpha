// Original ordinary-history consumer. No application model, allocator, replay,
// canonicalization or checkpoint imports; no state restoration or external I/O.
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { inspectSignedAction } from './independent-action-reader.mjs';
import { copyPermissionTerms, copyPermissionAuthority, inspectDelegatedPermission,
  inspectOwnerGrant, inspectOwnerCancellation } from './independent-permission-reader.mjs';

const RECORD_FORMAT = 'caw-signed-lab-record-v1';
const CHECKPOINT_FORMAT = 'caw-signed-lab-checkpoint-v1';
const DELEGATED_FORMAT = 'caw-delegated-lab-record-v1';
const OWNER_FORMAT = 'caw-owner-granted-lab-record-v1';
const CANCELLED_FORMAT = 'caw-owner-granted-lab-record-v2';
const SCENARIO = 'appendix-demo-v1';
const RECORD_BYTES = 2 * 1024 * 1024;
const MODEL_BYTES = 1024 * 1024;
const MAX_UINT = (1n << 256n) - 1n;
const CAW_FEE = 5000000000000000000000n;
const BINDING_KEYS = ['domain', 'account', 'controller', 'epoch', 'publicKey'];
const CHECKPOINT_KEYS = ['format', 'entryCount', 'byteLength', 'sha256', 'finalHistorySha256'];

function reject(reason) {
  const error = new Error(`Independent history reader rejected input: ${reason}.`);
  error.code = `HISTORY_${reason}`;
  throw error;
}

// Capture caller-supplied trust as ordinary data, without invoking accessors.
// Hostile Proxy traps and modified platform built-ins are outside this boundary.
function data(input, required, optional = []) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) reject('SCHEMA');
  let properties, prototype;
  try {
    properties = Object.getOwnPropertyDescriptors(input);
    prototype = Object.getPrototypeOf(input);
  } catch { reject('SCHEMA'); }
  if (prototype !== null && prototype !== Object.prototype) reject('SCHEMA');
  const names = Reflect.ownKeys(properties);
  const allowed = new Set([...required, ...optional]);
  if (names.some(name => !allowed.has(name)) || required.some(name => !names.includes(name))) reject('SCHEMA');
  const result = Object.create(null);
  for (const name of names) {
    const descriptor = properties[name];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) reject('SCHEMA');
    result[name] = descriptor.value;
  }
  return result;
}

function integer(value, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > max) reject('INTEGER');
}

function scalars(text) {
  if (typeof text !== 'string') reject('TEXT');
  let size = 0;
  for (let offset = 0; offset < text.length; offset += 1) {
    const unit = text.charCodeAt(offset);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = text.charCodeAt(offset + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) reject('TEXT');
      offset += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) reject('TEXT');
    size += 1;
  }
  return size;
}

function boundedText(text, max) {
  if (typeof text !== 'string' || text.length > max) reject('LIMIT');
  scalars(text);
  const length = Buffer.byteLength(text, 'utf8');
  if (length > max) reject('LIMIT');
  return length;
}

function array(value, max) {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length) reject('SCHEMA');
}

function name(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 32 || /[^a-z0-9]/.test(value)) reject('SEED');
}

function controller(value) {
  if (typeof value !== 'string' || !value.startsWith('device-')) reject('BINDING');
  const suffix = value.slice(7);
  if (suffix.length < 1 || suffix.length > 40 || !/^[a-z0-9]/.test(suffix) || /[^a-z0-9-]/.test(suffix)) reject('BINDING');
}

function amount(value, maximum = MAX_UINT) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 78 || /[^0-9]/.test(value) ||
      (value.length > 1 && value[0] === '0')) reject('AMOUNT');
  const parsed = BigInt(value);
  if (parsed > maximum) reject('AMOUNT');
  return parsed;
}

function digestText(value) {
  if (typeof value !== 'string' || value.length !== 64 || /[^0-9a-f]/.test(value)) reject('CHECKPOINT');
}

function hash(text) {
  try { return createHash('sha256').update(text, 'utf8').digest('hex'); }
  catch { reject('CRYPTO'); }
}

function parse(text) {
  try { return JSON.parse(text); } catch { reject('SCHEMA'); }
}

// The model's wire order combines lexical object-key sorting with ECMAScript's
// numeric array-index enumeration. Write that order explicitly, not via any
// application helper. Array order and scalar string bytes remain unchanged.
function canonical(value) {
  let nodes = 0;
  function encode(item, depth) {
    nodes += 1;
    if (depth > 32 || nodes > 100000) reject('LIMIT');
    if (item === null) return 'null';
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (typeof item === 'number') { integer(item); return JSON.stringify(item); }
    if (typeof item === 'string') { scalars(item); return JSON.stringify(item); }
    if (typeof item !== 'object') reject('SCHEMA');
    if (Array.isArray(item)) {
      array(item, 8192);
      return '[' + item.map(entry => encode(entry, depth + 1)).join(',') + ']';
    }
    const names = Object.keys(item).sort();
    const indices = [], ordinary = [];
    for (const key of names) {
      scalars(key);
      const numeric = Number(key);
      if (key !== '' && Number.isInteger(numeric) && numeric >= 0 && numeric < 4294967295 && String(numeric) === key) indices.push(key);
      else ordinary.push(key);
    }
    indices.sort((left, right) => Number(left) - Number(right));
    return '{' + [...indices, ...ordinary].map(key => JSON.stringify(key) + ':' + encode(item[key], depth + 1)).join(',') + '}';
  }
  const text = encode(value, 0);
  boundedText(text, MODEL_BYTES);
  return text;
}

function initialModel(text) {
  boundedText(text, MODEL_BYTES);
  const envelope = data(parse(text), ['version', 'scenario', 'seed', 'expectedEventCount', 'events', 'snapshot']);
  if (envelope.version !== 1 || envelope.scenario !== SCENARIO) reject('FORMAT');
  integer(envelope.expectedEventCount, 256);
  array(envelope.events, 256);
  if (envelope.expectedEventCount !== 0 || envelope.events.length !== 0) reject('INHERITED');
  const seed = data(envelope.seed, ['version', 'scenario', 'accounts', 'posts'], ['description', 'policies']);
  if (seed.version !== 1 || seed.scenario !== SCENARIO) reject('SEED');
  array(seed.accounts, 32);
  if (seed.accounts.length < 2) reject('SEED');
  array(seed.posts, 128);
  const accounts = new Map();
  for (const input of seed.accounts) {
    const entry = data(input, ['name', 'controller', 'balance', 'stake']);
    name(entry.name); controller(entry.controller);
    amount(entry.balance); amount(entry.stake, 1000000n);
    if (accounts.has(entry.name)) reject('SEED');
    accounts.set(entry.name, { name: entry.name, controller: entry.controller,
      balance: entry.balance, stake: entry.stake, epoch: 0, nonce: 0 });
  }
  const posts = [], postIds = new Set();
  for (const input of seed.posts) {
    const post = data(input, ['id', 'author', 'text', 'time']);
    if (typeof post.id !== 'string' || post.id.length < 1 || post.id.length > 96 ||
        !/^[A-Za-z0-9]/.test(post.id) || /[^A-Za-z0-9_-]/.test(post.id)) reject('SEED');
    name(post.author);
    if (!accounts.has(post.author) || postIds.has(post.id)) reject('SEED');
    if (scalars(post.text) > 420 || post.text.trim().length === 0 || scalars(post.time) > 80) reject('TEXT');
    posts.push({ id: post.id, author: post.author, text: post.text, time: post.time, simulated: true });
    postIds.add(post.id);
  }
  if (Object.hasOwn(seed, 'description') && scalars(seed.description) > 2000) reject('TEXT');
  if (Object.hasOwn(seed, 'policies')) {
    array(seed.policies, 20);
    for (const policy of seed.policies) if (scalars(policy) > 500) reject('TEXT');
  }
  const model = { seed, accounts, posts, postIds, poolDust: 0n, events: [], receipts: [] };
  if (canonical(envelope) !== text) reject('CANONICAL');
  if (exportModel(model) !== text) reject('INITIAL_HISTORY');
  return model;
}

function exportModel(model) {
  const accountObject = Object.create(null);
  for (const [key, value] of model.accounts) accountObject[key] = value;
  return canonical({ version: 1, scenario: SCENARIO, seed: model.seed,
    expectedEventCount: model.events.length, events: model.events,
    snapshot: { accounts: accountObject, posts: model.posts, follows: [], likes: [],
      recaws: [], poolDust: model.poolDust.toString(), receipts: model.receipts } });
}

function checkpointInput(input, allowCancellation = false) {
  const c = data(input, CHECKPOINT_KEYS);
  if (c.format !== CHECKPOINT_FORMAT) reject('CHECKPOINT');
  integer(c.entryCount, allowCancellation ? 65 : 64);
  integer(c.byteLength, RECORD_BYTES + (allowCancellation ? 16384 : 0));
  digestText(c.sha256); digestText(c.finalHistorySha256);
  return Object.freeze({ format: c.format, entryCount: c.entryCount, byteLength: c.byteLength,
    sha256: c.sha256, finalHistorySha256: c.finalHistorySha256 });
}

function bindingInput(input) {
  const b = data(input, BINDING_KEYS);
  name(b.account); controller(b.controller); integer(b.epoch, 4294967295);
  if (typeof b.domain !== 'string' || b.domain.length < 1 || b.domain.length > 96 ||
      !/^[a-z0-9]/.test(b.domain) || /[^a-z0-9-]/.test(b.domain)) reject('BINDING');
  if (b.domain.startsWith('grant-') || b.domain.startsWith('ownergrant-')) reject('FORMAT');
  if (typeof b.publicKey !== 'string' || b.publicKey.length !== 64 || /[^0-9a-f]/.test(b.publicKey)) reject('BINDING');
  return Object.freeze({ domain: b.domain, account: b.account, controller: b.controller,
    epoch: b.epoch, publicKey: b.publicKey });
}

function recordInput(text) {
  const length = boundedText(text, RECORD_BYTES);
  const parsed = parse(text);
  if (parsed === null || typeof parsed !== 'object' || parsed.format !== RECORD_FORMAT) reject('FORMAT');
  const r = data(parsed, ['format', 'initialHistory', 'entries']);
  boundedText(r.initialHistory, MODEL_BYTES);
  array(r.entries, 64);
  const entries = r.entries.map(input => {
    if (input === null || typeof input !== 'object') reject('SCHEMA');
    if (input.kind === 'signed-caw') {
      const entry = data(input, ['kind', 'packet', 'acceptedAt']);
      boundedText(entry.packet, 8192); integer(entry.acceptedAt, 253402300799);
      return { kind: 'signed-caw', packet: entry.packet, acceptedAt: entry.acceptedAt };
    }
    if (input.kind === 'unsigned-fixture-transfer') {
      const entry = data(input, ['kind', 'newController']);
      controller(entry.newController);
      return { kind: 'unsigned-fixture-transfer', newController: entry.newController };
    }
    reject('FORMAT');
  });
  const record = { format: RECORD_FORMAT, initialHistory: r.initialHistory, entries };
  if (JSON.stringify(record) !== text) reject('CANONICAL');
  return { ...record, byteLength: length };
}

function grantedRecordInput(text) {
  const reserved = typeof text === 'string' && text.startsWith('{"format":"' + CANCELLED_FORMAT + '",');
  const length = boundedText(text, RECORD_BYTES + (reserved ? 16384 : 0));
  const parsed = parse(text);
  if (parsed === null || typeof parsed !== 'object' ||
      ![DELEGATED_FORMAT, OWNER_FORMAT, CANCELLED_FORMAT].includes(parsed.format)) reject('FORMAT');
  const ownerMode = parsed.format !== DELEGATED_FORMAT, cancelledMode = parsed.format === CANCELLED_FORMAT;
  boundedText(text, RECORD_BYTES + (cancelledMode ? 16384 : 0));
  const required = ownerMode ? ['format', 'initialHistory', 'delegation', 'ownerGrant', 'entries'] :
    ['format', 'initialHistory', 'delegation', 'entries'];
  const r = data(parsed, required);
  boundedText(r.initialHistory, MODEL_BYTES);
  const permission = copyPermissionTerms(r.delegation);
  if (ownerMode) boundedText(r.ownerGrant, 8192);
  array(r.entries, cancelledMode ? 65 : 64);
  const entries = r.entries.map(input => {
    if (input === null || typeof input !== 'object') reject('SCHEMA');
    if (input.kind === 'signed-caw') {
      const entry = data(input, ['kind', 'packet', 'acceptedAt']);
      boundedText(entry.packet, 8192); integer(entry.acceptedAt, 253402300799);
      return { kind: 'signed-caw', packet: entry.packet, acceptedAt: entry.acceptedAt };
    }
    if (input.kind === 'unsigned-fixture-transfer') {
      const entry = data(input, ['kind', 'newController']);
      controller(entry.newController);
      return { kind: 'unsigned-fixture-transfer', newController: entry.newController };
    }
    if (input.kind === 'signed-owner-revocation') {
      const entry = data(input, ['kind', 'packet']);
      boundedText(entry.packet, 8192);
      return { kind: 'signed-owner-revocation', packet: entry.packet };
    }
    reject('FORMAT');
  });
  const cancellations = entries.filter(entry => entry.kind === 'signed-owner-revocation').length;
  if (cancelledMode ? cancellations !== 1 || entries.at(-1)?.kind !== 'signed-owner-revocation' : cancellations !== 0) reject('CANCELLATION');
  const record = { format: r.format, initialHistory: r.initialHistory, delegation: permission,
    ...(ownerMode ? { ownerGrant: r.ownerGrant } : {}), entries };
  if (JSON.stringify(record) !== text) reject('CANONICAL');
  return { ...record, ownerMode, byteLength: length };
}

function settle(model, trusted, entry, permission = undefined, spent = 0n) {
  const payer = model.accounts.get(trusted.account);
  const transferring = entry.kind === 'unsigned-fixture-transfer';
  let text = '', characterCount = 0, nextSpent = spent;
  if (transferring) {
    if (entry.newController === payer.controller) reject('TRANSFER');
  } else {
    if (payer.controller !== trusted.controller || payer.epoch !== trusted.epoch) reject('AUTHORITY');
    const result = inspectSignedAction(entry.packet, { ...trusted, nextNonce: payer.nonce }, entry.acceptedAt);
    if (permission) {
      const action = result.action;
      if (action.kind !== permission.scope) reject('PERMISSION_SCOPE');
      if (action.notBefore < permission.notBefore || action.expiresAt > permission.expiresAt ||
          entry.acceptedAt < permission.notBefore || entry.acceptedAt >= permission.expiresAt) reject('PERMISSION_WINDOW');
      nextSpent = spent + BigInt(action.fee);
      if (nextSpent > BigInt(permission.budget)) reject('PERMISSION_BUDGET');
    }
    text = result.action.text;
    characterCount = scalars(text);
  }
  const kind = transferring ? 'transfer' : 'caw';
  const id = `${transferring ? 'transfer' : 'signed'}-${payer.name}-${payer.nonce}`;
  const postId = 'post-' + id;
  if (model.events.some(event => event.intent.id === id) || (!transferring && model.postIds.has(postId))) reject('SETTLEMENT');
  const fee = transferring ? 0n : CAW_FEE;
  if (BigInt(payer.balance) < fee) reject('SETTLEMENT');
  const allocations = [];
  let dust = 0n;
  if (!transferring) {
    const otherNames = [...model.accounts.keys()].filter(key => key !== payer.name && BigInt(model.accounts.get(key).stake) > 0n).sort();
    let totalWeight = 0n;
    for (const key of otherNames) totalWeight += BigInt(model.accounts.get(key).stake);
    if (totalWeight === 0n) reject('SETTLEMENT');
    let paid = 0n;
    for (const key of otherNames) {
      const recipient = model.accounts.get(key);
      const credit = fee * BigInt(recipient.stake) / totalWeight;
      if (BigInt(recipient.balance) + credit > MAX_UINT) reject('SETTLEMENT');
      paid += credit;
      if (credit !== 0n) allocations.push({ account: key, amount: credit.toString(), reason: 'stake-pool' });
    }
    dust = fee - paid;
  }
  if (model.poolDust + dust > MAX_UINT || payer.nonce >= Number.MAX_SAFE_INTEGER ||
      (transferring && payer.epoch >= Number.MAX_SAFE_INTEGER)) reject('SETTLEMENT');
  const intent = { id, kind, actor: payer.name, controller: payer.controller,
    epoch: payer.epoch, nonce: payer.nonce, ...(transferring ? { newController: entry.newController } : { text }) };
  const receipt = { simulated: true, scenario: SCENARIO, id, kind, actor: payer.name,
    fee: fee.toString(), poolAmount: fee.toString(), poolDustAdded: dust.toString(), allocations,
    characterCount, nextNonce: payer.nonce + 1, nextEpoch: payer.epoch + (transferring ? 1 : 0),
    ...(!transferring ? { postId } : {}), eventIndex: model.events.length + 1,
    ...(transferring ? { newController: entry.newController } : { text }) };
  payer.balance = (BigInt(payer.balance) - fee).toString();
  for (const credit of allocations) {
    const recipient = model.accounts.get(credit.account);
    recipient.balance = (BigInt(recipient.balance) + BigInt(credit.amount)).toString();
  }
  model.poolDust += dust;
  payer.nonce = receipt.nextNonce;
  payer.epoch = receipt.nextEpoch;
  if (transferring) payer.controller = entry.newController;
  else {
    model.posts.push({ id: postId, author: payer.name, text, time: 'Local session', simulated: true });
    model.postIds.add(postId);
  }
  model.receipts.push(receipt);
  model.events.push({ version: 1, sequence: model.events.length + 1, intent, receipt });
  return nextSpent;
}

/** Verify/recompute the ordinary fresh-record subset without consuming anything. */
export function inspectSignedHistory(recordText, expectedCheckpoint, binding) {
  if (arguments.length !== 3) reject('SCHEMA');
  const checkpoint = checkpointInput(expectedCheckpoint);
  const trusted = bindingInput(binding);
  const record = recordInput(recordText);
  if (record.byteLength !== checkpoint.byteLength || record.entries.length !== checkpoint.entryCount ||
      hash(recordText) !== checkpoint.sha256) reject('CHECKPOINT');
  const model = initialModel(record.initialHistory);
  const account = model.accounts.get(trusted.account);
  if (!account || account.controller !== trusted.controller || account.epoch !== trusted.epoch) reject('AUTHORITY');
  let canonicalText = exportModel(model), signedActions = 0, fixtureTransfers = 0;
  for (const entry of record.entries) {
    settle(model, trusted, entry);
    if (entry.kind === 'signed-caw') signedActions += 1;
    else fixtureTransfers += 1;
    // The writer bounds every intermediate export, not only the final record.
    canonicalText = exportModel(model);
  }
  if (hash(canonicalText) !== checkpoint.finalHistorySha256) reject('FINAL_HISTORY');
  return Object.freeze({ canonicalText, checkpoint, signedActions, fixtureTransfers,
    inheritedEvents: 0, entryCount: record.entries.length, recordedTimesAreProof: false,
    ownershipProven: false, authorityProven: false, freshnessProven: false, livePermissionRestored: false });
}

/** Inspect separate permission/owner trust; never restore a usable grant.
 * Exactly four arguments for delegated v1; exactly five for owner v1 or v2.
 */
export function inspectGrantedHistory(recordText, expectedCheckpoint, binding, permission, ownerAuthority) {
  if (arguments.length !== 4 && arguments.length !== 5) reject('SCHEMA');
  // Capture every independently supplied scalar record before hashing/replay.
  const checkpoint = checkpointInput(expectedCheckpoint, true);
  const trusted = copyPermissionAuthority(binding), terms = copyPermissionTerms(permission);
  const owner = arguments.length === 5 ? copyPermissionAuthority(ownerAuthority) : undefined;
  const record = grantedRecordInput(recordText);
  if (record.ownerMode !== Boolean(owner) || record.ownerMode !== trusted.domain.startsWith('ownergrant-')) reject('FORMAT');
  if (JSON.stringify(record.delegation) !== JSON.stringify(terms)) reject('PERMISSION_MISMATCH');
  if (owner) {
    const grant = inspectOwnerGrant(record.ownerGrant, owner);
    if (JSON.stringify(grant.binding) !== JSON.stringify(trusted) ||
        JSON.stringify(grant.permission) !== JSON.stringify(terms)) reject('OWNER_GRANT');
  } else inspectDelegatedPermission(trusted, terms);
  if (record.byteLength !== checkpoint.byteLength || record.entries.length !== checkpoint.entryCount ||
      hash(recordText) !== checkpoint.sha256) reject('CHECKPOINT');
  const model = initialModel(record.initialHistory);
  const account = model.accounts.get(trusted.account);
  if (!account || account.controller !== trusted.controller || account.epoch !== trusted.epoch) reject('AUTHORITY');
  let canonicalText = exportModel(model), signedActions = 0, fixtureTransfers = 0, ownerRevocations = 0, spent = 0n;
  for (const entry of record.entries) {
    if (entry.kind === 'signed-owner-revocation') {
      // Cancellation is untimed and refers to retained original owner/grant
      // authority, even after a fixture transfer changes model control.
      inspectOwnerCancellation(entry.packet, owner, trusted.domain);
      ownerRevocations += 1;
      continue;
    }
    spent = settle(model, trusted, entry, terms, spent);
    if (entry.kind === 'signed-caw') signedActions += 1;
    else fixtureTransfers += 1;
    canonicalText = exportModel(model);
  }
  if (model.events.length !== record.entries.length - ownerRevocations) reject('SETTLEMENT');
  if (hash(canonicalText) !== checkpoint.finalHistorySha256) reject('FINAL_HISTORY');
  return Object.freeze({ canonicalText, checkpoint, signedActions, fixtureTransfers,
    inheritedEvents: 0, entryCount: record.entries.length, recordedTimesAreProof: false,
    ownershipProven: false, authorityProven: false, freshnessProven: false, livePermissionRestored: false,
    delegation: Object.freeze({ permission: terms, spent: spent.toString(), remaining: (BigInt(terms.budget) - spent).toString() }),
    ...(owner ? { ownerGrantVerified: true, ownerRevoked: ownerRevocations === 1, ownerRevocations } : {}) });
}
