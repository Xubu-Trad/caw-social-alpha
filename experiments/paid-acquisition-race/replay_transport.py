"""Deterministic RPC replay of one pinned, previously published local capture.

This is replay evidence, not another live node, independently operated provider,
consensus proof or observation of orphan retention. Only collector-labelled
request/result pairs are eligible. A missing orphan query fails; it never
receives an invented null result or a response borrowed from writer rows.

The after_response(transport, observation_copy) hook is trusted test-controller
code. It runs after the current response has been selected and recorded, before
that detached result is returned. It may call set_branch(), but not recursively
make an RPC call. This class is not a sandbox against hostile in-process code.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
from types import MappingProxyType


TRACE_SHA256 = "b12d2eeebd281e3f4b041ba5467b2de768494866ad73024966e802bea12dcd2f"
TRACE_PATH = Path(__file__).resolve().parent.parent / "paid-reorg" / "execution-trace.json"
MAX_TRACE_BYTES = 4 * 1024 * 1024
MAX_CALLS = 512
MAX_RESULT_BYTES = 1024 * 1024
MAX_RETURNED_BYTES = 8 * 1024 * 1024
MAX_OBSERVED_BYTES = 256 * 1024
MAX_SWITCHES = 16
LABEL = re.compile(r"collector\.(left|right)\.(number|hash)\.(0|[1-9][0-9]*)\Z")
METHODS = frozenset(("eth_chainId", "eth_getBlockByNumber", "eth_getBlockByHash",
                     "eth_getTransactionByHash", "eth_getTransactionReceipt",
                     "eth_getLogs", "eth_getCode", "eth_call"))
_TABLES = None


class ReplayError(RuntimeError):
    def __init__(self, code):
        self.code = "REPLAY_" + code
        super().__init__("Replay rejected: " + code + ".")


def _need(condition, code):
    if not condition:
        raise ReplayError(code)


def _pairs(items):
    result = {}
    for key, value in items:
        _need(key not in result, "DUPLICATE_JSON_KEY")
        result[key] = value
    return result


def _constant(_value):
    raise ReplayError("JSON_CONSTANT")


def _json(raw):
    try:
        return json.loads(raw, object_pairs_hook=_pairs, parse_constant=_constant)
    except (ValueError, UnicodeError, RecursionError) as error:
        raise ReplayError("JSON") from error


def _canonical(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("ascii")


def _capture(value, byte_limit=MAX_RESULT_BYTES, node_limit=20000,
             depth_limit=16, string_limit=131072, array_limit=4096):
    """Copy exact built-in JSON types within bounds; no custom iteration hooks."""
    nodes, used = 0, 0
    active = set()

    def visit(item, depth):
        nonlocal nodes, used
        nodes += 1
        used += 8
        _need(nodes <= node_limit and depth <= depth_limit and used <= byte_limit, "DATA_LIMIT")
        kind = type(item)
        _need(kind in (dict, list, str, int, bool, type(None)), "JSON_TYPE")
        if kind is str:
            _need(len(item) <= string_limit and not any(0xD800 <= ord(char) <= 0xDFFF for char in item), "STRING")
            used += len(_canonical(item))
            _need(used <= byte_limit, "DATA_LIMIT")
            return item
        if kind is int:
            _need(0 <= item <= (1 << 256) - 1, "INTEGER")
            used += len(str(item))
            _need(used <= byte_limit, "DATA_LIMIT")
            return item
        if kind in (bool, type(None)):
            return item
        _need(id(item) not in active, "CYCLE")
        active.add(id(item))
        if kind is list:
            _need(len(item) <= array_limit, "DATA_LIMIT")
            result = [visit(entry, depth + 1) for entry in item]
        else:
            _need(len(item) <= 64, "DATA_LIMIT")
            result = {}
            for key, entry in item.items():
                _need(type(key) is str and len(key) <= 128
                      and not any(0xD800 <= ord(char) <= 0xDFFF for char in key), "JSON_KEY")
                used += len(_canonical(key))
                _need(used <= byte_limit, "DATA_LIMIT")
                result[key] = visit(entry, depth + 1)
        active.remove(id(item))
        return result

    result = visit(value, 0)
    raw = _canonical(result)
    _need(len(raw) <= byte_limit, "DATA_LIMIT")
    return result, raw


def _request(method, params):
    _need(type(method) is str and 1 <= len(method) <= 64, "METHOD")
    _need(type(params) is list, "PARAMS")
    copied, _ = _capture(params, byte_limit=16384, node_limit=512,
                         depth_limit=8, string_limit=8192, array_limit=128)
    return copied, _canonical([method, copied])


def _load_tables():
    global _TABLES
    # Re-read and verify the exact bytes for each new transport. Immutable
    # canonical result bytes may be reused after this check; file changes fail.
    try:
        with TRACE_PATH.open("rb") as stream:
            raw = stream.read(MAX_TRACE_BYTES + 1)
    except OSError as error:
        raise ReplayError("TRACE_UNAVAILABLE") from error
    _need(0 < len(raw) <= MAX_TRACE_BYTES, "TRACE_SIZE")
    _need(hashlib.sha256(raw).hexdigest() == TRACE_SHA256, "TRACE_PIN")
    if _TABLES is not None:
        return _TABLES
    trace = _json(raw)
    _need(type(trace) is dict and trace.get("schema") == "caw-paid-reorg-run/1"
          and trace.get("status") == "pass", "TRACE_SCHEMA")
    rows = trace.get("rpc")
    _need(type(rows) is list and 0 < len(rows) <= 1800, "TRACE_ROWS")
    tables = {(branch, strategy): {} for branch in ("left", "right")
              for strategy in ("number", "hash")}
    counts = {key: 0 for key in tables}
    result_bytes = 0
    source_ids = set()
    for row in rows:
        _need(type(row) is dict and type(row.get("label")) is str, "TRACE_ROW")
        match = LABEL.fullmatch(row["label"])
        if match is None:
            continue
        branch, strategy, sequence = match.groups()
        group = (branch, strategy)
        _need(int(sequence) == counts[group], "COLLECTOR_SEQUENCE")
        counts[group] += 1
        _need(set(row) == {"label", "request", "response", "raw_response"}, "COLLECTOR_ROW")
        request, response = row["request"], row["response"]
        _need(type(request) is dict and set(request) == {"jsonrpc", "id", "method", "params"}, "REQUEST_SCHEMA")
        _need(request["jsonrpc"] == "2.0" and type(request["id"]) is int and 0 < request["id"] <= 1800
              and type(request["method"]) is str and request["method"] in METHODS, "REQUEST_SCHEMA")
        _need(request["id"] not in source_ids, "DUPLICATE_SOURCE_ID")
        source_ids.add(request["id"])
        _need(type(response) is dict and set(response) == {"jsonrpc", "id", "result"}
              and response["jsonrpc"] == "2.0" and type(response["id"]) is int
              and response["id"] == request["id"], "RESPONSE_SCHEMA")
        raw_response = row["raw_response"]
        _need(type(raw_response) is str and len(raw_response) <= MAX_RESULT_BYTES
              and _json(raw_response) == response, "RAW_RESPONSE_BINDING")
        _, key = _request(request["method"], request["params"])
        _, result = _capture(response["result"])
        prior = tables[group].get(key)
        if prior is not None:
            _need(prior[0] == result, "CONFLICTING_RECORDED_RESPONSE")
            prior[1].append(request["id"])
        else:
            result_bytes += len(key) + len(result)
            _need(result_bytes <= MAX_TRACE_BYTES, "TABLE_SIZE")
            tables[group][key] = (result, [request["id"]])
    for (branch, strategy), count in counts.items():
        _need(count == (57 if strategy == "number" else 84), "COLLECTOR_COVERAGE")
    _TABLES = MappingProxyType({group: MappingProxyType({key: (value[0], tuple(value[1]))
                               for key, value in entries.items()}) for group, entries in tables.items()})
    return _TABLES


class ReplayTransport:
    """Bounded callable compatible with the unchanged collector RPC interface.

    switch_before_call is a 1-based call number that changes replay selection
    to right immediately before that request. Missing recorded pairs are counted
    as attempts with response_sha256=None and a short error code. Invalid input
    and budget rejection are not recorded as completed replay attempts.

    response_sha256 hashes sorted compact ASCII JSON of the selected RPC result,
    not the historical JSON-RPC response envelope (whose request id may differ).
    source_request_ids lists all matching original collector observations;
    repeated replay queries may deliberately refer to the same retained IDs.
    All public collections and returned RPC results are detached snapshots.
    """
    def __init__(self, strategy, initial_branch="left", switch_before_call=None, after_response=None):
        _need(type(strategy) is str and strategy in ("number", "hash"), "STRATEGY")
        _need(type(initial_branch) is str and initial_branch in ("left", "right"), "BRANCH")
        _need(switch_before_call is None or (type(switch_before_call) is int
              and 1 <= switch_before_call <= MAX_CALLS), "SWITCH_CALL")
        _need(after_response is None or callable(after_response), "HOOK")
        self._tables = _load_tables()
        self._strategy, self._initial_branch, self._branch = strategy, initial_branch, initial_branch
        self._switch_at, self._hook = switch_before_call, after_response
        self._count, self._returned_bytes, self._observed_bytes = 0, 0, 0
        self._observations, self._boundaries, self._switches = [], [], []
        self._in_call, self._response_selected = False, False

    @property
    def strategy(self):
        return self._strategy

    @property
    def branch(self):
        return self._branch

    @property
    def count(self):
        return self._count

    @property
    def observations(self):
        return copy.deepcopy(self._observations)

    @property
    def boundaries(self):
        return copy.deepcopy(self._boundaries)

    @property
    def switches(self):
        return copy.deepcopy(self._switches)

    def _record_size(self, values):
        return sum(len(_canonical(value)) for value in values)

    def _set_branch(self, branch, source):
        _need(type(branch) is str and branch in ("left", "right"), "BRANCH")
        if branch == self._branch:
            return
        _need(len(self._switches) < MAX_SWITCHES, "SWITCH_LIMIT")
        event = {"from": self._branch, "to": branch, "source": source,
                 "after_call": self._count, "before_call": self._count + 1,
                 "phase": "after_response" if self._response_selected else "before_request"}
        size = self._record_size([event])
        _need(self._observed_bytes + size <= MAX_OBSERVED_BYTES, "OBSERVATION_LIMIT")
        self._switches.append(event)
        self._observed_bytes += size
        self._branch = branch

    def set_branch(self, branch):
        """Explicit controller selection; also allowed in after_response."""
        self._set_branch(branch, "external")

    def __call__(self, method, params):
        _need(not self._in_call, "REENTRANT_CALL")
        copied_params, key = _request(method, params)
        _need(self._count < MAX_CALLS, "CALL_LIMIT")
        self._in_call = True
        try:
            if self._switch_at == self._count + 1:
                self._set_branch("right", "scheduled")
            branch = self._branch
            recorded = self._tables[(branch, self._strategy)].get(key)
            result_bytes = recorded[0] if recorded is not None else None
            observation = {"call": self._count + 1, "method": method, "params": copied_params,
                           "selected_branch": branch,
                           "source_request_ids": list(recorded[1]) if recorded is not None else [],
                           "response_sha256": hashlib.sha256(result_bytes).hexdigest() if result_bytes is not None else None}
            boundary = None
            if result_bytes is None:
                observation["error"] = "REPLAY_MISSING_RESPONSE"
                result = None
            else:
                _need(self._returned_bytes + len(result_bytes) <= MAX_RETURNED_BYTES, "RETURNED_LIMIT")
                result = _json(result_bytes)
                if method == "eth_getBlockByNumber" and len(copied_params) == 2 and copied_params[1] is False:
                    boundary = {"call": self._count + 1, "requested_number": copied_params[0],
                                "selected_branch": branch, "observed_number": result["number"],
                                "observed_hash": result["hash"]}
            size = self._record_size([observation] + ([boundary] if boundary is not None else []))
            _need(self._observed_bytes + size <= MAX_OBSERVED_BYTES, "OBSERVATION_LIMIT")
            self._count += 1
            self._observations.append(observation)
            if boundary is not None:
                self._boundaries.append(boundary)
            self._observed_bytes += size
            if result_bytes is None:
                raise ReplayError("MISSING_RESPONSE")
            self._returned_bytes += len(result_bytes)
            self._response_selected = True
            if self._hook is not None:
                self._hook(self, copy.deepcopy(observation))
            return result
        finally:
            self._response_selected = False
            self._in_call = False

    def report(self):
        """Compact provenance, no raw results or claims of new live acquisition."""
        return {"schema": "caw-paid-acquisition-replay/1", "source_trace_sha256": TRACE_SHA256,
                "strategy": self._strategy, "initial_branch": self._initial_branch,
                "selected_branch": self._branch, "count": self._count,
                "observations": self.observations, "boundaries": self.boundaries,
                "switches": self.switches, "returned_bytes": self._returned_bytes,
                "observed_bytes": self._observed_bytes, "replay_only": True,
                "network_requests": 0, "new_live_node": False,
                "independent_provider": False, "authenticates_consensus": False}
