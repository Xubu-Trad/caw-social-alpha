// Original, pure synthetic accounting. No wallets, network, custody or token lookup.
// These prices use the demo's assumed 18 decimal places; they do not establish
// a deployed token's decimals, a currency value, or an adopted protocol schedule.
export const DEMO_FEES = Object.freeze({
  caw: "5000000000000000000000",
  like: "2000000000000000000000",
  recaw: "4000000000000000000000",
  follow: "30000000000000000000000",
  transfer: "0",
});

const MAX_UINT = (1n << 256n) - 1n;
const MAX_WEIGHT = 1000000n;
const KINDS = new Set(["caw", "like", "recaw", "follow", "transfer"]);
const PROFILES = new Set(["appendix-demo-v1", "prose-recipient-interpretation-v1"]);

function ensure(condition, code, message) {
  if (condition) return;
  const error = new Error(message);
  error.code = code;
  throw error;
}

function uint(value, maximum, maximumDigits, label) {
  // An absolute end check also rejects final line terminators accepted by `$`.
  ensure(typeof value === "string" && value.length <= maximumDigits && /^(0|[1-9][0-9]*)(?![\s\S])/.test(value),
    "INVALID_AMOUNT", label + " must be a canonical nonnegative integer string.");
  const parsed = BigInt(value);
  ensure(parsed <= maximum, "AMOUNT_OVERFLOW", label + " exceeds the demo's integer bound.");
  return parsed;
}

function name(value) {
  ensure(typeof value === "string" && /^[a-z0-9]{1,32}(?![\s\S])/.test(value),
    "INVALID_NAME", "Demo account names require 1–32 lowercase letters or digits.");
  return value;
}

function account(value) {
  ensure(value !== null && typeof value === "object" && !Array.isArray(value),
    "INVALID_SCHEMA", "An account must be a plain data record.");
  const prototype = Object.getPrototypeOf(value);
  ensure(prototype === Object.prototype || prototype === null,
    "INVALID_SCHEMA", "An account must be a plain data record.");
  const keys = Reflect.ownKeys(value);
  ensure(keys.length === 2 && keys.includes("name") && keys.includes("stake"),
    "INVALID_SCHEMA", "An account must contain exactly name and stake.");
  const nameProperty = Object.getOwnPropertyDescriptor(value, "name");
  const stakeProperty = Object.getOwnPropertyDescriptor(value, "stake");
  for (const property of [nameProperty, stakeProperty]) {
    ensure(property && Object.hasOwn(property, "value") && property.enumerable,
      "INVALID_SCHEMA", "Account fields must be enumerable data properties.");
  }
  // Reading descriptor values avoids invoking supplied field getters.
  return {
    name: name(nameProperty.value),
    weight: uint(stakeProperty.value, MAX_WEIGHT, 7, "Stake weight"),
  };
}

function accounts(value) {
  ensure(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype,
    "INVALID_SCHEMA", "Accounts must be an ordinary array.");
  const length = Object.getOwnPropertyDescriptor(value, "length").value;
  ensure(length <= 32 && Reflect.ownKeys(value).length === length + 1,
    "INVALID_SCHEMA", "Accounts must be dense, contain at most 32 entries, and have no extra properties.");
  const result = [];
  const seen = new Set();
  for (let index = 0; index < length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    ensure(property && Object.hasOwn(property, "value") && property.enumerable,
      "INVALID_SCHEMA", "Account entries must be enumerable data properties.");
    const entry = account(property.value);
    ensure(!seen.has(entry.name), "DUPLICATE_ACCOUNT", "Account names must be unique.");
    seen.add(entry.name);
    result.push(entry);
  }
  return result;
}

/**
 * Allocate a caller-provided integer fee; the caller chooses the action price.
 * Input accounts are exact {name, stake} records with canonical integer strings
 * for stake (0..1000000). Weights are a fixed snapshot, not changed by credits.
 *
 * appendix-demo-v1: manifesto appendix lines 137–140, kept provisional.
 * prose-recipient-interpretation-v1: experimental OP-only like/reCAW reading of
 * lines 55/58/118. Line 119 also mentions an OP/staker split, so this profile is
 * not a settled reading of the whole prose. Follow uses the appendix in both.
 *
 * Policy choices: exclude payer from pools; floor each share; expose dust;
 * reject a positive pool without another positive-weight staker. Self-directed
 * like/reCAW/follow are rejected. The synthetic transfer action has no fee.
 * No balances, ownership, authentication or EVM overflow semantics are checked.
 */
export function allocateFee(kind, feeDecimalString, actorName, targetNameOrNull, accountsArray, profile = "appendix-demo-v1") {
  ensure(arguments.length <= 6, "INVALID_ARGUMENTS", "Unexpected allocation arguments.");
  ensure(typeof kind === "string" && KINDS.has(kind), "INVALID_KIND", "Unknown demo action.");
  ensure(typeof profile === "string" && PROFILES.has(profile), "INVALID_PROFILE", "Unknown economics profile.");
  const fee = uint(feeDecimalString, MAX_UINT, 78, "Fee");
  const actor = name(actorName);
  const entries = accounts(accountsArray);
  const known = new Set(entries.map((entry) => entry.name));
  ensure(known.has(actor), "UNKNOWN_ACCOUNT", "The payer must be an input account.");
  const hasRecipient = kind === "like" || kind === "recaw" || kind === "follow";
  let target = null;
  if (hasRecipient) {
    target = name(targetNameOrNull);
    ensure(known.has(target), "UNKNOWN_ACCOUNT", "The recipient must be an input account.");
    ensure(target !== actor, "SELF_INTERACTION", "Self-directed interactions are rejected in the demo.");
  } else {
    ensure(targetNameOrNull === null, "INVALID_TARGET", "This action requires a null recipient.");
  }
  ensure(kind !== "transfer" || fee === 0n, "INVALID_AMOUNT", "The demo transfer fee must be zero.");

  let direct = 0n;
  if (profile === "prose-recipient-interpretation-v1" && (kind === "like" || kind === "recaw")) {
    direct = fee;
  } else if (kind === "like" || kind === "follow") {
    direct = fee * 80n / 100n;
  } else if (kind === "recaw") {
    direct = fee / 2n;
  }

  const pool = fee - direct;
  const allocations = [];
  if (direct > 0n) allocations.push({ account: target, amount: direct.toString(), reason: "recipient" });
  let dust = 0n;
  if (pool > 0n) {
    const eligible = entries.filter((entry) => entry.name !== actor && entry.weight > 0n)
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0n);
    ensure(totalWeight > 0n, "UNRESOLVED_POOL",
      "No eligible other stakers. This unresolved case is rejected in the demo.");
    let distributed = 0n;
    for (const recipient of eligible) {
      const credit = pool * recipient.weight / totalWeight;
      distributed += credit;
      if (credit > 0n) allocations.push({ account: recipient.name, amount: credit.toString(), reason: "stake-pool" });
    }
    dust = pool - distributed;
  }

  return {
    directAmount: direct.toString(),
    poolAmount: pool.toString(),
    poolDustAdded: dust.toString(),
    allocations,
  };
}
