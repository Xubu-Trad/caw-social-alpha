// Local, synthetic accounting only. No wallets, signatures, network or chain access.
// The appendix schedule and every edge-case policy below remain provisional.
export const UNIT = 10n ** 18n;
export const SCENARIO = "appendix-demo-v1";

const MAX_UINT = (1n << 256n) - 1n;
const MAX_EVENTS = 256;
const MAX_JSON_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const FEES = Object.freeze({ caw: 5000n * UNIT, like: 2000n * UNIT, recaw: 4000n * UNIT, follow: 30000n * UNIT, transfer: 0n });
const SHARED_INTENT = ["id", "kind", "actor", "controller", "epoch", "nonce"];
const INTENT_EXTRA = Object.freeze({ caw: ["text"], like: ["postId"], recaw: ["postId"], follow: ["target"], transfer: ["newController"] });

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
function ensure(condition, code, message) {
  if (!condition) fail(code, message);
}
function record(value, label) {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value), "INVALID_SCHEMA", label + " must be an object.");
  const prototype = Object.getPrototypeOf(value);
  ensure(prototype === Object.prototype || prototype === null, "INVALID_SCHEMA", label + " must be a plain object.");
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    ensure(typeof key === "string" && descriptor && "value" in descriptor && descriptor.enumerable, "INVALID_SCHEMA", label + " contains unsupported properties.");
  }
}
function exact(value, required, optional = [], label = "Record") {
  record(value, label);
  const allowed = new Set([...required, ...optional]);
  ensure(Object.keys(value).every((key) => allowed.has(key)), "UNKNOWN_FIELD", label + " contains an unknown field.");
  ensure(required.every((key) => Object.hasOwn(value, key)), "INVALID_SCHEMA", label + " is missing a required field.");
}
function array(value, maximum, label) {
  ensure(Array.isArray(value) && value.length <= maximum, "INVALID_SCHEMA", label + " must be a bounded array.");
  ensure(Reflect.ownKeys(value).length === value.length + 1, "INVALID_SCHEMA", label + " has holes or custom properties.");
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    ensure(descriptor && "value" in descriptor, "INVALID_SCHEMA", label + " has an unsupported entry.");
  }
}
function safeInteger(value, label) {
  ensure(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), "INVALID_INTEGER", label + " must be a nonnegative safe integer.");
}
function amount(value, label, maximum = MAX_UINT) {
  ensure(typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value), "INVALID_AMOUNT", label + " must be a canonical decimal string.");
  const result = BigInt(value);
  ensure(result <= maximum, "AMOUNT_OVERFLOW", label + " exceeds the demo's integer bound.");
  return result;
}
function name(value) {
  ensure(typeof value === "string" && /^[a-z0-9]{1,32}$/.test(value), "INVALID_NAME", "Demo account names require 1–32 lowercase letters or digits.");
}
function controller(value) {
  ensure(typeof value === "string" && /^device-[a-z0-9][a-z0-9-]{0,39}$/.test(value), "INVALID_CONTROLLER", "Use a synthetic device label such as device-a.");
}
function identifier(value, label, maximum = 64) {
  ensure(typeof value === "string" && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value), "INVALID_ID", label + " is not a supported local identifier.");
}
export function countCharacters(text) {
  ensure(typeof text === "string", "INVALID_TEXT", "Text must be a string.");
  // JavaScript counts lone surrogates as characters; these are not valid Unicode.
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const following = text.charCodeAt(index + 1);
      ensure(following >= 0xdc00 && following <= 0xdfff, "INVALID_UNICODE", "Text contains an unpaired surrogate.");
      index += 1;
    } else {
      ensure(!(unit >= 0xdc00 && unit <= 0xdfff), "INVALID_UNICODE", "Text contains an unpaired surrogate.");
    }
  }
  return Array.from(text).length;
}
function message(text) {
  const count = countCharacters(text);
  ensure(count > 0 && text.trim().length > 0, "EMPTY_TEXT", "The demo does not post empty or whitespace-only text.");
  ensure(count <= 420, "TEXT_TOO_LONG", "The provisional demo limit is 420 Unicode code points.");
  return count;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Deterministic JSON is an internal-consistency format, not a signature or hash.
// This rejects cyclic/non-JSON inputs and preserves array ordering and string bytes.
function stable(value) {
  const ancestors = new Set();
  let visited = 0;
  function visit(item, depth) {
    visited += 1;
    ensure(depth <= 32 && visited <= 100000, "RESOURCE_LIMIT", "Record exceeds the local structural bound.");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") {
      countCharacters(item);
      return item;
    }
    if (typeof item === "number") {
      safeInteger(item, "JSON number");
      return item;
    }
    ensure(typeof item === "object", "INVALID_SCHEMA", "Record contains a non-JSON value.");
    ensure(!ancestors.has(item), "INVALID_SCHEMA", "Record contains a cycle.");
    ancestors.add(item);
    let result;
    if (Array.isArray(item)) {
      array(item, 8192, "JSON array");
      result = item.map((entry) => visit(entry, depth + 1));
    } else {
      record(item, "JSON object");
      result = Object.create(null);
      for (const key of Object.keys(item).sort()) result[key] = visit(item[key], depth + 1);
    }
    ancestors.delete(item);
    return result;
  }
  const text = JSON.stringify(visit(value, 0));
  ensure(encoder.encode(text).length <= MAX_JSON_BYTES, "RESOURCE_LIMIT", "Record exceeds the 1 MiB local JSON bound.");
  return text;
}

function validateSeed(seed) {
  exact(seed, ["version", "scenario", "accounts", "posts"], ["description", "policies"], "Seed");
  ensure(seed.version === 1 && seed.scenario === SCENARIO, "INVALID_SCENARIO", "Unsupported synthetic fixture version or scenario.");
  array(seed.accounts, 32, "Seed accounts");
  ensure(seed.accounts.length >= 2, "INVALID_SCHEMA", "The demo needs at least two synthetic accounts.");
  array(seed.posts, 128, "Seed posts");
  const names = new Set();
  for (const account of seed.accounts) {
    exact(account, ["name", "controller", "balance", "stake"], [], "Seed account");
    name(account.name);
    controller(account.controller);
    amount(account.balance, "Balance");
    amount(account.stake, "Fixed stake weight", 1000000n);
    ensure(!names.has(account.name), "DUPLICATE_ACCOUNT", "A seed username appears twice.");
    names.add(account.name);
  }
  const postIds = new Set();
  for (const post of seed.posts) {
    exact(post, ["id", "author", "text", "time"], [], "Seed post");
    identifier(post.id, "Post ID", 96);
    name(post.author);
    ensure(names.has(post.author), "UNKNOWN_ACCOUNT", "A seed post refers to an unknown account.");
    message(post.text);
    ensure(typeof post.time === "string" && countCharacters(post.time) <= 80, "INVALID_SCHEMA", "Seed time must be a short synthetic display label.");
    ensure(!postIds.has(post.id), "DUPLICATE_POST", "A seed post ID appears twice.");
    postIds.add(post.id);
  }
  if (Object.hasOwn(seed, "description")) ensure(typeof seed.description === "string" && countCharacters(seed.description) <= 2000, "INVALID_SCHEMA", "Seed description must be a short string.");
  if (Object.hasOwn(seed, "policies")) {
    array(seed.policies, 20, "Seed policies");
    for (const policy of seed.policies) ensure(typeof policy === "string" && countCharacters(policy) <= 500, "INVALID_SCHEMA", "Each policy must be a short string.");
  }
  stable(seed);
}

export function createState(seed) {
  validateSeed(seed);
  return {
    version: 1,
    scenario: SCENARIO,
    simulated: true,
    seed: clone(seed),
    accounts: Object.fromEntries(seed.accounts.map((account) => [account.name, { ...clone(account), epoch: 0, nonce: 0 }])),
    posts: seed.posts.map((post) => ({ ...clone(post), simulated: true })),
    follows: [],
    likes: [],
    recaws: [],
    poolDust: "0",
    events: [],
    receipts: [],
  };
}

function plan(state, intent) {
  record(intent, "Intent");
  ensure(typeof intent.kind === "string" && Object.hasOwn(INTENT_EXTRA, intent.kind), "INVALID_KIND", "Unknown simulated action.");
  exact(intent, [...SHARED_INTENT, ...INTENT_EXTRA[intent.kind]], [], "Intent");
  identifier(intent.id, "Intent ID");
  name(intent.actor);
  controller(intent.controller);
  safeInteger(intent.epoch, "Epoch");
  safeInteger(intent.nonce, "Nonce");
  ensure(state.events.length < MAX_EVENTS, "RESOURCE_LIMIT", "This bounded local session permits at most 256 events.");
  ensure(!state.events.some((event) => event.intent.id === intent.id), "REPLAY", "This intent ID has already been applied.");
  ensure(Object.hasOwn(state.accounts, intent.actor), "UNKNOWN_ACCOUNT", "Unknown acting account.");
  const account = state.accounts[intent.actor];
  ensure(account.controller === intent.controller, "STALE_CONTROLLER", "This synthetic device no longer controls the account.");
  ensure(account.epoch === intent.epoch, "STALE_EPOCH", "This intent belongs to an earlier ownership epoch.");
  ensure(account.nonce === intent.nonce, "INVALID_NONCE", "This intent does not use the account's next nonce.");
  ensure(account.nonce < Number.MAX_SAFE_INTEGER, "RESOURCE_LIMIT", "The nonce cannot be incremented safely.");
  let target;
  let postId;
  let characterCount = 0;
  if (intent.kind === "caw") {
    characterCount = message(intent.text);
    postId = "post-" + intent.id;
    ensure(!state.posts.some((post) => post.id === postId), "DUPLICATE_POST", "The generated local post ID already exists.");
  } else if (intent.kind === "like" || intent.kind === "recaw") {
    identifier(intent.postId, "Post ID", 96);
    const post = state.posts.find((entry) => entry.id === intent.postId);
    ensure(post, "UNKNOWN_POST", "The requested post does not exist.");
    target = post.author;
    postId = post.id;
    ensure(target !== intent.actor, "SELF_INTERACTION", "The demo rejects self-likes and self-reCAWs.");
    const interactions = intent.kind === "like" ? state.likes : state.recaws;
    ensure(!interactions.some((entry) => entry.actor === intent.actor && entry.postId === postId), "DUPLICATE_ACTION", "The demo charges this interaction only once per account and post.");
  } else if (intent.kind === "follow") {
    name(intent.target);
    ensure(Object.hasOwn(state.accounts, intent.target), "UNKNOWN_ACCOUNT", "The followed account does not exist.");
    target = intent.target;
    ensure(target !== intent.actor, "SELF_INTERACTION", "The demo rejects self-follows.");
    ensure(!state.follows.some((entry) => entry.actor === intent.actor && entry.target === target), "DUPLICATE_ACTION", "The demo charges a follow only once per account pair.");
  } else {
    controller(intent.newController);
    ensure(intent.newController !== account.controller, "NO_CHANGE", "Choose a different synthetic device controller.");
    ensure(account.epoch < Number.MAX_SAFE_INTEGER, "RESOURCE_LIMIT", "The ownership epoch cannot be incremented safely.");
  }

  const fee = FEES[intent.kind];
  const actorBalance = BigInt(account.balance);
  ensure(actorBalance >= fee, "INSUFFICIENT_BALANCE", "The synthetic balance cannot cover this action.");
  const direct = intent.kind === "like" || intent.kind === "follow" ? fee * 80n / 100n : intent.kind === "recaw" ? fee / 2n : 0n;
  const pool = fee - direct;
  const allocations = [];
  if (direct > 0n) allocations.push({ account: target, amount: direct.toString(), reason: "recipient" });
  let dust = 0n;
  if (pool > 0n) {
    const eligible = Object.values(state.accounts).filter((entry) => entry.name !== intent.actor && BigInt(entry.stake) > 0n).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const totalWeight = eligible.reduce((sum, entry) => sum + BigInt(entry.stake), 0n);
    ensure(totalWeight > 0n, "UNRESOLVED_POOL", "No eligible other stakers. This unresolved case is rejected in the demo.");
    let distributed = 0n;
    for (const recipient of eligible) {
      const credit = pool * BigInt(recipient.stake) / totalWeight;
      distributed += credit;
      if (credit > 0n) allocations.push({ account: recipient.name, amount: credit.toString(), reason: "stake-pool" });
    }
    dust = pool - distributed;
  }
  const totals = new Map();
  for (const allocation of allocations) totals.set(allocation.account, (totals.get(allocation.account) || 0n) + BigInt(allocation.amount));
  for (const [recipient, total] of totals) ensure(BigInt(state.accounts[recipient].balance) + total <= MAX_UINT, "AMOUNT_OVERFLOW", "A resulting synthetic balance exceeds its integer bound.");
  ensure(BigInt(state.poolDust) + dust <= MAX_UINT, "AMOUNT_OVERFLOW", "The visible dust ledger exceeds its integer bound.");
  const preview = {
    simulated: true,
    scenario: SCENARIO,
    id: intent.id,
    kind: intent.kind,
    actor: intent.actor,
    fee: fee.toString(),
    poolAmount: pool.toString(),
    poolDustAdded: dust.toString(),
    allocations,
    characterCount,
    nextNonce: account.nonce + 1,
    nextEpoch: account.epoch + (intent.kind === "transfer" ? 1 : 0),
  };
  if (target !== undefined) preview.target = target;
  if (postId !== undefined) preview.postId = postId;
  return preview;
}

function transition(state, intent) {
  const preview = plan(state, intent);
  const next = clone(state);
  const account = next.accounts[intent.actor];
  account.balance = (BigInt(account.balance) - BigInt(preview.fee)).toString();
  for (const allocation of preview.allocations) {
    const recipient = next.accounts[allocation.account];
    recipient.balance = (BigInt(recipient.balance) + BigInt(allocation.amount)).toString();
  }
  next.poolDust = (BigInt(next.poolDust) + BigInt(preview.poolDustAdded)).toString();
  account.nonce = preview.nextNonce;
  account.epoch = preview.nextEpoch;
  const receipt = { ...preview, eventIndex: next.events.length + 1 };
  if (intent.kind === "caw") {
    next.posts.push({ id: preview.postId, author: intent.actor, text: intent.text, time: "Local session", simulated: true });
    receipt.text = intent.text;
  } else if (intent.kind === "follow") {
    next.follows.push({ actor: intent.actor, target: preview.target });
  } else if (intent.kind === "like" || intent.kind === "recaw") {
    next[intent.kind === "like" ? "likes" : "recaws"].push({ actor: intent.actor, postId: preview.postId });
  } else {
    account.controller = intent.newController;
    receipt.newController = intent.newController;
  }
  next.receipts.push(clone(receipt));
  next.events.push({ version: 1, sequence: next.events.length + 1, intent: clone(intent), receipt: clone(receipt) });
  return next;
}

function replayEvents(seed, events) {
  array(events, MAX_EVENTS, "Events");
  let state = createState(seed);
  for (const event of events) {
    exact(event, ["version", "sequence", "intent", "receipt"], [], "Event");
    ensure(event.version === 1 && event.sequence === state.events.length + 1, "EVENT_ORDER", "An event is missing, duplicated or out of order.");
    const next = transition(state, event.intent);
    const expected = next.events[next.events.length - 1];
    ensure(stable(event) === stable(expected), "EVENT_MISMATCH", "An event or its receipt differs from the recomputed local result.");
    state = next;
  }
  return state;
}
function validateState(state) {
  exact(state, ["version", "scenario", "simulated", "seed", "accounts", "posts", "follows", "likes", "recaws", "poolDust", "events", "receipts"], [], "State");
  ensure(state.version === 1 && state.scenario === SCENARIO && state.simulated === true, "INVALID_SCENARIO", "This model accepts simulated state only.");
  // Every public operation validates against its own source fixture and event log.
  // This detects inconsistent edits, not a self-consistent rewrite of all records.
  const expected = replayEvents(state.seed, state.events);
  ensure(stable(state) === stable(expected), "STATE_MISMATCH", "State differs from its fixture and replayed event history.");
}
function snapshot(state) {
  return { accounts: clone(state.accounts), posts: clone(state.posts), follows: clone(state.follows), likes: clone(state.likes), recaws: clone(state.recaws), poolDust: state.poolDust, receipts: clone(state.receipts) };
}

export function previewAction(state, intent) {
  validateState(state);
  return plan(state, intent);
}
export function applyAction(state, intent) {
  validateState(state);
  const next = transition(state, intent);
  // Bound successful sessions by the same export size used by the UI.
  stable({ version: 1, scenario: SCENARIO, seed: next.seed, expectedEventCount: next.events.length, events: next.events, snapshot: snapshot(next) });
  return next;
}
export function canonicalExport(state) {
  validateState(state);
  return stable({ version: 1, scenario: SCENARIO, seed: state.seed, expectedEventCount: state.events.length, events: state.events, snapshot: snapshot(state) });
}
export function rebuild(seed, envelope) {
  validateSeed(seed);
  exact(envelope, ["version", "scenario", "seed", "expectedEventCount", "events", "snapshot"], [], "Rebuild envelope");
  ensure(envelope.version === 1 && envelope.scenario === SCENARIO, "INVALID_SCENARIO", "Unsupported rebuild envelope.");
  safeInteger(envelope.expectedEventCount, "Expected event count");
  array(envelope.events, MAX_EVENTS, "Events");
  ensure(envelope.expectedEventCount === envelope.events.length, "EVENT_COUNT", "Expected event count differs from the supplied history.");
  ensure(stable(envelope.seed) === stable(seed), "SEED_MISMATCH", "The export was made from a different source fixture.");
  const state = replayEvents(seed, envelope.events);
  exact(envelope.snapshot, ["accounts", "posts", "follows", "likes", "recaws", "poolDust", "receipts"], [], "Snapshot");
  ensure(stable(envelope.snapshot) === stable(snapshot(state)), "SNAPSHOT_MISMATCH", "The final snapshot differs from the rebuilt event history.");
  stable(envelope);
  return state;
}

export function formatAmount(value) {
  const raw = typeof value === "bigint" ? value : amount(value, "Displayed amount");
  ensure(raw >= 0n && raw <= MAX_UINT, "INVALID_AMOUNT", "Displayed amount is outside the supported range.");
  const whole = (raw / UNIT).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (raw % UNIT).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? whole + "." + fraction : whole;
}
