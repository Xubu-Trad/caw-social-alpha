"""Bounded acquisition session for the fixed, synthetic paid-action profile.

Explicit caller-supplied selection; two unchanged collectors and one unchanged
accounting reader. No transport, node, wallet, automatic retry or finality rule.
Callbacks must enforce their own I/O timeouts and duplicate-JSON-key policy.
"""
import hashlib
import json
from pathlib import Path
import re
import threading
import time
import types

HERE = Path(__file__).resolve().parent
INPUTS = {
    '../experiments/paid-acquisition/collect_by_number.py': 'b4da8340db9fd76e23faa346829b7e849e71abbd7e43c7a94d5fdf6800509651',
    '../experiments/paid-acquisition/collect_by_hash.py': '4e9e3208fc5113fff718cb3ad7ea320101c783b41e48211b2ac6e3ba69428c23',
    'paid_action_reader.py': 'a6a5869994c17baefbe6225b8726746fc0f29ace942583c8c9e7864f2224c6cd',
    'fixtures/generate-ethereum-proof-fixtures.py': '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa',
}
MAX_CALLS = 1800
MAX_BYTES = 32 * 1024 * 1024
MAX_ATTEMPTS = 4
MAX_SELECTIONS = 32
METHODS = frozenset(('eth_chainId', 'eth_getBlockByNumber', 'eth_getBlockByHash',
    'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getCode', 'eth_call'))
CONFIG = frozenset(('chain_id', 'addresses', 'start_block_hash', 'end_block_hash',
    'start_block_number', 'end_block_number', 'registry_runtime_sha256', 'probe_runtime_sha256'))


class SessionError(ValueError):
    def __init__(self, code):
        self.code = 'ACQUISITION_SESSION_' + code
        super().__init__(self.code)


def need(condition, code):
    if not condition:
        raise SessionError(code)


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':')).encode('ascii')


def capture(value, limit=8 * 1024 * 1024):
    """Copy exact plain JSON types without getters, subclass hooks or cycles."""
    active, count, budget = set(), 0, 0

    def walk(item, depth):
        nonlocal count, budget
        count += 1
        budget += 8
        need(count <= 100000 and depth <= 20 and budget <= limit, 'DATA_BOUND')
        kind = type(item)
        if item is None or kind is bool:
            return item
        if kind is int:
            need(0 <= item < 2 ** 256, 'INTEGER')
            return item
        if kind is str:
            need(len(item) <= 262144 and not any(0xd800 <= ord(c) <= 0xdfff for c in item), 'STRING')
            budget += len(item.encode('utf-8'))
            need(budget <= limit, 'DATA_BOUND')
            return item
        need(kind in (dict, list), 'PLAIN_DATA')
        need(id(item) not in active, 'CYCLE')
        active.add(id(item))
        if kind is list:
            need(len(item) <= 4096, 'ARRAY_BOUND')
            result = [walk(entry, depth + 1) for entry in item]
        else:
            need(len(item) <= 128 and all(type(key) is str and len(key) <= 128 for key in item), 'KEY_BOUND')
            result = {key: walk(entry, depth + 1) for key, entry in item.items()}
        active.remove(id(item))
        return result
    result = walk(value, 0)
    raw = encoded(result)
    need(len(raw) <= limit, 'DATA_BOUND')
    return result, raw


def selection_config(value):
    c, _ = capture(value, 16384)
    need(type(c) is dict and set(c) == CONFIG, 'CONFIG')
    need(type(c['chain_id']) is int and c['chain_id'] == 31337, 'CHAIN')
    need(type(c['addresses']) is dict and set(c['addresses']) == {'registry', 'probe', 'token'}, 'ADDRESSES')
    addresses = list(c['addresses'].values())
    need(all(type(a) is str and re.fullmatch(r'0x[0-9a-f]{40}', a) and int(a, 16) != 0 for a in addresses)
         and len(set(addresses)) == 3 and c['addresses']['token'] == '0xf3b9569f82b18aef890de263b84189bd33ebe452', 'ADDRESSES')
    lo, hi = c['start_block_number'], c['end_block_number']
    need(type(lo) is int and type(hi) is int and 0 <= lo < hi < 2 ** 256 and hi - lo + 1 <= 128, 'INTERVAL')
    for key in ('start_block_hash', 'end_block_hash'):
        need(type(c[key]) is str and re.fullmatch(r'0x[0-9a-f]{64}', c[key]), 'ANCHOR')
    need(c['start_block_hash'] != c['end_block_hash'], 'ANCHOR')
    for key in ('registry_runtime_sha256', 'probe_runtime_sha256'):
        need(type(c[key]) is str and re.fullmatch(r'[0-9a-f]{64}', c[key]), 'RUNTIME_PIN')
    return c


def load_sources():
    sources = {}
    for path, expected in INPUTS.items():
        raw = (HERE / path).read_bytes()
        need(hashlib.sha256(raw).hexdigest() == expected, 'SOURCE_PIN')
        sources[path] = raw
    modules = []
    for path in list(INPUTS)[:3]:
        module = types.ModuleType('paid_session_' + str(len(modules)))
        module.__file__ = str((HERE / path).resolve())
        exec(compile(sources[path], module.__file__, 'exec'), module.__dict__)
        modules.append(module)
    return modules


class AcquisitionSession:
    """One finite session, at most four attempts across 32 explicit selections.

    select() invalidates prior state before validation or I/O. acquire() consumes
    its opaque token exactly once. Failure is unresolved; retry needs a fresh
    explicit selection and fresh transports. Quotas do not reset on selection.
    Metadata transitions are locked; no lock is held while transport callbacks
    run. A callback already executing cannot be cancelled by this wrapper.
    """
    def __init__(self):
        self._number, self._hash, self._reader = load_sources()
        self._lock = threading.Lock()
        self._generation = self._attempts = self._calls = self._bytes = 0
        self._token = self._config = self._current = self._error = None
        self._busy = False

    def select(self, config):
        with self._lock:
            self._current = self._token = self._config = self._error = None
            self._generation += 1
            generation = self._generation
            need(generation <= MAX_SELECTIONS, 'SELECTION_LIMIT')
        selected = selection_config(config)
        with self._lock:
            need(generation == self._generation, 'SUPERSEDED')
            self._config = selected
            self._token = object()
            return self._token

    def state(self):
        with self._lock:
            return capture({'schema': 'caw-paid-acquisition-session/1', 'generation': self._generation,
                'status': 'ready' if self._current is not None else 'unresolved', 'busy': self._busy,
                'selected': self._config, 'current': self._current, 'error': self._error,
                'attempts': self._attempts, 'calls': self._calls, 'response_bytes': self._bytes})[0]

    def acquire(self, token, number_rpc, hash_rpc):
        with self._lock:
            need(token is self._token and self._token is not None, 'STALE_TOKEN')
            need(not self._busy, 'BUSY')
            need(self._attempts < MAX_ATTEMPTS, 'ATTEMPT_LIMIT')
            need(callable(number_rpc) and callable(hash_rpc), 'TRANSPORT')
            self._attempts += 1
            self._busy = True
            generation = self._generation
            config = capture(self._config)[0]
            first_call, first_bytes = self._calls, self._bytes
        started = time.monotonic()
        stage = 'number'
        acquired = {}
        expired = False

        def active():
            need(not expired and token is self._token and generation == self._generation, 'SUPERSEDED')
            need(time.monotonic() - started <= 60, 'DEADLINE')

        def lease(transport):
            def rpc(method, params):
                need(type(method) is str and method in METHODS, 'READ_ONLY')
                parameters, _ = capture(params, 65536)
                need(type(parameters) is list, 'PARAMETERS')
                with self._lock:
                    active()
                    need(self._calls < MAX_CALLS, 'CALL_LIMIT')
                    self._calls += 1
                value = transport(method, parameters)
                # A returned response may itself be accompanied by a selection
                # change. Check before parsing and again before accepting it.
                with self._lock:
                    active()
                copied, raw = capture(value, 1024 * 1024)
                with self._lock:
                    active()
                    need(self._bytes + len(raw) <= MAX_BYTES, 'BYTE_LIMIT')
                    self._bytes += len(raw)
                return copied
            return rpc

        try:
            reads = {'number': lease(number_rpc), 'hash': lease(hash_rpc)}
            for stage, collector in (('number', self._number), ('hash', self._hash)):
                acquired[stage] = capture(collector.collect(reads[stage], capture(config)[0]))[0]
            stage = 'agreement'
            expected_manifest = {key: value for key, value in config.items() if key not in ('start_block_number', 'end_block_number')}
            number, hashed = acquired['number'], acquired['hash']
            need(number['manifest'] == hashed['manifest'] == expected_manifest, 'MANIFEST_DISAGREEMENT')
            need(number['history'] == hashed['history'], 'HISTORY_DISAGREEMENT')
            history = number['history']
            need(history['end_block'] == history['blocks'][-1]['header'], 'ENDPOINT_FIELDS')
            stage = 'reconstruction'
            rebuilt = self._reader.reconstruct(history, expected_manifest)
            need(rebuilt == self._reader.reconstruct(hashed['history'], expected_manifest), 'RECONSTRUCTION_DISAGREEMENT')
            stage = 'final_boundaries'
            for name in ('number', 'hash'):
                need(reads[name]('eth_chainId', []) == '0x7a69', 'FINAL_CHAIN')
                for header in (history['start_block'], history['end_block']):
                    need(reads[name]('eth_getBlockByNumber', [header['number'], False]) == header, 'FINAL_BOUNDARY')
            # Complete every validation/copy before a single authoritative
            # pointer replacement. The old token/lease never survives commit.
            replacement = capture({'manifest': expected_manifest, 'history': history,
                'result': rebuilt, 'independent_providers': False, 'authenticates_consensus': False})[0]
            with self._lock:
                active()
                replacement['request_count'] = self._calls - first_call
                replacement['response_bytes'] = self._bytes - first_bytes
                returned = capture(replacement)[0]
                self._current = replacement
                self._token = None
                self._error = None
            return returned
        except Exception as error:
            code = error.code if type(error) is SessionError else 'ACQUISITION_SESSION_REJECTED'
            with self._lock:
                if generation == self._generation and token is self._token:
                    self._current = self._token = None
                    self._error = {'stage': stage, 'code': code}
            raise SessionError(code.removeprefix('ACQUISITION_SESSION_')) from None
        finally:
            expired = True
            with self._lock:
                # KeyboardInterrupt/SystemExit also consume the active token.
                # Preserve their control flow, but never leave a reusable lease.
                if generation == self._generation and token is self._token:
                    self._current = self._token = None
                    self._error = {'stage': stage, 'code': 'ACQUISITION_SESSION_INTERRUPTED'}
                self._busy = False
