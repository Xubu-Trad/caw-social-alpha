"""Independent, bounded reader for the local paid-CAW capture format.

Reads JSON only; no RPC, EVM execution, writer imports or signature verification.
The separately supplied manifest and capture are trust inputs. Matching supplied
header/receipt identities is NOT header hashing, a transaction/receipt trie proof,
ECDSA/ERC-1271 revalidation, consensus, finality, freshness or live authority.
Local automining may give consecutive blocks equal timestamps; this reader
requires nondecreasing capture time, not Ethereum consensus-valid timestamps.
The interval starts before the recorded registry/probe creations; the fresh probe
starts with zero token balance. Endpoint observations must match reconstruction.

The sole shared algorithm is the reviewed fixture generator's Keccak primitive;
its main function is never called. All ABI/event and accounting logic below is
derived independently from the original Solidity contracts.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys


MAX = (1 << 256) - 1
FEE = 5000 * 10 ** 18
MAX_STAKE = MAX // FEE
MAX_BYTES = 8 * 1024 * 1024
ZERO = "0x" + "00" * 20
TOKEN = "0xf3b9569f82b18aef890de263b84189bd33ebe452"
STATE_KEYS = {"owners", "epochs", "credits", "stakes", "nonces", "totalCredits",
              "poolDust", "messageCount", "tokenBalance"}


class HistoryError(ValueError):
    """A bounded capture/schema/accounting consistency check failed."""


def require(condition, reason):
    if not condition:
        raise HistoryError(reason)


def obj(value, fields=None, required=()):
    require(type(value) is dict, "object required")
    if fields is not None:
        require(set(value) == set(fields), "unexpected object fields")
    require(set(required).issubset(value), "missing object fields")
    return value


def array(value, maximum, exact=None):
    require(type(value) is list and len(value) <= maximum, "array bound")
    require(exact is None or len(value) == exact, "array length")
    return value


def hx(value, size=None, maximum=65536):
    require(type(value) is str and re.fullmatch(r"0x(?:[0-9a-f]{2})*", value) is not None,
            "lowercase even hex required")
    require(len(value) <= 2 + maximum * 2, "hex byte bound")
    require(size is None or len(value) == 2 + size * 2, "hex width")
    return bytes.fromhex(value[2:])


def address(value, nonzero=False):
    hx(value, 20)
    require(not nonzero or value != ZERO, "zero address")
    return value


def uint(value):
    require(type(value) is int and 0 <= value <= MAX, "uint256 bound")
    return value


def quantity(value):
    require(type(value) is str and re.fullmatch(r"0x(?:0|[1-9a-f][0-9a-f]*)", value) is not None
            and len(value) <= 66, "canonical RPC quantity required")
    return uint(int(value[2:], 16))


def decimal(value):
    require(type(value) is str and re.fullmatch(r"0|[1-9][0-9]*", value) is not None
            and len(value) <= 78, "canonical decimal required")
    return uint(int(value))


def bounded_tree(value):
    pending = [(value, 0)]
    count = 0
    while pending:
        item, depth = pending.pop()
        count += 1
        require(depth <= 32 and count <= 150000, "JSON structural bound")
        kind = type(item)
        require(kind in (dict, list, str, int, bool, type(None)), "unsupported JSON value")
        if kind is dict:
            require(all(type(k) is str for k in item), "JSON key type")
            pending.extend((v, depth + 1) for v in item.values())
        elif kind is list:
            pending.extend((v, depth + 1) for v in item)
        elif kind is str:
            require(len(item) <= MAX_BYTES, "JSON string bound")
            require(not any(0xd800 <= ord(c) <= 0xdfff for c in item), "unpaired Unicode surrogate")
        elif kind is int:
            uint(item)


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON property")
        result[key] = value
    return result


def read_json(path):
    with Path(path).open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    require(len(raw) <= MAX_BYTES, "JSON byte bound")
    def no_constant(_):
        raise HistoryError("nonfinite JSON number")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs,
                       parse_constant=no_constant)
    bounded_tree(value)
    return value


_primitive_path = Path(__file__).resolve().parent / "fixtures" / "generate-ethereum-proof-fixtures.py"
_primitive_bytes = _primitive_path.read_bytes()
require(hashlib.sha256(_primitive_bytes).hexdigest() ==
        "5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa",
        "shared Keccak source digest mismatch")
_primitive_globals = {"__name__": "paid_reader_keccak_primitive", "__file__": str(_primitive_path)}
# Compile the checked bytes directly: no source-loader cache read/write and no
# __main__ execution. The generator's other definitions are unused.
exec(compile(_primitive_bytes, str(_primitive_path), "exec"), _primitive_globals)


def keccak(data):
    require(type(data) is bytes and len(data) <= 65536, "Keccak input bound")
    return _primitive_globals["digest"](data)


def topic(signature):
    return "0x" + keccak(signature.encode("ascii")).hex()


TRANSFER = topic("Transfer(address,address,uint256)")
APPROVAL = topic("Approval(address,address,uint256)")
ALL_APPROVAL = topic("ApprovalForAll(address,address,bool)")
PROBE_EVENTS = {
    topic("Deposited(uint256,address,uint256,uint256,uint256)"): "deposit",
    topic("Withdrawn(uint256,address,uint256,uint256,uint256)"): "withdraw",
    topic("Staked(uint256,address,uint256,uint256,uint256)"): "stake",
    topic("Unstaked(uint256,address,uint256,uint256,uint256)"): "unstake",
    topic("Posted(uint256,uint256,address,uint256,uint256,bytes,uint256,bytes32,uint256,uint256,uint256,uint256)"): "post",
}
SELECTORS = {keccak((name + "(uint256,uint256,uint256)").encode("ascii"))[:4]: name
             for name in ("deposit", "withdraw", "stake", "unstake")}
POST_SELECTOR = keccak(b"post((uint256,uint256,uint256,uint256,uint256,bytes32,bytes),bytes)")[:4]


def word(data, index):
    require(len(data) >= (index + 1) * 32, "truncated ABI word")
    return int.from_bytes(data[index * 32:(index + 1) * 32], "big")


def word_address(data):
    require(len(data) == 32 and data[:12] == bytes(12), "ABI address padding")
    return "0x" + data[12:].hex()


def account(value):
    require(type(value) is int and 1 <= value <= 3, "account ID outside fixture")
    return value - 1


def text_bytes(value):
    require(0 < len(value) <= 1680, "text byte bound")
    try:
        decoded = value.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise HistoryError("invalid exact UTF-8") from error
    require(len(decoded) <= 420, "text scalar bound")
    return value


def dynamic_bytes(data, offset, maximum):
    require(offset % 32 == 0 and offset + 32 <= len(data), "dynamic ABI offset")
    length = int.from_bytes(data[offset:offset + 32], "big")
    require(length <= maximum, "dynamic ABI byte bound")
    end = offset + 32 + ((length + 31) // 32) * 32
    require(end <= len(data), "truncated dynamic ABI bytes")
    payload = data[offset + 32:offset + 32 + length]
    require(data[offset + 32 + length:end] == bytes(end - offset - 32 - length), "dynamic ABI padding")
    return payload, end


def probe_call(data):
    require(len(data) >= 4, "probe selector absent")
    selector, args = data[:4], data[4:]
    if selector in SELECTORS:
        require(len(args) == 96, "static probe calldata width")
        return {"kind": SELECTORS[selector], "accountId": word(args, 0),
                "epoch": word(args, 1), "amount": word(args, 2)}
    require(selector == POST_SELECTOR, "unsupported successful probe call")
    require(len(args) >= 64 and word(args, 0) == 64, "post tuple head")
    request = args[64:]
    require(len(request) >= 224 and word(request, 6) == 224, "post text offset")
    text, end = dynamic_bytes(request, 224, 1680)
    require(word(args, 1) == 64 + end, "post signature offset")
    _, final = dynamic_bytes(args, 64 + end, 4096)
    require(final == len(args), "post trailing calldata")
    # Signature bytes are bounded and preserved by the capture; their validity
    # is a recorded contract outcome, not independently proven by this reader.
    return {"kind": "post", "accountId": word(request, 0), "epoch": word(request, 1),
            "nonce": word(request, 2), "validAfter": word(request, 3),
            "deadline": word(request, 4), "distributionHash": "0x" + request[160:192].hex(),
            "text": text_bytes(text)}


def header(value):
    obj(value, required=("hash", "parentHash", "number", "timestamp", "transactions", "gasUsed"))
    hx(value["hash"], 32)
    hx(value["parentHash"], 32)
    number, timestamp = quantity(value["number"]), quantity(value["timestamp"])
    quantity(value["gasUsed"])
    hashes = array(value["transactions"], 256)
    for item in hashes:
        hx(item, 32)
    require(len(set(hashes)) == len(hashes), "duplicate header transaction")
    return number, timestamp


class Ledger:
    def __init__(self, addresses):
        self.addresses = addresses
        self.owners = [None] * 3
        self.epochs = [0] * 3
        self.credits = [0] * 3
        self.stakes = [0] * 3
        self.nonces = [0] * 3
        self.total = self.dust = self.balance = 0
        self.messages = []
        self.registry_created = self.probe_created = False
        self.mint_count = 0

    def invariants(self):
        for value in self.credits + self.stakes + self.nonces + self.epochs + [self.total, self.dust, self.balance]:
            uint(value)
        require(self.total == sum(self.credits), "credit conservation")
        require(all(s <= c and s <= MAX_STAKE for s, c in zip(self.stakes, self.credits)), "stake backing/limit")
        require(self.total + self.dust <= MAX and self.balance >= self.total + self.dust, "token backing")

    def state(self):
        return {"owners": self.owners[:], "epochs": list(map(str, self.epochs)),
                "credits": list(map(str, self.credits)), "stakes": list(map(str, self.stakes)),
                "nonces": list(map(str, self.nonces)), "totalCredits": str(self.total),
                "poolDust": str(self.dust), "messageCount": str(len(self.messages)),
                "tokenBalance": str(self.balance)}

    def registry_event(self, topics, data, context):
        require(self.registry_created, "registry event before creation")
        require(context["call"] is None, "successful probe call changed registry")
        name = topics[0]
        if name == ALL_APPROVAL:
            require(len(topics) == 3 and len(data) == 32, "registry operator approval shape")
            owner, operator = word_address(hx(topics[1], 32)), word_address(hx(topics[2], 32))
            require(owner != ZERO and owner != operator and word(data, 0) in (0, 1), "registry operator approval fields")
            context["last_registry"] = None
            return
        require(name in (TRANSFER, APPROVAL) and len(topics) == 4 and data == b"", "unknown registry event/shape")
        first, second = word_address(hx(topics[1], 32)), word_address(hx(topics[2], 32))
        index = account(int.from_bytes(hx(topics[3], 32), "big"))
        if name == APPROVAL:
            require(first == self.owners[index], "registry approval owner")
            context["last_registry"] = ("clear" if second == ZERO else "approval", index, first)
            return
        require(second != ZERO, "fixture cannot burn NFT")
        if first == ZERO:
            require(context["creation"] == self.addresses["registry"] and self.owners[index] is None
                    and index == self.mint_count, "invalid initial mint")
            self.owners[index] = second
            self.mint_count += 1
        else:
            require(self.mint_count == 3 and first == self.owners[index], "NFT transfer source")
            require(context["last_registry"] == ("clear", index, first), "NFT transfer missing approval clear")
            self.owners[index] = second
            self.epochs[index] = uint(self.epochs[index] + 1)
        context["last_registry"] = ("transfer", index, first)

    def token_event(self, topics, data, context):
        require(not context["probe_seen"], "token event after completed probe action")
        require(len(topics) == 3 and len(data) == 32 and topics[0] in (TRANSFER, APPROVAL), "unknown token event/shape")
        first, second = word_address(hx(topics[1], 32)), word_address(hx(topics[2], 32))
        require(first != ZERO and second != ZERO, "runtime token event has zero party")
        amount = word(data, 0)
        if topics[0] == APPROVAL:
            return
        probe = self.addresses["probe"]
        if first == probe or second == probe:
            require(self.probe_created, "probe token movement before recorded creation")
            if first == probe:
                self.balance = uint(self.balance - amount)
            if second == probe:
                self.balance = uint(self.balance + amount)
            context["token_moves"].append((first, second, amount))

    def probe_event(self, topics, data, context):
        require(self.probe_created and self.mint_count == 3, "probe event before fixture creation")
        require(context["to"] == self.addresses["probe"] and not context["probe_seen"], "unsupported forwarded/multiple probe event")
        kind = PROBE_EVENTS.get(topics[0])
        require(kind is not None, "unknown probe event")
        call = context["call"]
        require(call is not None and call["kind"] == kind, "probe call/event mismatch")
        if kind == "post":
            require(len(topics) == 4 and len(data) >= 320, "Posted event shape")
            message_id = int.from_bytes(hx(topics[1], 32), "big")
            index = account(int.from_bytes(hx(topics[2], 32), "big"))
            owner = word_address(hx(topics[3], 32))
            require(word(data, 2) == 288, "Posted text offset")
            text, end = dynamic_bytes(data, 288, 1680)
            require(end == len(data), "Posted trailing bytes")
            text_bytes(text)
            epoch, nonce, fee = word(data, 0), word(data, 1), word(data, 3)
            distribution = "0x" + data[128:160].hex()
            allocations = [word(data, i) for i in (5, 6, 7)]
            dust = word(data, 8)
            expected_hash = "0x" + keccak(b"".join(s.to_bytes(32, "big") for s in self.stakes)).hex()
            require(message_id == len(self.messages) + 1 and nonce == self.nonces[index], "post sequence/nonce")
            require(fee == FEE and distribution == expected_hash, "post fee/distribution")
            require(call["nonce"] == nonce and call["text"] == text and call["distributionHash"] == distribution,
                    "Posted content differs from calldata")
            require(call["validAfter"] < call["deadline"] and
                    call["validAfter"] <= context["timestamp"] < call["deadline"], "post validity window")
            require(self.credits[index] - self.stakes[index] >= FEE, "post spend exceeds unlocked credit")
            eligible = sum(s for i, s in enumerate(self.stakes) if i != index)
            require(0 < eligible <= MAX, "empty/overflowed stake pool")
            expected = [0 if i == index else FEE * s // eligible for i, s in enumerate(self.stakes)]
            require(allocations == expected and dust == FEE - sum(expected), "post allocation/dust")
            require(not context["token_moves"], "post unexpectedly moves external token")
            self.credits[index] -= FEE
            self.credits = [uint(c + a) for c, a in zip(self.credits, allocations)]
            self.dust = uint(self.dust + dust)
            self.total = uint(self.total - dust)
            self.nonces[index] = uint(nonce + 1)
            self.messages.append({"id": str(message_id), "accountId": str(index + 1), "owner": owner,
                                  "epoch": str(epoch), "nonce": str(nonce), "text_hex": "0x" + text.hex(),
                                  "fee": str(fee), "distributionHash": distribution,
                                  "allocations": list(map(str, allocations)), "dust": str(dust)})
        else:
            require(len(topics) == 3 and len(data) == 96, "probe amount event shape")
            index = account(int.from_bytes(hx(topics[1], 32), "big"))
            owner = word_address(hx(topics[2], 32))
            amount, result, epoch = word(data, 0), word(data, 1), word(data, 2)
            require(amount > 0 and call["amount"] == amount and context["from"] == owner, "direct owner/amount")
            if kind in ("deposit", "withdraw"):
                move = ((owner, self.addresses["probe"], amount) if kind == "deposit"
                        else (self.addresses["probe"], owner, amount))
                require(context["token_moves"] == [move], "custody event/token movement mismatch")
                if kind == "deposit":
                    self.credits[index] = uint(self.credits[index] + amount)
                    self.total = uint(self.total + amount)
                else:
                    require(amount <= self.credits[index] - self.stakes[index], "withdraw locked/insufficient credit")
                    self.credits[index] -= amount
                    self.total -= amount
                require(result == self.credits[index], "custody resulting credit")
            else:
                require(not context["token_moves"], "stake unexpectedly moves external token")
                if kind == "stake":
                    require(amount <= self.credits[index] - self.stakes[index], "stake exceeds unlocked credit")
                    self.stakes[index] = uint(self.stakes[index] + amount)
                else:
                    require(amount <= self.stakes[index], "unstake exceeds stake")
                    self.stakes[index] -= amount
                require(result == self.stakes[index], "resulting stake")
        require(owner == self.owners[index] and epoch == self.epochs[index], "probe current authority")
        require(call["accountId"] == index + 1 and call["epoch"] == epoch, "probe account/epoch calldata")
        context["probe_seen"] = True
        self.invariants()


def reconstruct(history, manifest):
    """Return the reconstructed decimal-string state; raise on inconsistency."""
    bounded_tree(history)
    bounded_tree(manifest)
    require(len(json.dumps(history, ensure_ascii=True).encode("utf-8")) <= MAX_BYTES, "history byte bound")
    obj(history, {"schema", "chain_id", "addresses", "registry_runtime", "probe_runtime", "start_block", "end_block", "blocks", "final"})
    obj(manifest, {"chain_id", "addresses", "registry_runtime_sha256", "probe_runtime_sha256", "start_block_hash", "end_block_hash"})
    require(history["schema"] == "caw-paid-history/1" and type(history["chain_id"]) is int and
            history["chain_id"] == 31337 and type(manifest["chain_id"]) is int and manifest["chain_id"] == 31337,
            "history format/chain")
    for value in (history["addresses"], manifest["addresses"]):
        obj(value, {"registry", "probe", "token"})
        for item in value.values():
            address(item, True)
        require(len(set(value.values())) == 3 and value["token"] == TOKEN, "fixture address context")
    require(history["addresses"] == manifest["addresses"], "trusted address mismatch")
    for name in ("registry", "probe"):
        expected = manifest[name + "_runtime_sha256"]
        require(type(expected) is str and re.fullmatch("[0-9a-f]{64}", expected) is not None, "runtime hash format")
        runtime = hx(history[name + "_runtime"], maximum=24576)
        require(runtime and hashlib.sha256(runtime).hexdigest() == expected, "runtime digest mismatch")
    start_number, previous_time = header(history["start_block"])
    end_number, _ = header(history["end_block"])
    for key in ("start", "end"):
        hx(manifest[key + "_block_hash"], 32)
        require(history[key + "_block"]["hash"] == manifest[key + "_block_hash"], "trusted endpoint hash mismatch")
    blocks = array(history["blocks"], 512)
    require(blocks and end_number - start_number == len(blocks), "incomplete block interval")
    ledger = Ledger(history["addresses"])
    previous_hash = history["start_block"]["hash"]
    seen_blocks = {previous_hash}
    seen_transactions = set()
    transaction_count = log_count = 0
    for block_offset, block in enumerate(blocks, 1):
        obj(block, {"header", "transactions"})
        raw_header = block["header"]
        number, timestamp = header(raw_header)
        require(number == start_number + block_offset and raw_header["parentHash"] == previous_hash,
                "block gap/reorder/parent mismatch")
        require(raw_header["hash"] not in seen_blocks and timestamp >= previous_time, "duplicate block/decreasing time")
        seen_blocks.add(raw_header["hash"])
        transactions = array(block["transactions"], 256)
        require(len(transactions) == len(raw_header["transactions"]), "missing block transaction")
        transaction_count += len(transactions)
        require(transaction_count <= 256, "transaction bound")
        next_log_index = cumulative_gas = 0
        for tx_index, entry in enumerate(transactions):
            obj(entry, {"transaction", "receipt"})
            tx, receipt = entry["transaction"], entry["receipt"]
            obj(tx, required=("from", "data", "gas", "gasPrice", "value"))
            require(set(tx).issubset({"from", "to", "data", "gas", "gasPrice", "value"}), "unexpected transaction fields")
            sender = address(tx["from"], True)
            target = None if tx.get("to") is None else address(tx["to"], True)
            calldata = hx(tx["data"])
            gas = quantity(tx["gas"])
            require(0 < gas <= 4000000, "transaction gas profile")
            quantity(tx["gasPrice"])
            require(quantity(tx["value"]) == 0, "transaction native value profile")
            obj(receipt, required=("transactionHash", "transactionIndex", "blockHash", "blockNumber", "status",
                                   "from", "to", "contractAddress", "logs", "gasUsed", "cumulativeGasUsed"))
            tx_hash = receipt["transactionHash"]
            hx(tx_hash, 32)
            require(tx_hash == raw_header["transactions"][tx_index] and tx_hash not in seen_transactions, "transaction hash duplicate/order")
            seen_transactions.add(tx_hash)
            require(receipt["blockHash"] == raw_header["hash"] and quantity(receipt["blockNumber"]) == number
                    and quantity(receipt["transactionIndex"]) == tx_index, "receipt block/transaction identity")
            require(address(receipt["from"], True) == sender and receipt["to"] == target, "receipt transaction parties")
            used = quantity(receipt["gasUsed"])
            require(used <= gas, "receipt exceeds transaction gas")
            cumulative_gas += used
            require(quantity(receipt["cumulativeGasUsed"]) == cumulative_gas, "receipt cumulative gas")
            status = quantity(receipt["status"])
            require(status in (0, 1), "receipt status")
            logs = array(receipt["logs"], 2048)
            require(status == 1 or not logs, "failed transaction emitted logs")
            creation = receipt["contractAddress"]
            if creation is not None:
                address(creation, True)
                require(target is None and status == 1, "contract creation receipt")
            if target is None and status == 1:
                require(creation is not None, "successful creation missing address")
            if creation == ledger.addresses["registry"]:
                require(not ledger.registry_created, "repeated registry creation")
                ledger.registry_created = True
            if creation == ledger.addresses["probe"]:
                require(not ledger.probe_created and ledger.mint_count == 3, "invalid probe creation order")
                ledger.probe_created = True
            call = None
            if status == 1 and target == ledger.addresses["probe"]:
                require(ledger.probe_created and quantity(tx["value"]) == 0, "probe call context/value")
                call = probe_call(calldata)
            context = {"from": sender, "to": target, "creation": creation, "call": call,
                       "timestamp": timestamp, "probe_seen": False, "token_moves": [], "last_registry": None}
            for log in logs:
                log_count += 1
                require(log_count <= 2048, "log bound")
                obj(log, required=("address", "topics", "data", "blockHash", "blockNumber", "transactionHash",
                                   "transactionIndex", "logIndex", "removed"))
                require(log["removed"] is False and log["blockHash"] == raw_header["hash"] and
                        quantity(log["blockNumber"]) == number and log["transactionHash"] == tx_hash and
                        quantity(log["transactionIndex"]) == tx_index and quantity(log["logIndex"]) == next_log_index,
                        "log removal/identity/order/gap")
                next_log_index += 1
                emitter = address(log["address"], True)
                topics = array(log["topics"], 4)
                require(topics, "anonymous event unsupported")
                for item in topics:
                    hx(item, 32)
                data = hx(log["data"], maximum=4096)
                if emitter == ledger.addresses["registry"]:
                    ledger.registry_event(topics, data, context)
                elif emitter == ledger.addresses["token"]:
                    ledger.token_event(topics, data, context)
                elif emitter == ledger.addresses["probe"]:
                    ledger.probe_event(topics, data, context)
                else:
                    raise HistoryError("unknown event emitter")
            require(call is None or context["probe_seen"], "successful probe call missing event")
            if creation == ledger.addresses["registry"]:
                require(ledger.mint_count == 3 and ledger.owners[0] == ledger.owners[1], "initial registry mint set")
                require(len(logs) == 3 and len(calldata) >= 64, "registry constructor event/argument shape")
                require(word_address(calldata[-64:-32]) == ledger.owners[0] and
                        word_address(calldata[-32:]) == ledger.owners[2], "registry constructor owner arguments")
            if creation == ledger.addresses["probe"]:
                require(not logs and len(calldata) >= 64, "probe constructor event/argument shape")
                require(word_address(calldata[-64:-32]) == ledger.addresses["registry"] and
                        calldata[-32:] == keccak(hx(history["registry_runtime"])), "probe constructor registry pin")
            ledger.invariants()
        require(cumulative_gas == quantity(raw_header["gasUsed"]), "missing receipt gas coverage")
        previous_hash, previous_time = raw_header["hash"], timestamp
    require(blocks[-1]["header"] == history["end_block"], "end header differs from captured interval")
    require(ledger.registry_created and ledger.probe_created and ledger.mint_count == 3, "missing fixture creation")
    endpoint = obj(history["final"], STATE_KEYS)
    for key in ("owners", "epochs", "credits", "stakes", "nonces"):
        array(endpoint[key], 3, exact=3)
        for item in endpoint[key]:
            address(item, True) if key == "owners" else decimal(item)
    for key in STATE_KEYS - {"owners", "epochs", "credits", "stakes", "nonces"}:
        decimal(endpoint[key])
    state = ledger.state()
    require(state == endpoint, "reconstructed state differs from endpoint")
    return {**state, "messages": ledger.messages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", required=True)
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()
    try:
        result = reconstruct(read_json(args.history), read_json(args.manifest))
        print(json.dumps(result, ensure_ascii=True, sort_keys=True, separators=(",", ":")))
    except (HistoryError, OSError, ValueError, RecursionError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=True), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
