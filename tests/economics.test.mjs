// Integration destination: app/tests/economics.test.mjs.
// The module destination is app/public/economics.mjs. No upstream code is used.
import test from "node:test";
import assert from "node:assert/strict";
import { allocateFee, DEMO_FEES } from "../public/economics.mjs";

const APPENDIX = "appendix-demo-v1";
const PROSE = "prose-recipient-interpretation-v1";
const MAX_UINT = (1n << 256n) - 1n;
const SAMPLE = Object.freeze([
  Object.freeze({ name: "payer", stake: "999" }),
  Object.freeze({ name: "zoe", stake: "1" }),
  Object.freeze({ name: "bob", stake: "3" }),
]);
const row = (account, amount, reason) => ({ account, amount, reason });
const result = (directAmount, poolAmount, poolDustAdded, allocations) => ({ directAmount, poolAmount, poolDustAdded, allocations });
const recipientFor = (kind) => kind === "caw" || kind === "transfer" ? null : "zoe";
const calculate = (kind, fee, profile = APPENDIX, entries = SAMPLE) =>
  allocateFee(kind, fee, "payer", recipientFor(kind), entries, profile);
function rejects(action, code) {
  assert.throws(action, { code });
}
function conserve(calculated, fee) {
  const credits = calculated.allocations.reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
  const recipientCredits = calculated.allocations.filter((entry) => entry.reason === "recipient")
    .reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
  const poolCredits = calculated.allocations.filter((entry) => entry.reason === "stake-pool")
    .reduce((sum, entry) => sum + BigInt(entry.amount), 0n);
  assert.equal(BigInt(calculated.directAmount) + BigInt(calculated.poolAmount), BigInt(fee));
  assert.equal(recipientCredits, BigInt(calculated.directAmount));
  assert.equal(poolCredits + BigInt(calculated.poolDustAdded), BigInt(calculated.poolAmount));
  assert.equal(credits + BigInt(calculated.poolDustAdded), BigInt(fee));
  assert.ok(calculated.allocations.every((entry) => BigInt(entry.amount) > 0n));
}

test("demo prices are exact frozen synthetic base-unit strings", () => {
  assert.deepEqual(DEMO_FEES, {
    caw: "5000000000000000000000",
    like: "2000000000000000000000",
    recaw: "4000000000000000000000",
    follow: "30000000000000000000000",
    transfer: "0",
  });
  assert.ok(Object.isFrozen(DEMO_FEES));
  assert.throws(() => { DEMO_FEES.like = "1"; }, TypeError);
  assert.throws(() => { DEMO_FEES.other = "1"; }, TypeError);
});

test("appendix allocation preserves literal CAW, like, reCAW and follow results", () => {
  // The payer's 999 weight is excluded. The other weights are bob:3, zoe:1.
  assert.deepEqual(calculate("caw", "5000"), result("0", "5000", "0", [
    row("bob", "3750", "stake-pool"), row("zoe", "1250", "stake-pool"),
  ]));
  assert.deepEqual(calculate("like", "2000"), result("1600", "400", "0", [
    row("zoe", "1600", "recipient"), row("bob", "300", "stake-pool"), row("zoe", "100", "stake-pool"),
  ]));
  assert.deepEqual(calculate("recaw", "4000"), result("2000", "2000", "0", [
    row("zoe", "2000", "recipient"), row("bob", "1500", "stake-pool"), row("zoe", "500", "stake-pool"),
  ]));
  assert.deepEqual(calculate("follow", "30000"), result("24000", "6000", "0", [
    row("zoe", "24000", "recipient"), row("bob", "4500", "stake-pool"), row("zoe", "1500", "stake-pool"),
  ]));
  assert.deepEqual(allocateFee("like", "2000", "payer", "zoe", SAMPLE), calculate("like", "2000", APPENDIX));
});

test("full-size synthetic prices retain exact integer arithmetic", () => {
  assert.deepEqual(calculate("like", DEMO_FEES.like), result(
    "1600000000000000000000", "400000000000000000000", "0", [
      row("zoe", "1600000000000000000000", "recipient"),
      row("bob", "300000000000000000000", "stake-pool"),
      row("zoe", "100000000000000000000", "stake-pool"),
    ],
  ));
  for (const [kind, fee] of Object.entries(DEMO_FEES)) conserve(calculate(kind, fee), fee);
});

test("experimental prose profile sends all like and reCAW fees directly; follow still borrows appendix", () => {
  assert.deepEqual(calculate("like", "2000", PROSE), result("2000", "0", "0", [row("zoe", "2000", "recipient")]));
  assert.deepEqual(calculate("recaw", "4000", PROSE), result("4000", "0", "0", [row("zoe", "4000", "recipient")]));
  assert.deepEqual(calculate("follow", "30000", PROSE), calculate("follow", "30000", APPENDIX));
  assert.deepEqual(calculate("caw", "5000", PROSE), calculate("caw", "5000", APPENDIX));
  assert.deepEqual(calculate("transfer", "0", PROSE), result("0", "0", "0", []));
});

test("rounding is per credit, keeps visible dust, and omits zero rows", () => {
  assert.deepEqual(calculate("like", "7"), result("5", "2", "1", [
    row("zoe", "5", "recipient"), row("bob", "1", "stake-pool"),
  ]));
  assert.deepEqual(calculate("like", "1"), result("0", "1", "1", []));
  assert.deepEqual(calculate("recaw", "7"), result("3", "4", "0", [
    row("zoe", "3", "recipient"), row("bob", "3", "stake-pool"), row("zoe", "1", "stake-pool"),
  ]));
  const equal = [
    { name: "payer", stake: "1000000" }, { name: "zoe", stake: "1" },
    { name: "bob", stake: "1" }, { name: "amy", stake: "1" },
  ];
  assert.deepEqual(calculate("caw", "8", APPENDIX, equal), result("0", "8", "2", [
    row("amy", "2", "stake-pool"), row("bob", "2", "stake-pool"), row("zoe", "2", "stake-pool"),
  ]));
});

test("conservation holds across both profiles, odd values, zero and uint256 boundary", () => {
  const weights = [SAMPLE,
    [{ name: "payer", stake: "0" }, { name: "zoe", stake: "0" }, { name: "bob", stake: "1" }],
    [{ name: "payer", stake: "1000000" }, { name: "zoe", stake: "999999" }, { name: "bob", stake: "1000000" }],
  ];
  for (const profile of [APPENDIX, PROSE]) {
    for (const kind of ["caw", "like", "recaw", "follow"]) {
      for (const fee of ["0", "1", "2", "7", "2000", "4000", "30000", MAX_UINT.toString()]) {
        for (const entries of weights) conserve(calculate(kind, fee, profile, entries), fee);
      }
    }
  }
});

test("pool excludes payer and zero weight; credits preserve direct then sorted pool order", () => {
  const entries = [
    { name: "payer", stake: "0" }, { name: "zoe", stake: "1" },
    { name: "bob", stake: "3" }, { name: "amy", stake: "0" },
  ];
  const before = calculate("like", "2000", APPENDIX, entries);
  entries[0].stake = "1000000";
  assert.deepEqual(calculate("like", "2000", APPENDIX, entries), before);
  assert.deepEqual(before.allocations.map((entry) => entry.account), ["zoe", "bob", "zoe"]);
  assert.ok(!before.allocations.some((entry) => entry.account === "payer" || entry.account === "amy"));
  const reversed = [...entries].reverse();
  assert.deepEqual(calculate("like", "2000", APPENDIX, reversed), before);
});

test("positive unresolved pools reject, while truly zero pools need no other staker", () => {
  const noOtherStakers = [{ name: "payer", stake: "1000000" }, { name: "zoe", stake: "0" }];
  for (const profile of [APPENDIX, PROSE]) {
    for (const kind of ["caw", "follow"]) rejects(() => calculate(kind, "2000", profile, noOtherStakers), "UNRESOLVED_POOL");
  }
  for (const kind of ["like", "recaw"]) {
    rejects(() => calculate(kind, "2000", APPENDIX, noOtherStakers), "UNRESOLVED_POOL");
    assert.deepEqual(calculate(kind, "2000", PROSE, noOtherStakers), result("2000", "0", "0", [row("zoe", "2000", "recipient")]));
  }
  for (const profile of [APPENDIX, PROSE]) {
    for (const kind of ["caw", "like", "recaw", "follow", "transfer"]) {
      assert.deepEqual(calculate(kind, "0", profile, noOtherStakers), result("0", "0", "0", []));
    }
    for (const kind of ["caw", "transfer"]) {
      assert.deepEqual(allocateFee(kind, "0", "payer", null, [{ name: "payer", stake: "0" }], profile), result("0", "0", "0", []));
    }
  }
});

test("fee accepts canonical uint256 integers only and never coerces objects", () => {
  conserve(calculate("caw", MAX_UINT.toString()), MAX_UINT.toString());
  rejects(() => calculate("caw", (MAX_UINT + 1n).toString()), "AMOUNT_OVERFLOW");
  const malformed = ["", "00", "01", "-0", "-1", "+1", "1.0", "1e3", "0x10", " 1", "1 ", "1\n", "١", "9".repeat(79), 0, 1, 1n, NaN, Infinity, null, undefined, new String("1")];
  for (const fee of malformed) rejects(() => calculate("caw", fee), "INVALID_AMOUNT");
  let coercions = 0;
  rejects(() => calculate("caw", { toString() { coercions += 1; return "1"; } }), "INVALID_AMOUNT");
  assert.equal(coercions, 0);
  rejects(() => calculate("transfer", "1"), "INVALID_AMOUNT");
});

test("stake weights are bounded canonical integer strings, including zero", () => {
  const entries = [{ name: "payer", stake: "0" }, { name: "zoe", stake: "1000000" }];
  assert.deepEqual(calculate("caw", "7", APPENDIX, entries), result("0", "7", "0", [row("zoe", "7", "stake-pool")]));
  for (const stake of ["1000001", "9999999"]) {
    rejects(() => calculate("caw", "7", APPENDIX, [{ name: "payer", stake: "0" }, { name: "zoe", stake }]), "AMOUNT_OVERFLOW");
  }
  for (const stake of ["", "00", "01", "-0", "-1", "+1", "1.5", "1e3", " 1", "1\n", "10000000", 0, 1, 1n, null, undefined, new String("1")]) {
    rejects(() => calculate("caw", "7", APPENDIX, [{ name: "payer", stake: "0" }, { name: "zoe", stake }]), "INVALID_AMOUNT");
  }
});

test("unknown actions, profiles, names, recipients and extra arguments reject", () => {
  for (const kind of ["CAW", "comment", "__proto__", "", null, {}, new String("caw")]) {
    rejects(() => allocateFee(kind, "1", "payer", null, SAMPLE), "INVALID_KIND");
  }
  for (const profile of ["prose", "appendix", "", null, {}, new String(APPENDIX)]) {
    rejects(() => calculate("caw", "1", profile), "INVALID_PROFILE");
  }
  for (const actor of ["", "Payer", "has_space", "a-b", "a".repeat(33), "zoe\n", null, {}, new String("payer")]) {
    rejects(() => allocateFee("caw", "1", actor, null, SAMPLE), "INVALID_NAME");
  }
  rejects(() => allocateFee("caw", "1", "absent", null, SAMPLE), "UNKNOWN_ACCOUNT");
  rejects(() => allocateFee("like", "1", "payer", "absent", SAMPLE), "UNKNOWN_ACCOUNT");
  rejects(() => allocateFee("like", "1", "payer", null, SAMPLE), "INVALID_NAME");
  for (const kind of ["like", "recaw", "follow"]) {
    rejects(() => allocateFee(kind, "1", "payer", "payer", SAMPLE), "SELF_INTERACTION");
  }
  for (const kind of ["caw", "transfer"]) {
    rejects(() => allocateFee(kind, "0", "payer", "zoe", SAMPLE), "INVALID_TARGET");
    rejects(() => allocateFee(kind, "0", "payer", undefined, SAMPLE), "INVALID_TARGET");
  }
  rejects(() => allocateFee("caw", "1", "payer", null, SAMPLE, APPENDIX, "extra"), "INVALID_ARGUMENTS");
});

test("accounts require unique exact data records and an ordinary bounded dense array", () => {
  for (const bad of [null, {}, "accounts", new Set(SAMPLE)]) {
    rejects(() => calculate("caw", "1", APPENDIX, bad), "INVALID_SCHEMA");
  }
  rejects(() => calculate("caw", "1", APPENDIX, []), "UNKNOWN_ACCOUNT");
  rejects(() => calculate("caw", "1", APPENDIX, [...SAMPLE, { name: "bob", stake: "0" }]), "DUPLICATE_ACCOUNT");
  const maximum = [{ name: "payer", stake: "1" }, ...Array.from({ length: 31 }, (_, index) => ({ name: "a" + index, stake: "1" }))];
  const atBound = allocateFee("caw", "31", "payer", null, maximum);
  assert.equal(atBound.allocations.length, 31);
  conserve(atBound, "31");
  rejects(() => allocateFee("caw", "32", "payer", null, [...maximum, { name: "last", stake: "1" }]), "INVALID_SCHEMA");
  const holes = new Array(2);
  holes[0] = SAMPLE[0];
  const extra = [...SAMPLE];
  extra.note = "extra";
  const symbolExtra = [...SAMPLE];
  symbolExtra[Symbol("extra")] = true;
  const replacedHole = [SAMPLE[0], SAMPLE[1]];
  delete replacedHole[1];
  replacedHole.note = SAMPLE[1];
  const subclass = new (class extends Array {})();
  subclass.push(...SAMPLE);
  const hiddenIndex = [...SAMPLE];
  Object.defineProperty(hiddenIndex, "1", { enumerable: false });
  for (const bad of [holes, extra, symbolExtra, replacedHole, subclass, hiddenIndex]) {
    rejects(() => calculate("caw", "1", APPENDIX, bad), "INVALID_SCHEMA");
  }
  const hiddenField = { name: "zoe", stake: "1" };
  Object.defineProperty(hiddenField, "stake", { enumerable: false });
  const extraSymbol = { name: "zoe", stake: "1", [Symbol("extra")]: "x" };
  const extraPrototypeKey = Object.assign(Object.create(null), { name: "zoe", stake: "1", __proto__: null });
  Object.defineProperty(extraPrototypeKey, "__proto__", { value: {}, enumerable: true });
  const malformedRecords = [null, [], "zoe", { name: "zoe" }, { stake: "1" },
    { name: "zoe", stake: "1", balance: "0" }, hiddenField, extraSymbol, extraPrototypeKey,
    Object.create({ name: "zoe", stake: "1" }), new (class Account { constructor() { this.name = "zoe"; this.stake = "1"; } })()];
  for (const bad of malformedRecords) {
    rejects(() => calculate("caw", "1", APPENDIX, [SAMPLE[0], bad]), "INVALID_SCHEMA");
  }
  rejects(() => calculate("caw", "1", APPENDIX, [SAMPLE[0], { name: "bad name", stake: "1" }]), "INVALID_NAME");
});

test("account and array accessors are rejected without invoking them", () => {
  let reads = 0;
  for (const field of ["name", "stake"]) {
    const entry = { name: "zoe", stake: "1" };
    Object.defineProperty(entry, field, { enumerable: true, get() { reads += 1; throw new Error("getter ran"); } });
    rejects(() => calculate("caw", "1", APPENDIX, [SAMPLE[0], entry]), "INVALID_SCHEMA");
  }
  const entries = [...SAMPLE];
  Object.defineProperty(entries, "1", { enumerable: true, get() { reads += 1; throw new Error("index getter ran"); } });
  rejects(() => calculate("caw", "1", APPENDIX, entries), "INVALID_SCHEMA");
  const hook = { name: "zoe", stake: "1", toJSON() { reads += 1; throw new Error("hook ran"); } };
  rejects(() => calculate("caw", "1", APPENDIX, [SAMPLE[0], hook]), "INVALID_SCHEMA");
  assert.equal(reads, 0);
});

test("allocation is pure, supports exact null-prototype records, and returns fresh data", () => {
  const snapshot = JSON.stringify(SAMPLE);
  const first = calculate("like", "2000");
  const second = calculate("like", "2000");
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.allocations, second.allocations);
  assert.notEqual(first.allocations[0], second.allocations[0]);
  first.allocations[0].amount = "1";
  first.allocations.push(row("payer", "0", "recipient"));
  assert.equal(second.allocations[0].amount, "1600");
  assert.equal(second.allocations.length, 3);
  assert.equal(JSON.stringify(SAMPLE), snapshot);
  const nullRecords = SAMPLE.map((entry) => Object.freeze(Object.assign(Object.create(null), entry)));
  Object.freeze(nullRecords);
  assert.deepEqual(calculate("like", "2000", APPENDIX, nullRecords), second);
  const prototypeNamed = [{ name: "constructor", stake: "1" }, { name: "tostring", stake: "1" }];
  assert.deepEqual(allocateFee("caw", "2", "constructor", null, prototypeNamed), result("0", "2", "0", [row("tostring", "2", "stake-pool")]));
  // A frozen caller projection and original order remain unchanged for both profiles.
  for (const profile of [APPENDIX, PROSE]) {
    for (const [kind, fee] of Object.entries(DEMO_FEES)) calculate(kind, fee, profile);
  }
  assert.equal(JSON.stringify(SAMPLE), snapshot);
});
