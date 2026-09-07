import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  UNIT, SCENARIO, createState, previewAction, applyAction,
  rebuild, canonicalExport, countCharacters, formatAmount,
} from "../public/model.mjs";

const FIXTURE = JSON.parse(readFileSync(new URL("../public/fixtures.json", import.meta.url), "utf8"));
const copy = (value) => JSON.parse(JSON.stringify(value));
const start = () => createState(copy(FIXTURE));
const total = (state) => Object.values(state.accounts).reduce((sum, account) => sum + BigInt(account.balance), BigInt(state.poolDust));
const intent = (state, actor, kind, extra = {}) => ({
  id: actor + "-" + kind + "-" + state.accounts[actor].nonce,
  kind, actor,
  controller: state.accounts[actor].controller,
  epoch: state.accounts[actor].epoch,
  nonce: state.accounts[actor].nonce,
  ...extra,
});
const apply = (state, actor, kind, extra = {}) => applyAction(state, intent(state, actor, kind, extra));
const code = (expected) => (error) => error instanceof Error && error.code === expected;

test("canonical fields reject trailing line terminators before any settlement", () => {
  for (const suffix of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
    for (const [field, expected] of [["name", "INVALID_NAME"], ["controller", "INVALID_CONTROLLER"], ["balance", "INVALID_AMOUNT"], ["stake", "INVALID_AMOUNT"]]) {
      const fixture = copy(FIXTURE);
      fixture.accounts[0][field] += suffix;
      assert.throws(() => createState(fixture), code(expected), field + JSON.stringify(suffix));
    }
    const state = start(), before = canonicalExport(state);
    assert.throws(() => apply(state, "pioneer", "caw", { id: "action" + suffix, text: "A valid body." }), code("INVALID_ID"));
    assert.throws(() => apply(state, "pioneer", "transfer", { newController: "device-next" + suffix }), code("INVALID_CONTROLLER"));
    assert.equal(canonicalExport(state), before);
  }
});

test("fixture is synthetic, JSON-compatible and preserves separate fixed stake weights", () => {
  const state = start();
  assert.equal(state.scenario, SCENARIO);
  assert.equal(state.simulated, true);
  assert.equal(state.accounts.pioneer.balance, (250000n * UNIT).toString());
  assert.equal(state.accounts.signal.balance, (120000n * UNIT).toString());
  assert.equal(state.accounts.keeper.balance, (750000n * UNIT).toString());
  assert.deepEqual(Object.values(state.accounts).map((entry) => entry.stake), ["3", "1", "2"]);
  assert.equal(total(state), 1120000n * UNIT);
  assert.doesNotThrow(() => JSON.stringify(state));
});

test("post settlement debits the full fee, excludes payer and exposes one base unit of dust", () => {
  const state = start();
  const action = intent(state, "pioneer", "caw", { text: "Keep every base unit visible." });
  const before = JSON.stringify(state);
  const preview = previewAction(state, action);
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.fee, (5000n * UNIT).toString());
  assert.equal(preview.poolAmount, (5000n * UNIT).toString());
  assert.equal(preview.poolDustAdded, "1");
  assert.equal(preview.allocations.find((entry) => entry.account === "signal").amount, "1666666666666666666666");
  assert.equal(preview.allocations.find((entry) => entry.account === "keeper").amount, "3333333333333333333333");
  assert.equal(preview.allocations.some((entry) => entry.account === "pioneer"), false);
  const next = applyAction(state, action);
  assert.equal(JSON.stringify(state), before);
  assert.equal(next.accounts.pioneer.balance, (245000n * UNIT).toString());
  assert.equal(next.poolDust, "1");
  assert.equal(total(next), total(state));
  assert.equal(next.posts.at(-1).id, "post-" + action.id);
  assert.equal(next.posts.at(-1).time, "Local session");
  assert.equal(next.receipts.at(-1).simulated, true);
});

test("recipient and stake-pool credits combine without losing or double-counting value", () => {
  const state = start();
  const next = apply(state, "signal", "like", { postId: "seed-post" });
  assert.equal(BigInt(next.accounts.signal.balance), 118000n * UNIT);
  assert.equal(BigInt(next.accounts.pioneer.balance), 251840n * UNIT);
  assert.equal(BigInt(next.accounts.keeper.balance), 750160n * UNIT);
  assert.equal(next.poolDust, "0");
  assert.equal(next.likes.length, 1);
  assert.equal(total(next), total(state));
});

test("recaw and follow use the labelled appendix scenario with exact integer recipients", () => {
  const recaw = apply(start(), "signal", "recaw", { postId: "seed-post" });
  assert.equal(BigInt(recaw.accounts.pioneer.balance), 253200n * UNIT);
  assert.equal(BigInt(recaw.accounts.keeper.balance), 750800n * UNIT);
  assert.equal(BigInt(recaw.accounts.signal.balance), 116000n * UNIT);
  const follow = apply(start(), "signal", "follow", { target: "keeper" });
  assert.equal(BigInt(follow.accounts.pioneer.balance), 253600n * UNIT);
  assert.equal(BigInt(follow.accounts.keeper.balance), 776400n * UNIT);
  assert.equal(BigInt(follow.accounts.signal.balance), 90000n * UNIT);
});

test("conservation holds through mixed actions, dust accumulation and controller transfer", () => {
  let state = start();
  const initialTotal = total(state);
  const steps = [
    ["pioneer", "caw", { text: "One local post." }],
    ["signal", "like", { postId: "seed-post" }],
    ["keeper", "follow", { target: "signal" }],
    ["signal", "recaw", { postId: "seed-post" }],
    ["keeper", "transfer", { newController: "device-new" }],
    ["keeper", "caw", { text: "After a synthetic transfer." }],
  ];
  for (const [actor, kind, extra] of steps) {
    const prior = state;
    const priorJSON = JSON.stringify(prior);
    state = apply(state, actor, kind, extra);
    assert.equal(total(state), initialTotal);
    assert.equal(JSON.stringify(prior), priorJSON);
    assert.equal(state.events.length, state.receipts.length);
  }
  assert.equal(state.accounts.keeper.controller, "device-new");
  assert.equal(state.accounts.keeper.epoch, 1);
  assert.equal(state.seed.accounts.find((entry) => entry.name === "keeper").controller, "device-c");
});

test("synthetic transfer invalidates old controller, epoch and pending nonce", () => {
  const state = start();
  const pending = intent(state, "pioneer", "caw", { id: "pending", text: "Do not apply after transfer." });
  const next = apply(state, "pioneer", "transfer", { newController: "device-next" });
  assert.equal(next.accounts.pioneer.epoch, 1);
  assert.equal(next.accounts.pioneer.nonce, 1);
  assert.equal(next.accounts.pioneer.balance, state.accounts.pioneer.balance);
  assert.equal(next.accounts.pioneer.stake, state.accounts.pioneer.stake);
  assert.throws(() => applyAction(next, pending), code("STALE_CONTROLLER"));
  assert.throws(() => applyAction(next, { ...pending, controller: "device-next" }), code("STALE_EPOCH"));
  assert.throws(() => applyAction(next, { ...pending, controller: "device-next", epoch: 1 }), code("INVALID_NONCE"));
  assert.doesNotThrow(() => apply(next, "pioneer", "caw", { text: "A fresh local intent." }));
});

test("replay and duplicate economic interactions cannot charge the same action twice", () => {
  const state = start();
  const first = intent(state, "signal", "like", { postId: "seed-post" });
  const next = applyAction(state, first);
  assert.throws(() => applyAction(next, first), code("REPLAY"));
  assert.throws(() => applyAction(next, { ...first, id: "other-id" }), code("INVALID_NONCE"));
  assert.throws(() => apply(next, "signal", "like", { postId: "seed-post" }), code("DUPLICATE_ACTION"));
  const followed = apply(state, "signal", "follow", { target: "keeper" });
  assert.throws(() => apply(followed, "signal", "follow", { target: "keeper" }), code("DUPLICATE_ACTION"));
  const recawed = apply(state, "signal", "recaw", { postId: "seed-post" });
  assert.throws(() => apply(recawed, "signal", "recaw", { postId: "seed-post" }), code("DUPLICATE_ACTION"));
});

test("self-interactions are rejected as an explicit fixture policy", () => {
  for (const kind of ["like", "recaw"]) assert.throws(() => apply(start(), "pioneer", kind, { postId: "seed-post" }), code("SELF_INTERACTION"));
  assert.throws(() => apply(start(), "pioneer", "follow", { target: "pioneer" }), code("SELF_INTERACTION"));
});

test("one-base-unit underfunding fails; exact fee can reduce balance to zero", () => {
  const poorSeed = copy(FIXTURE);
  poorSeed.accounts[0].balance = (5000n * UNIT - 1n).toString();
  const poor = createState(poorSeed);
  const before = JSON.stringify(poor);
  assert.throws(() => apply(poor, "pioneer", "caw", { text: "Underfunded." }), code("INSUFFICIENT_BALANCE"));
  assert.equal(JSON.stringify(poor), before);
  poorSeed.accounts[0].balance = (5000n * UNIT).toString();
  const exact = apply(createState(poorSeed), "pioneer", "caw", { text: "Exact fee." });
  assert.equal(exact.accounts.pioneer.balance, "0");
});

test("zero eligible stake rejects settlement instead of inventing a fee recipient", () => {
  const seed = copy(FIXTURE);
  seed.accounts[1].stake = "0";
  seed.accounts[2].stake = "0";
  const state = createState(seed);
  const before = JSON.stringify(state);
  assert.throws(() => apply(state, "pioneer", "caw", { text: "No other eligible stake." }), code("UNRESOLVED_POOL"));
  assert.equal(JSON.stringify(state), before);
  assert.doesNotThrow(() => apply(state, "pioneer", "transfer", { newController: "device-other" }));
});

test("credits cannot overflow the declared uint256-sized demo balance bound", () => {
  const seed = copy(FIXTURE);
  seed.accounts[2].balance = ((1n << 256n) - 1n).toString();
  assert.throws(() => apply(createState(seed), "pioneer", "caw", { text: "Bounded credit." }), code("AMOUNT_OVERFLOW"));
});

test("Unicode is counted as code points, malformed surrogates fail, and exact text survives", () => {
  assert.equal(countCharacters(""), 0);
  assert.equal(countCharacters("😀"), 1);
  assert.equal(countCharacters("e\u0301"), 2);
  assert.equal(countCharacters("é"), 1);
  const boundary = apply(start(), "pioneer", "caw", { text: "😀".repeat(420) });
  assert.equal(boundary.receipts.at(-1).characterCount, 420);
  assert.throws(() => apply(start(), "pioneer", "caw", { text: "😀".repeat(421) }), code("TEXT_TOO_LONG"));
  assert.throws(() => countCharacters("\ud800"), code("INVALID_UNICODE"));
  assert.throws(() => countCharacters("\udc00"), code("INVALID_UNICODE"));
  assert.throws(() => countCharacters("x\ud800y"), code("INVALID_UNICODE"));
  const exact = "  e\u0301\nمرحبا 👩‍🔬  ";
  const state = apply(start(), "pioneer", "caw", { text: exact });
  assert.equal(state.posts.at(-1).text, exact);
  assert.equal(state.events.at(-1).intent.text, exact);
  assert.equal(state.receipts.at(-1).text, exact);
  assert.equal(rebuild(FIXTURE, JSON.parse(canonicalExport(state))).posts.at(-1).text, exact);
});

test("strict schemas reject extra fields, wrong types, invalid IDs and noncanonical amounts", () => {
  const state = start();
  const valid = intent(state, "pioneer", "caw", { text: "A bounded intent." });
  assert.throws(() => previewAction(state, { ...valid, fee: "0" }), code("UNKNOWN_FIELD"));
  assert.throws(() => previewAction(state, { ...valid, id: "" }), code("INVALID_ID"));
  assert.throws(() => previewAction(state, { ...valid, id: "../escape" }), code("INVALID_ID"));
  assert.throws(() => previewAction(state, { ...valid, nonce: "0" }), code("INVALID_INTEGER"));
  assert.throws(() => previewAction(state, { ...valid, nonce: -0 }), code("INVALID_INTEGER"));
  assert.throws(() => previewAction(state, { ...valid, kind: "constructor" }), code("INVALID_KIND"));
  assert.throws(() => previewAction(state, { ...valid, controller: "0x1234" }), code("INVALID_CONTROLLER"));
  assert.throws(() => apply(state, "pioneer", "caw", { text: "   \n" }), code("EMPTY_TEXT"));
  const seed = copy(FIXTURE);
  seed.accounts[0].balance = "01";
  assert.throws(() => createState(seed), code("INVALID_AMOUNT"));
  seed.accounts[0].balance = 100;
  assert.throws(() => createState(seed), code("INVALID_AMOUNT"));
  seed.accounts[0].balance = "1";
  seed.accounts[0].name = "Pioneer";
  assert.throws(() => createState(seed), code("INVALID_NAME"));
});

test("two clean rebuilds produce the same canonical snapshot and event history", () => {
  let state = apply(start(), "pioneer", "caw", { text: "Replay this exactly." });
  state = apply(state, "signal", "like", { postId: "seed-post" });
  state = apply(state, "keeper", "transfer", { newController: "device-rebuild" });
  const encoded = canonicalExport(state);
  const envelope = JSON.parse(encoded);
  const first = rebuild(FIXTURE, envelope);
  const second = rebuild(FIXTURE, copy(envelope));
  assert.equal(canonicalExport(first), encoded);
  assert.equal(canonicalExport(second), encoded);
  assert.notEqual(first, second);
  assert.equal(envelope.expectedEventCount, 3);
});

test("rebuild detects incomplete, reordered, duplicate and inconsistent edited records", () => {
  let state = apply(start(), "pioneer", "caw", { text: "An exact first message." });
  state = apply(state, "signal", "like", { postId: "seed-post" });
  const good = JSON.parse(canonicalExport(state));
  const cases = [
    [(value) => value.events.pop(), "EVENT_COUNT"],
    [(value) => { value.events.pop(); value.expectedEventCount -= 1; }, "SNAPSHOT_MISMATCH"],
    [(value) => value.events.reverse(), "EVENT_ORDER"],
    [(value) => { value.events.push(copy(value.events[0])); value.expectedEventCount += 1; }, "EVENT_ORDER"],
    [(value) => { value.events[0].receipt.fee = "0"; }, "EVENT_MISMATCH"],
    [(value) => { value.events[0].intent.text = "Changed without matching receipt."; }, "EVENT_MISMATCH"],
    [(value) => { value.snapshot.accounts.pioneer.balance = "1"; }, "SNAPSHOT_MISMATCH"],
    [(value) => { value.debug = true; }, "UNKNOWN_FIELD"],
    [(value) => { value.snapshot.extra = true; }, "UNKNOWN_FIELD"],
    [(value) => { value.events[0].extra = true; }, "UNKNOWN_FIELD"],
    [(value) => { value.seed.accounts[0].balance = "1"; }, "SEED_MISMATCH"],
  ];
  for (const [mutate, expected] of cases) {
    const changed = copy(good);
    mutate(changed);
    assert.throws(() => rebuild(FIXTURE, changed), code(expected));
  }
  assert.throws(() => rebuild(FIXTURE, good.events), code("INVALID_SCHEMA"));
});

test("the format checks consistency, not cryptographic provenance of an alternative history", () => {
  const first = apply(start(), "pioneer", "caw", { text: "History A." });
  const alternative = apply(start(), "pioneer", "caw", { text: "History B." });
  const a = canonicalExport(first);
  const b = canonicalExport(alternative);
  assert.notEqual(a, b);
  assert.doesNotThrow(() => rebuild(FIXTURE, JSON.parse(a)));
  assert.doesNotThrow(() => rebuild(FIXTURE, JSON.parse(b)));
});

test("mutated live state is rejected before another action or export", () => {
  const state = start();
  state.accounts.pioneer.balance = "0";
  assert.throws(() => previewAction(state, intent(state, "pioneer", "caw", { text: "Not trusted." })), code("STATE_MISMATCH"));
  assert.throws(() => canonicalExport(state), code("STATE_MISMATCH"));
});

test("formatting preserves exact base units without floating-point rounding", () => {
  assert.equal(formatAmount("0"), "0");
  assert.equal(formatAmount(250000n * UNIT), "250,000");
  assert.equal(formatAmount("1"), "0.000000000000000001");
  assert.equal(formatAmount(12345n * UNIT + 120000000000000001n), "12,345.120000000000000001");
  assert.throws(() => formatAmount(1), code("INVALID_AMOUNT"));
  assert.throws(() => formatAmount(-1n), code("INVALID_AMOUNT"));
});

test("oversized event collections are rejected before any replay workload", () => {
  const envelope = JSON.parse(canonicalExport(start()));
  envelope.events = Array.from({ length: 257 }, () => ({}));
  envelope.expectedEventCount = 257;
  assert.throws(() => rebuild(FIXTURE, envelope), code("INVALID_SCHEMA"));
});
