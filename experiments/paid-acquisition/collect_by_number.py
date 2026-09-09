"""Forward, block-number acquisition for the fixed paid-action experiment.

collect(rpc, config) performs read-only RPC through a caller-supplied transport.
It imports no writer, retained capture, other collector or reader implementation.
The only shared algorithm is the hash-pinned standalone Keccak primitive.

The start block is the reader's EXCLUSIVE checkpoint. This collector also reads
that block's full transactions/receipts for its independent inclusive log check,
but emits only (start, end] in history.blocks. The provider and supplied endpoint
hashes/runtime pins remain trust inputs. A consistent numeric endpoint before
and after acquisition does not prove consensus, finality, a cryptographic header
hash, receipt inclusion, independent-provider agreement or reorg recovery.
"""

import copy
import hashlib
import json
from pathlib import Path
import re


MAX_UINT = (1 << 256) - 1
ZERO = "0x" + "00" * 20
TOKEN = "0xf3b9569f82b18aef890de263b84189bd33ebe452"
OBSERVER = "0x00000000000000000000000000000000ca180001"
MAX_BLOCKS = 128
MAX_TRANSACTIONS = 128
MAX_LOGS = 1024
MAX_RPC_CALLS = 512
MAX_RESULT_BYTES = 8 * 1024 * 1024
CONFIG_FIELDS = {
    "chain_id", "addresses", "start_block_hash", "end_block_hash",
    "start_block_number", "end_block_number", "registry_runtime_sha256",
    "probe_runtime_sha256",
}
HEADER_FIELDS = {"hash", "parentHash", "number", "timestamp", "transactions", "gasUsed", "gasLimit"}
HEADER_OPTIONAL = {
    "sha3Uncles", "miner", "stateRoot", "transactionsRoot", "receiptsRoot", "logsBloom",
    "difficulty", "totalDifficulty", "extraData", "mixHash", "nonce", "baseFeePerGas",
    "withdrawalsRoot", "blobGasUsed", "excessBlobGas", "parentBeaconBlockRoot",
    "requestsHash", "size", "uncles", "withdrawals",
}
RECEIPT_FIELDS = {
    "status", "cumulativeGasUsed", "logs", "transactionHash", "transactionIndex",
    "blockHash", "blockNumber", "gasUsed", "from", "to", "contractAddress",
}
RECEIPT_OPTIONAL = {"type", "effectiveGasPrice", "logsBloom", "blobGasUsed", "blobGasPrice", "blockTimestamp"}
LOG_FIELDS = {
    "address", "topics", "data", "blockHash", "blockNumber", "transactionHash",
    "transactionIndex", "logIndex", "removed",
}


class AcquisitionError(ValueError):
    """Missing, conflicting, unsupported or over-bound acquisition evidence."""


def _need(condition, reason):
    if not condition:
        raise AcquisitionError(reason)


def _object(value, required, optional=()):
    _need(type(value) is dict, "object required")
    _need(set(required) <= set(value) <= set(required) | set(optional), "object fields")


def _quantity(value):
    _need(type(value) is str and re.fullmatch(r"0x(?:0|[1-9a-f][0-9a-f]*)", value)
          and len(value) <= 66, "canonical quantity")
    return int(value, 16)


def _hex(value, width=None, maximum=24576):
    _need(type(value) is str and len(value) <= 2 + 2 * maximum
          and re.fullmatch(r"0x(?:[0-9a-f]{2})*", value), "bounded lowercase hex")
    _need(width is None or len(value) == 2 + 2 * width, "hex width")
    return bytes.fromhex(value[2:])


def _address(value, allow_zero=False):
    _hex(value, 20)
    _need(allow_zero or value != ZERO, "zero address")
    return value


def _bounded_json(value):
    # The transport must reject duplicate JSON properties before decoding.
    # Here, bound the already decoded tree before retaining or copying it.
    pending = [(value, 0)]
    count = 0
    while pending:
        item, depth = pending.pop()
        count += 1
        _need(depth <= 16 and count <= 50000, "RPC structure bound")
        kind = type(item)
        _need(kind in (dict, list, str, int, bool, type(None)), "RPC JSON type")
        if kind is dict:
            _need(all(type(k) is str and len(k) <= 128 for k in item), "RPC key bound")
            pending.extend((v, depth + 1) for v in item.values())
        elif kind is list:
            _need(len(item) <= 4096, "RPC array bound")
            pending.extend((v, depth + 1) for v in item)
        elif kind is str:
            _need(len(item) <= 131072 and not any(0xd800 <= ord(c) <= 0xdfff for c in item), "RPC string bound")
        elif kind is int:
            _need(0 <= item <= MAX_UINT, "RPC integer bound")
    raw = json.dumps(value, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    _need(len(raw) <= 1024 * 1024, "RPC response byte bound")
    return len(raw)


def _primitive():
    path = Path(__file__).resolve().parents[2] / "reference" / "fixtures" / "generate-ethereum-proof-fixtures.py"
    raw = path.read_bytes()
    _need(hashlib.sha256(raw).hexdigest() ==
          "5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa", "Keccak source pin")
    scope = {"__name__": "number_collector_keccak_only", "__file__": str(path)}
    exec(compile(raw, str(path), "exec"), scope)
    return scope["digest"]


def _header(raw, expected_number, full):
    _object(raw, HEADER_FIELDS, HEADER_OPTIONAL)
    _hex(raw["hash"], 32)
    _hex(raw["parentHash"], 32)
    _need(_quantity(raw["number"]) == expected_number, "wrong block number")
    _quantity(raw["timestamp"])
    _need(_quantity(raw["gasUsed"]) <= _quantity(raw["gasLimit"]), "header gas")
    transactions = raw["transactions"]
    _need(type(transactions) is list and len(transactions) <= MAX_TRANSACTIONS, "block transaction bound")
    hashes = []
    for transaction in transactions:
        if full:
            _need(type(transaction) is dict and "hash" in transaction, "full transaction required")
            tx_hash = transaction["hash"]
        else:
            tx_hash = transaction
        _hex(tx_hash, 32)
        _need(tx_hash not in hashes, "duplicate header transaction")
        hashes.append(tx_hash)
    for key in ("sha3Uncles", "stateRoot", "transactionsRoot", "receiptsRoot", "mixHash",
                "withdrawalsRoot", "parentBeaconBlockRoot", "requestsHash"):
        if raw.get(key) is not None:
            _hex(raw[key], 32)
    for key in ("difficulty", "totalDifficulty", "baseFeePerGas", "blobGasUsed", "excessBlobGas", "size"):
        if raw.get(key) is not None:
            _quantity(raw[key])
    if "miner" in raw:
        _address(raw["miner"], allow_zero=True)
    if "logsBloom" in raw:
        _hex(raw["logsBloom"], 256)
    if "extraData" in raw:
        _hex(raw["extraData"], maximum=32768)
    if "nonce" in raw:
        _hex(raw["nonce"], 8)
    if "uncles" in raw:
        _need(type(raw["uncles"]) is list and len(raw["uncles"]) <= 2, "uncle bound")
        for uncle in raw["uncles"]:
            _hex(uncle, 32)
    if "withdrawals" in raw:
        _need(type(raw["withdrawals"]) is list and len(raw["withdrawals"]) <= 16, "withdrawal bound")
    normalized = dict(raw)
    normalized["transactions"] = hashes
    return normalized


def _transaction(raw, header, index):
    required = {"hash", "blockHash", "blockNumber", "transactionIndex", "from", "to", "input", "gas", "gasPrice", "value"}
    _need(type(raw) is dict and required <= set(raw), "transaction fields")
    _need(raw["hash"] == header["transactions"][index] and raw["blockHash"] == header["hash"]
          and raw["blockNumber"] == header["number"] and _quantity(raw["transactionIndex"]) == index,
          "transaction block identity")
    _address(raw["from"])
    if raw["to"] is not None:
        _address(raw["to"])
    _hex(raw["input"], maximum=24576)
    _need("data" not in raw or raw["data"] == raw["input"], "conflicting transaction data")
    _need(0 < _quantity(raw["gas"]) <= 4000000 and _quantity(raw["value"]) == 0, "transaction profile")
    _quantity(raw["gasPrice"])
    return {"from": raw["from"], "to": raw["to"], "data": raw["input"],
            "gas": raw["gas"], "gasPrice": raw["gasPrice"], "value": raw["value"]}


def _log(raw, header, tx_hash, tx_index, log_index):
    _object(raw, LOG_FIELDS, {"blockTimestamp"})
    _address(raw["address"])
    _need(raw["blockHash"] == header["hash"] and raw["blockNumber"] == header["number"]
          and raw["transactionHash"] == tx_hash and _quantity(raw["transactionIndex"]) == tx_index
          and _quantity(raw["logIndex"]) == log_index and raw["removed"] is False, "log identity/order")
    _need(type(raw["topics"]) is list and 1 <= len(raw["topics"]) <= 4, "log topics")
    for topic in raw["topics"]:
        _hex(topic, 32)
    _hex(raw["data"], maximum=4096)
    if "blockTimestamp" in raw:
        _need(_quantity(raw["blockTimestamp"]) == _quantity(header["timestamp"]), "log timestamp")
    # Timestamp extension presence can differ across getLogs/receipt APIs.
    return {key: raw[key] for key in sorted(LOG_FIELDS)}


def _receipt(raw, tx, header, tx_hash, index, cumulative, first_log):
    _object(raw, RECEIPT_FIELDS, RECEIPT_OPTIONAL)
    _need(raw["transactionHash"] == tx_hash and raw["blockHash"] == header["hash"]
          and raw["blockNumber"] == header["number"] and _quantity(raw["transactionIndex"]) == index,
          "receipt identity")
    _need(raw["from"] == tx["from"] and raw["to"] == tx["to"], "receipt parties")
    _need(raw["status"] in ("0x0", "0x1"), "receipt status")
    used = _quantity(raw["gasUsed"])
    _need(0 < used <= _quantity(tx["gas"]), "receipt gas")
    cumulative += used
    _need(_quantity(raw["cumulativeGasUsed"]) == cumulative, "cumulative receipt gas")
    if "effectiveGasPrice" in raw:
        _need(_quantity(raw["effectiveGasPrice"]) == _quantity(tx["gasPrice"]), "receipt gas price")
    for key in ("type", "blobGasPrice", "blobGasUsed"):
        if raw.get(key) is not None:
            _quantity(raw[key])
    if "blockTimestamp" in raw:
        timestamp = raw["blockTimestamp"]
        _need(type(timestamp) is int or type(timestamp) is str, "receipt timestamp type")
        _need((timestamp if type(timestamp) is int else _quantity(timestamp)) ==
              _quantity(header["timestamp"]), "receipt timestamp")
    if "logsBloom" in raw:
        _hex(raw["logsBloom"], 256)
    creation = raw["contractAddress"]
    if creation is not None:
        _address(creation)
        _need(tx["to"] is None and raw["status"] == "0x1", "creation identity")
    if tx["to"] is None and raw["status"] == "0x1":
        _need(creation is not None, "missing creation address")
    _need(type(raw["logs"]) is list and len(raw["logs"]) <= MAX_LOGS, "receipt log bound")
    _need(raw["status"] == "0x1" or not raw["logs"], "rejected transaction logs")
    logs = [_log(log, header, tx_hash, index, first_log + at) for at, log in enumerate(raw["logs"])]
    return cumulative, logs


def collect(rpc, config):
    """Return {history, manifest, acquisition}; raise AcquisitionError on gaps.

    rpc(method, params) must synchronously return a decoded result, raising on
    RPC error. Its caller owns transport allowlisting, response retention and
    duplicate-JSON-property rejection. This module starts no process or network.
    """
    _need(callable(rpc), "RPC callable required")
    _object(config, CONFIG_FIELDS)
    _need(type(config["chain_id"]) is int and config["chain_id"] == 31337, "chain profile")
    _object(config["addresses"], {"registry", "probe", "token"})
    addresses = dict(config["addresses"])
    for value in addresses.values():
        _address(value)
    _need(len(set(addresses.values())) == 3 and addresses["token"] == TOKEN, "address profile")
    start, end = config["start_block_number"], config["end_block_number"]
    _need(type(start) is int and type(end) is int and 0 <= start < end <= MAX_UINT
          and end - start + 1 <= MAX_BLOCKS, "block interval bound")
    for key in ("start_block_hash", "end_block_hash"):
        _hex(config[key], 32)
    for key in ("registry_runtime_sha256", "probe_runtime_sha256"):
        _need(type(config[key]) is str and re.fullmatch(r"[0-9a-f]{64}", config[key]), "runtime pin format")
    manifest = {key: copy.deepcopy(config[key]) for key in CONFIG_FIELDS - {"start_block_number", "end_block_number"}}
    _need(manifest["start_block_hash"] != manifest["end_block_hash"], "duplicate endpoint hash")
    calls, response_bytes, methods = 0, 0, {}

    def read(method, params):
        nonlocal calls, response_bytes
        calls += 1
        _need(calls <= MAX_RPC_CALLS, "RPC call bound")
        methods[method] = methods.get(method, 0) + 1
        result = rpc(method, params)
        _need(result is not None, "missing RPC result")
        response_bytes += _bounded_json(result)
        _need(response_bytes <= 16 * 1024 * 1024, "aggregate RPC byte bound")
        return copy.deepcopy(result)

    def endpoints():
        _need(_quantity(read("eth_chainId", [])) == config["chain_id"], "RPC chain mismatch")
        found = []
        for name, number in (("start", start), ("end", end)):
            header = _header(read("eth_getBlockByNumber", [hex(number), False]), number, False)
            _need(header["hash"] == manifest[name + "_block_hash"], "endpoint hash changed")
            found.append(header)
        return found

    anchors = endpoints()
    entries, all_logs, block_lookup, transaction_ids = [], [], {}, set()
    previous = None
    checkpoint_transactions = 0
    for number in range(start, end + 1):
        raw_block = read("eth_getBlockByNumber", [hex(number), True])
        header = _header(raw_block, number, True)
        _need(header["hash"] not in block_lookup, "duplicate block hash")
        if previous is not None:
            _need(header["parentHash"] == previous["hash"] and
                  _quantity(header["timestamp"]) >= _quantity(previous["timestamp"]), "block continuity")
        if number == start:
            _need(header == anchors[0], "start block changed during acquisition")
        if number == end:
            _need(header == anchors[1], "end block changed during acquisition")
        block_lookup[header["hash"]] = header
        cumulative, next_log = 0, 0
        transactions = []
        for index, raw_tx in enumerate(raw_block["transactions"]):
            tx = _transaction(raw_tx, header, index)
            tx_hash = raw_tx["hash"]
            _need(tx_hash not in transaction_ids, "duplicate transaction hash")
            transaction_ids.add(tx_hash)
            _need(len(transaction_ids) <= MAX_TRANSACTIONS, "interval transaction bound")
            receipt = read("eth_getTransactionReceipt", [tx_hash])
            cumulative, logs = _receipt(receipt, tx, header, tx_hash, index, cumulative, next_log)
            next_log += len(logs)
            all_logs.extend(logs)
            _need(len(all_logs) <= MAX_LOGS, "interval log bound")
            transactions.append({"transaction": tx, "receipt": receipt})
        _need(cumulative == _quantity(header["gasUsed"]), "incomplete receipt gas coverage")
        if number == start:
            checkpoint_transactions = len(transactions)
        else:
            entries.append({"header": header, "transactions": transactions})
        previous = header

    # Deliberately unfiltered: address/topic filtering could conceal unexpected
    # logs. Compare the independently requested interval with every receipt log.
    queried_logs = read("eth_getLogs", [{"fromBlock": hex(start), "toBlock": hex(end)}])
    _need(type(queried_logs) is list and len(queried_logs) <= MAX_LOGS, "getLogs bound")
    _need(len(queried_logs) == len(all_logs), "getLogs coverage mismatch")
    seen_logs = set()
    for index, raw_log in enumerate(queried_logs):
        _need(type(raw_log) is dict and "blockHash" in raw_log and raw_log["blockHash"] in block_lookup, "getLogs outside interval")
        expected = all_logs[index]
        normalized = _log(raw_log, block_lookup[raw_log["blockHash"]], expected["transactionHash"],
                          _quantity(expected["transactionIndex"]), _quantity(expected["logIndex"]))
        identity = (normalized["blockHash"], normalized["transactionHash"], normalized["logIndex"])
        _need(identity not in seen_logs and normalized == expected, "getLogs duplicate/conflict/order")
        seen_logs.add(identity)

    runtime = {}
    tag = hex(end)
    for name in ("registry", "probe"):
        value = read("eth_getCode", [addresses[name], tag])
        raw = _hex(value, maximum=24576)
        _need(raw and hashlib.sha256(raw).hexdigest() == manifest[name + "_runtime_sha256"], "endpoint runtime pin")
        runtime[name] = value
    keccak = _primitive()

    def getter(destination, signature, arguments=(), words=1):
        payload = keccak(signature.encode("ascii"))[:4] + b"".join(value.to_bytes(32, "big") for value in arguments)
        result = read("eth_call", [{"from": OBSERVER, "to": destination, "data": "0x" + payload.hex(),
                                    "gas": "0x3d0900", "gasPrice": "0x174876e800", "value": "0x0"}, tag])
        data = _hex(result, width=words * 32)
        return [int.from_bytes(data[at:at + 32], "big") for at in range(0, len(data), 32)]

    final = {key: [] for key in ("owners", "epochs", "credits", "stakes", "nonces")}
    for account_id in (1, 2, 3):
        owner, epoch = getter(addresses["registry"], "authority(uint256)", (account_id,), 2)
        _need(0 < owner < (1 << 160), "authority ABI padding/owner")
        final["owners"].append("0x" + owner.to_bytes(20, "big").hex())
        final["epochs"].append(str(epoch))
        for field in ("credits", "stakes", "nonces"):
            final[field].append(str(getter(addresses["probe"], field + "(uint256)", (account_id,))[0]))
    for field in ("totalCredits", "poolDust", "messageCount"):
        final[field] = str(getter(addresses["probe"], field + "()")[0])
    final["tokenBalance"] = str(getter(addresses["token"], "balanceOf(address)", (int(addresses["probe"], 16),))[0])
    _need(endpoints() == anchors, "endpoints changed during acquisition")
    history = {"schema": "caw-paid-history/1", "chain_id": manifest["chain_id"], "addresses": addresses,
               "registry_runtime": runtime["registry"], "probe_runtime": runtime["probe"],
               "start_block": anchors[0], "end_block": entries[-1]["header"], "blocks": entries, "final": final}
    acquisition = {
        "schema": "caw-paid-number-acquisition/1", "strategy": "forward-number-full-transactions",
        "read_only": True, "writer_capture_used": False, "other_collector_used": False,
        "independent_provider": False, "authenticates_consensus": False, "reorg_recovery": False,
        "start_checkpoint_exclusive": True, "start_block_number": start, "end_block_number": end,
        "fetched_blocks_including_checkpoint": end - start + 1,
        "reader_blocks": len(entries), "fetched_transactions_including_checkpoint": len(transaction_ids),
        "reader_transactions": len(transaction_ids) - checkpoint_transactions,
        "logs_compared_including_checkpoint": len(all_logs), "unfiltered_getLogs_agrees": True,
        "endpoint_hashes_rechecked": True, "endpoint_getter_tag": tag,
        "rpc_calls": calls, "rpc_methods": methods, "decoded_response_bytes": response_bytes,
        "limits": {"blocks": MAX_BLOCKS, "transactions": MAX_TRANSACTIONS, "logs": MAX_LOGS,
                   "rpc_calls": MAX_RPC_CALLS, "result_bytes": MAX_RESULT_BYTES},
        "trust_boundary": "Supplied endpoint/runtime pins and one RPC provider; no header hashing, trie proofs, consensus or finality authentication.",
    }
    result = {"history": history, "manifest": manifest, "acquisition": acquisition}
    _need(len(json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("ascii")) <= MAX_RESULT_BYTES, "result byte bound")
    return result
