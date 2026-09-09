"""Compare a solc standard-JSON output to the retained CAW runtime, offline."""
import argparse
import hashlib
import json
from pathlib import Path


def compare(output):
    if output.stat().st_size > 4 * 1024 * 1024:
        raise ValueError('Compiler output too large')
    result = json.loads(output.read_text(encoding='utf-8'))
    if any(row.get('severity') == 'error' for row in result.get('errors', [])):
        raise ValueError('Compiler diagnostics contain errors')
    contract = result['contracts']['StandardERC20.sol']['StandardERC20']
    deployed = contract['evm']['deployedBytecode']
    actual = bytes.fromhex(deployed['object'])
    capture_path = Path(__file__).resolve().parents[2] / 'reference/fixtures/caw-token-drpc.json'
    capture = json.loads(capture_path.read_text(encoding='utf-8'))
    expected = bytes.fromhex(next(row for row in capture['calls'] if row['label'] == 'runtime')['response']['result'][2:])
    if len(actual) != 2278 or len(expected) != 2278:
        raise ValueError('Runtime length differs')
    if deployed['immutableReferences'] != {'669': [{'length': 32, 'start': 283}]}:
        raise ValueError('Immutable positions differ')
    if actual[283:315] != bytes(32) or expected[283:315] != (18).to_bytes(32, 'big'):
        raise ValueError('Unexpected decimals immutable')
    for raw in [actual, expected]:
        if raw[2225:2235].hex() != 'a2646970667358221220' or raw[2267:].hex() != '64736f6c634300080a0033':
            raise ValueError('Compiler metadata structure differs')
    changed = [i for i, (left, right) in enumerate(zip(actual, expected)) if left != right]
    if any(i != 314 and not 2235 <= i <= 2266 for i in changed):
        raise ValueError('Difference outside observed immutable and metadata hash')
    # These substitutions are inspection only. No deployed token bytes are changed.
    normalized = bytearray(actual)
    normalized[283:315] = expected[283:315]
    normalized[2235:2267] = expected[2235:2267]
    if normalized != expected:
        raise ValueError('Normalized runtime mismatch')
    return {'executable_match_with_observed_immutable': True,
            'exact_unpatched_runtime_match': actual == expected,
            'original_metadata_recovered': False, 'runtime_bytes': len(actual),
            'observed_runtime_sha256': hashlib.sha256(expected).hexdigest(),
            'differing_byte_offsets': changed,
            'scope': 'Compiler output comparison only; not a compiler authenticity, historical source-byte, consensus or security proof.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('compiler_output', type=Path)
    print(json.dumps(compare(parser.parse_args().compiler_output), indent=2))
