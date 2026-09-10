"""Offline, independent Python checks for the controlled two-branch fixture.

Explicit invocation only. Reads six bounded JSON files, runs the unchanged
Python paid-action reader, and writes only to a NEW output directory. No node,
network, writer imports, signature validation, consensus or finality claims.
The supplied histories/manifests remain trust inputs. Endpoint getter equality
is checked by the reader; this script does not authenticate those observations.
"""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
import types


HERE = Path(__file__).resolve().parent
READER_PATH = HERE / "../../reference/paid_action_reader.py"
READER_SHA256 = "a6a5869994c17baefbe6225b8726746fc0f29ace942583c8c9e7864f2224c6cd"
A = "0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76"
B = "0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73"
FEE = 5000 * 10 ** 18
TEXT = {
    "common": b"common-prefix",
    "left_first": b"discarded-first",
    "left_second": b"discarded-second",
    "right_first": b"selected-first",
}
MAX_OUTPUT_BYTES = 1024 * 1024
sys.dont_write_bytecode = True


class CheckError(ValueError):
    """A concise fixture-oracle failure, without printing supplied data."""


def need(condition, code):
    if not condition:
        raise CheckError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, ensure_ascii=True) + "\n").encode("ascii")


def load_reader():
    raw = READER_PATH.read_bytes()
    need(digest(raw) == READER_SHA256, "UNCHANGED_PYTHON_READER_PIN")
    module = types.ModuleType("controlled_reorg_python_reader")
    module.__file__ = str(READER_PATH.resolve())
    # Compile the exact pinned bytes, without __main__ or import-loader caches.
    sys.modules[module.__name__] = module
    exec(compile(raw, module.__file__, "exec"), module.__dict__)
    return module


def expected_message(reader, index, owner, epoch, nonce, marker, stakes):
    eligible = stakes[1] + stakes[2]
    allocations = [0, FEE * stakes[1] // eligible, FEE * stakes[2] // eligible]
    return {
        "id": str(index), "accountId": "1", "owner": owner,
        "epoch": str(epoch), "nonce": str(nonce), "fee": str(FEE),
        "text_hex": "0x" + TEXT[marker].hex(),
        "distributionHash": "0x" + reader.keccak(b"".join(v.to_bytes(32, "big") for v in stakes)).hex(),
        "allocations": list(map(str, allocations)), "dust": str(FEE - sum(allocations)),
    }


def expected_results(reader):
    q1, q2 = FEE // 3, (2 * FEE) // 3
    common = expected_message(reader, 1, A, 0, 0, "common", (0, 1, 2))

    def state(owners, nonce, stakes, credits, total, dust, vault, messages):
        return {
            "owners": owners, "epochs": ["1", "0", "0"],
            "nonces": [str(nonce), "0", "0"], "stakes": list(map(str, stakes)),
            "credits": list(map(str, credits)), "totalCredits": str(total),
            "poolDust": str(dust), "tokenBalance": str(vault),
            "messageCount": str(len(messages)), "messages": messages,
        }

    left = state(
        [B, A, B], 3, (0, 1, 3),
        (17 * FEE - 7, 10 + 2 * q1 + FEE // 4, 10 + 2 * q2 + 3 * FEE // 4),
        20 * FEE + 11, 2, 20 * FEE + 13,
        [common, expected_message(reader, 2, B, 1, 1, "left_first", (0, 1, 2)),
         expected_message(reader, 3, B, 1, 2, "left_second", (0, 1, 3))],
    )
    right = state(
        [A, A, B], 2, (0, 3, 2),
        (18 * FEE - 9, 10 + q1 + 3 * FEE // 5, 10 + q2 + 2 * FEE // 5),
        20 * FEE + 10, 1, 20 * FEE + 11,
        [common, expected_message(reader, 2, A, 1, 1, "right_first", (0, 3, 2))],
    )
    ancestor = state([A, A, B], 1, (0, 1, 2), (19 * FEE, 10 + q1, 10 + q2),
                     20 * FEE + 19, 1, 20 * FEE + 20, [common])
    ancestor["epochs"] = ["0", "0", "0"]
    return {"left": left, "right": right, "ancestor": ancestor}


def assert_state(actual, expected, label):
    need(set(actual) == set(expected), label + "_FIELDS")
    # Never interpolate a complete capture or a giant diff into a failure.
    for key in sorted(expected):
        need(actual[key] == expected[key], label + "_" + key.upper())


def check(input_dir, reader, report):
    histories, manifests, results = {}, {}, {}
    input_pins = {}

    def read_input(filename):
        with (input_dir / filename).open("rb") as stream:
            raw = stream.read(reader.MAX_BYTES + 1)
        need(len(raw) <= reader.MAX_BYTES, "INPUT_BYTE_BOUND")

        def invalid_constant(_):
            raise CheckError("NONFINITE_JSON_NUMBER")

        value = json.loads(raw.decode("utf-8"), object_pairs_hook=reader.unique_pairs,
                           parse_constant=invalid_constant)
        reader.bounded_tree(value)
        # Hash the exact bytes parsed, without a second filesystem read.
        input_pins[filename] = digest(raw)
        return value

    for branch in ("left", "right"):
        filename = "manifest-" + branch + ".json"
        manifests[branch] = read_input(filename)
        for strategy in ("number", "hash"):
            key = branch + "-" + strategy
            filename = "history-" + key + ".json"
            history = read_input(filename)
            need(len(history.get("blocks", [])) <= 128, "FIXTURE_BLOCK_BOUND")
            histories[key] = history
            results[key] = reader.reconstruct(history, manifests[branch])
            transactions = [entry for block in history["blocks"] for entry in block["transactions"]]
            need(len(transactions) <= 128, "FIXTURE_TRANSACTION_BOUND")
            need(sum(len(entry["receipt"]["logs"]) for entry in transactions) <= 1024, "FIXTURE_LOG_BOUND")
    report["input_sha256"] = input_pins
    expected = expected_results(reader)
    checks = report["checks"]
    for branch in ("left", "right"):
        number, hashed = branch + "-number", branch + "-hash"
        need(histories[number] == histories[hashed], branch.upper() + "_FULL_HISTORY_EQUALITY")
        need(results[number] == results[hashed], branch.upper() + "_FULL_RECONSTRUCTION_EQUALITY")
        assert_state(results[number], expected[branch], branch.upper() + "_ORACLE")
        checks.append(branch + "_full_acquisition_reconstruction_and_endpoint_oracle")

    left, right = histories["left-number"], histories["right-number"]
    trust_keys = set(manifests["left"]) - {"end_block_hash"}
    need(trust_keys == set(manifests["right"]) - {"end_block_hash"}, "TRUST_FIELDS")
    need(all(manifests["left"][key] == manifests["right"][key] for key in trust_keys), "SHARED_DEPLOYMENT_TRUST")
    for key in ("start_block", "addresses", "registry_runtime", "probe_runtime", "chain_id"):
        need(left[key] == right[key], "SHARED_" + key.upper())
    need(len(left["blocks"]) == len(right["blocks"]) and len(left["blocks"]) > 5, "BRANCH_INTERVAL_LENGTH")
    prefix_count = len(left["blocks"]) - 5
    need(left["blocks"][:prefix_count] == right["blocks"][:prefix_count], "FULL_COMMON_PREFIX")
    ancestor = left["blocks"][prefix_count - 1]["header"]
    ls, rs = left["blocks"][prefix_count:], right["blocks"][prefix_count:]
    need(left["end_block"]["number"] == right["end_block"]["number"], "EQUAL_TIP_HEIGHT")
    need(left["end_block"]["hash"] != right["end_block"]["hash"], "DISTINCT_TIP_HASHES")
    for offset, (lb, rb) in enumerate(zip(ls, rs), 1):
        need(lb["header"]["hash"] != rb["header"]["hash"], "DISTINCT_SUFFIX_HASH_" + str(offset))
        need(lb["header"]["number"] == rb["header"]["number"], "EQUAL_SUFFIX_HEIGHT_" + str(offset))
        need(len(lb["transactions"]) == len(rb["transactions"]) == 1, "ONE_TRANSACTION_PER_SUFFIX_BLOCK")
        need(lb["transactions"][0]["receipt"]["status"] == "0x1", "LEFT_SUFFIX_SUCCESS")
        wanted = "0x0" if offset == 2 else "0x1"
        need(rb["transactions"][0]["receipt"]["status"] == wanted, "RIGHT_SUFFIX_STATUS_" + str(offset))
    need(ls[0]["header"]["parentHash"] == rs[0]["header"]["parentHash"] == ancestor["hash"], "ACTUAL_COMMON_ANCESTOR")
    need(ls[1]["transactions"][0]["transaction"] == rs[1]["transactions"][0]["transaction"], "REUSED_EXACT_TRANSACTION_FIELDS")
    need(rs[1]["transactions"][0]["receipt"]["logs"] == [], "REJECTED_SUFFIX_POST_HAS_NO_LOGS")
    checks.append("same_complete_prefix_and_five_one_transaction_blocks_per_suffix")
    checks.append("same_submitted_post_bytes_left_success_right_failure")

    # The ancestor endpoint here is an independent arithmetic oracle, not an
    # invented getter observation. Replay the complete prefix against it.
    prefix = copy.deepcopy(left)
    prefix["blocks"] = prefix["blocks"][:prefix_count]
    prefix["end_block"] = copy.deepcopy(ancestor)
    prefix["final"] = {key: value for key, value in expected["ancestor"].items() if key != "messages"}
    prefix_manifest = copy.deepcopy(manifests["left"])
    prefix_manifest["end_block_hash"] = ancestor["hash"]
    assert_state(reader.reconstruct(prefix, prefix_manifest), expected["ancestor"], "ANCESTOR_REPLAY_ORACLE")
    del prefix
    checks.append("ancestor_complete_prefix_arithmetic_oracle")
    need(results["left-number"]["messages"][0] == results["right-number"]["messages"][0], "COMMON_MESSAGE")
    need(results["left-number"]["messages"][1]["id"] == results["right-number"]["messages"][1]["id"] == "2", "REUSED_MESSAGE_ID")
    need(results["left-number"]["messages"][1]["text_hex"] != results["right-number"]["messages"][1]["text_hex"], "DISTINCT_MESSAGE_BYTES")
    checks.append("message_id_reuse_with_exact_distinct_text_authority_and_allocations")

    def rejected(label, history, manifest):
        try:
            reader.reconstruct(history, manifest)
        except reader.HistoryError as error:
            report["negative_checks"].append({"name": label, "rejected": True, "reason": str(error)[:180]})
        else:
            raise CheckError("NEGATIVE_ACCEPTED_" + label.upper())

    candidate = copy.deepcopy(right)
    candidate["blocks"][prefix_count + 1] = copy.deepcopy(ls[1])
    rejected("mixed_suffix", candidate, manifests["right"])
    candidate = copy.deepcopy(right)
    del candidate["blocks"][prefix_count - 1]
    rejected("omitted_ancestor_block", candidate, manifests["right"])
    candidate = copy.deepcopy(right)
    logs = candidate["blocks"][-2]["transactions"][0]["receipt"]["logs"]
    post_indices = [i for i, log in enumerate(logs) if log["address"] == right["addresses"]["probe"] and reader.PROBE_EVENTS.get(log["topics"][0]) == "post"]
    need(len(post_indices) == 1, "NEGATIVE_POST_LOG_TARGET")
    del logs[post_indices[0]]
    rejected("missing_post_log", candidate, manifests["right"])
    candidate = copy.deepcopy(right)
    final_block = candidate["blocks"][-1]
    final_block["transactions"].append(copy.deepcopy(final_block["transactions"][0]))
    final_block["header"]["transactions"].append(final_block["header"]["transactions"][0])
    candidate["end_block"] = copy.deepcopy(final_block["header"])
    rejected("duplicated_transaction", candidate, manifests["right"])
    candidate = copy.deepcopy(right)
    root = candidate["end_block"].get("stateRoot")
    reader.hx(root, 32)
    candidate["end_block"]["stateRoot"] = "0x" + ("1" if root[2] != "1" else "2") + root[3:]
    rejected("contradictory_endpoint_state_root", candidate, manifests["right"])
    rejected("left_history_under_right_manifest", left, manifests["right"])
    need(len(report["negative_checks"]) == 6, "NEGATIVE_COVERAGE")

    report["branch_shape"] = {
        "common_prefix_blocks": prefix_count,
        "ancestor_hash": ancestor["hash"], "ancestor_number": ancestor["number"],
        "left_tip_hash": left["end_block"]["hash"], "right_tip_hash": right["end_block"]["hash"],
        "tip_number": right["end_block"]["number"], "blocks_per_suffix": 5,
        "left_suffix_hashes": [block["header"]["hash"] for block in ls],
        "right_suffix_hashes": [block["header"]["hash"] for block in rs],
    }
    report["ancestor_oracle"] = expected["ancestor"]
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=HERE)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    report = {
        "schema": "caw-paid-reorg-python-checks/1", "complete": False,
        "synthetic_only": True, "historical_caw_execution": False,
        "reader_sha256": READER_SHA256, "checks": [], "negative_checks": [],
        "trust": "Supplied local histories and independent endpoint manifests; the controller nominates the selected branch. No network access, signature validation, header/trie authentication, independent-provider consensus, freshness or public-chain finality is established. A failed reused post does not prove all orphaned signatures are permanently invalid.",
    }
    created = False
    try:
        need(args.input_dir.is_dir(), "INPUT_DIRECTORY")
        need(args.output_dir.parent.is_dir() and not args.output_dir.exists(), "NEW_OUTPUT_DIRECTORY_REQUIRED")
        args.output_dir.mkdir()
        created = True
        reader = load_reader()
        results = check(args.input_dir, reader, report)
        output_bytes = {"reconstruction-python-" + key + ".json": encoded(result) for key, result in results.items()}
        need(sum(map(len, output_bytes.values())) <= MAX_OUTPUT_BYTES, "OUTPUT_BYTE_BOUND")
        report["reconstruction_sha256"] = {name: digest(raw) for name, raw in output_bytes.items()}
        report["complete"] = True
        report_raw = encoded(report)
        need(len(report_raw) <= MAX_OUTPUT_BYTES, "REPORT_BYTE_BOUND")
        for filename, raw in output_bytes.items():
            (args.output_dir / filename).write_bytes(raw)
        (args.output_dir / "reconstruction-checks.json").write_bytes(report_raw)
        print(json.dumps({"complete": True, "reconstructions": 4, "negative_cases": 6}))
        return 0
    except Exception as error:
        # Bounded diagnostics even for malformed input. A partial result is
        # explicitly incomplete, never a substitute for four passing rebuilds.
        report["complete"] = False
        report["error"] = (str(error) if isinstance(error, (CheckError, ValueError)) else type(error).__name__)[:180]
        if created:
            try:
                (args.output_dir / "reconstruction-checks.json").write_bytes(encoded(report))
            except OSError:
                pass
        print(json.dumps({"complete": False, "error": report["error"]}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
