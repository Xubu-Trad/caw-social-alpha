// Offline comparison of explicitly labeled provider reports for a fixed target.
// Labels do not establish independent operation. Matching supplied histories do
// not authenticate an endpoint, prove finality or permit a retry.
import { Buffer } from 'node:buffer';
import { isDeepStrictEqual as equal } from 'node:util';
import { createPaidActionObserver, createHeaderCheckedPaidActionObserver } from './paid-action-observer.mjs';

// Bounded plain-data capture is adapted from the existing observer/recovery
// reader. Reusing those checks does not create another independent verifier.
const LIMIT = Object.freeze({ bytes: 8 * 1024 * 1024, nodes: 100000, depth: 20,
  array: 2048, selections: 1024 });
function fail(code) { const e = new Error('Provider comparison rejected: ' + code + '.'); e.code = 'PAID_PROVIDERS_' + code; throw e; }
function need(condition, code) { if (!condition) fail(code); }
function fields(value, required, optional = []) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value), 'SCHEMA');
  const keys = Object.keys(value), allowed = new Set([...required, ...optional]);
  need(keys.every(key => allowed.has(key)) && required.every(key => Object.hasOwn(value, key)), 'SCHEMA');
}

// Capture own data descriptors without invoking getters, toJSON or iterators.
// Hostile Proxy traps and replacement native built-ins are outside this same-
// process plain-data boundary. Cycles, exotic prototypes and sparse arrays fail.
function capture(input, budget = { bytes: 0, nodes: 0 }) {
  const active = new WeakSet();
  function copy(value, depth) {
    budget.bytes += 8;
    need(++budget.nodes <= LIMIT.nodes && depth <= LIMIT.depth && budget.bytes <= LIMIT.bytes, 'LIMIT');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0), 'INTEGER'); return value; }
    if (typeof value === 'string') {
      need(value.length <= 262144 && value.isWellFormed(), 'STRING');
      budget.bytes += Buffer.byteLength(value, 'utf8'); need(budget.bytes <= LIMIT.bytes, 'LIMIT'); return value;
    }
    need(value !== null && typeof value === 'object', 'SCHEMA');
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    need(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'PROTOTYPE');
    need(!active.has(value), 'CYCLE'); active.add(value);
    const keys = Reflect.ownKeys(value);
    let result;
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      need(length && Object.hasOwn(length, 'value') && Number.isSafeInteger(length.value) && length.value >= 0 && length.value <= LIMIT.array, 'LIMIT');
      need(keys.length === length.value + 1, 'SCHEMA'); result = [];
      for (let index = 0; index < length.value; index++) {
        const entry = Object.getOwnPropertyDescriptor(value, String(index));
        need(entry && entry.enumerable && Object.hasOwn(entry, 'value'), 'DESCRIPTOR');
        result.push(copy(entry.value, depth + 1));
      }
    } else {
      need(keys.length <= 64 && keys.every(key => typeof key === 'string' && key.length <= 96), 'SCHEMA');
      result = Object.create(null);
      for (const key of keys) {
        budget.bytes += Buffer.byteLength(key, 'utf8'); need(budget.bytes <= LIMIT.bytes, 'LIMIT');
        const entry = Object.getOwnPropertyDescriptor(value, key);
        need(entry && entry.enumerable && Object.hasOwn(entry, 'value'), 'DESCRIPTOR');
        result[key] = copy(entry.value, depth + 1);
      }
    }
    active.delete(value); return result;
  }
  return copy(input, 0);
}
function freeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

/** Fixed roster, all reports required. The host acquires reports; this module
 * performs no network I/O and trusts neither provider labels nor saved views.
 * After restart create a fresh instance, select and submit complete histories. */
export function createPaidProviderComparison(targetInput, providerIdsInput) {
  need(arguments.length === 2, 'SCHEMA');
  return make(targetInput, providerIdsInput, false);
}

/** Explicit checked mode: every admitted report must pass header integrity and
 * accounting before comparison. A missing/null profile never selects legacy
 * behavior. Matching reports still do not prove bodies or provider independence. */
export function createHeaderCheckedPaidProviderComparison(targetInput, providerIdsInput, profileString) {
  need(arguments.length === 3, 'SCHEMA');
  return make(targetInput, providerIdsInput, true, profileString);
}

function make(targetInput, providerIdsInput, checked, profileString) {
  // The mode is private and explicit. Each check uses a fresh observer with
  // the same captured target and immutable profile, never a provider's status.
  const newObserver = input => checked
    ? createHeaderCheckedPaidActionObserver(input, profileString) : createPaidActionObserver(input);
  const initial = newObserver(targetInput).state(), watched = initial.target;
  const profile = checked ? initial.profile : undefined;
  const ids = capture(providerIdsInput);
  need(Array.isArray(ids) && ids.length >= 2 && ids.length <= 4
    && ids.every(id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(id))
    && new Set(ids).size === ids.length, 'ROSTER');
  freeze(ids);
  let generation = 0, selected = null, active = null, reports = new Map(), slots;
  const empty = () => new Map(ids.map(id => [id, freeze({ id, status: 'pending', manifest: null, observation: null })]));
  slots = empty();
  function snapshot(nextSlots, nextReports) {
    const providers = [...nextSlots.values()];
    let status = 'unresolved', shared = null;
    if (selected) {
      if (providers.some(p => p.status === 'invalid' || p.status === 'unavailable')) status = 'provider-failed';
      else if (providers.some(p => p.status === 'pending')) status = 'incomplete';
      else {
        const first = nextReports.get(ids[0]);
        if (ids.some(id => !equal(first.manifest, nextReports.get(id).manifest))) status = 'endpoint-disagreement';
        else if (ids.some(id => !equal(first.history, nextReports.get(id).history))) status = 'history-conflict';
        else if (!equal(first.manifest, selected)) status = 'selected-endpoint-mismatch';
        else { status = 'matching-supplied-histories'; shared = providers[0].observation; }
      }
    }
    const state = { schema: checked ? 'caw-paid-header-provider-comparison/1' : 'caw-paid-provider-comparison/1', generation, target: watched,
      selected, status, providers, shared_observation: shared,
      finality: 'not-established', retry_safety: 'not-assessed', provider_independence: 'not-established' };
    return freeze(checked ? { ...state, profile } : state);
  }
  let current = snapshot(slots, reports);
  function select(input) {
    // A refresh must invalidate the displayed agreement before inspecting input.
    // Old immutable snapshots remain historical; they are not live handles.
    selected = null; active = null; reports = new Map(); slots = empty();
    current = snapshot(slots, reports);
    need(arguments.length === 1 && generation < LIMIT.selections, 'SELECTION_LIMIT');
    ++generation; current = snapshot(slots, reports);
    const m = capture(input);
    // Validate shape and target context without trusting any provider report.
    newObserver(watched).select(m);
    selected = freeze(m);
    active = freeze({ schema: 'caw-paid-provider-round/1', generation });
    current = snapshot(slots, reports); return active;
  }
  function admission(token, id) {
    need(active !== null && token === active, 'STALE_ROUND');
    need(typeof id === 'string' && slots.has(id), 'PROVIDER');
    need(slots.get(id).status === 'pending', 'CONSUMED');
  }
  function submit(token, id, input) {
    need(arguments.length === 3, 'SCHEMA'); admission(token, id);
    let report, observation, nextReports, nextSlots, nextState;
    try {
      report = capture(input); fields(report, ['manifest', 'history']);
      nextReports = new Map(reports); nextReports.set(id, report);
      // Bound the complete resident raw report set, not each reply alone.
      capture({ reports: [...nextReports.values()] });
      // Each provider gets an isolated reader. A shared retention cache could
      // reject conflicting equal-hash reports before they can be compared.
      const observer = newObserver(watched), selection = observer.select(report.manifest);
      observer.commit(observer.prepare(selection, report.history));
      observation = observer.state(); freeze(report);
      nextSlots = new Map(slots); nextSlots.set(id, freeze({ id, status: 'valid', manifest: report.manifest, observation }));
      nextState = snapshot(nextSlots, nextReports);
    } catch {
      // An admitted failed response consumes this provider's slot. Retrying
      // requires a new explicit round with fresh reports from the whole roster.
      // Do not include caller-controlled exception text in diagnostics.
      const failed = new Map(slots); failed.set(id, freeze({ id, status: 'invalid', manifest: null, observation: null }));
      const failedState = snapshot(failed, reports);
      slots = failed; current = failedState; fail('REPORT');
    }
    reports = nextReports; slots = nextSlots; current = nextState;
    return current;
  }
  function unavailable(token, id) {
    need(arguments.length === 2, 'SCHEMA'); admission(token, id);
    const next = new Map(slots); next.set(id, freeze({ id, status: 'unavailable', manifest: null, observation: null }));
    const nextState = snapshot(next, reports); slots = next; current = nextState; return current;
  }
  function state() { need(arguments.length === 0, 'SCHEMA'); return current; }
  return Object.freeze({ select, submit, unavailable, state });
}
