"""Deterministic execution-header encoding fixtures; no network or execution.

Run with Python 3.11+ from any directory. Writes only the adjacent fixture.
Header assembly is independent of the JavaScript header inspector. The pinned,
previously reviewed Python Keccak/RLP primitives are reused rather than claimed
as another independent cryptographic implementation. Synthetic headers exercise
encoding, not consensus-valid blocks or fork activation.

Layout sources: EIP-1559, EIP-4895, EIP-4844, EIP-4788 and EIP-7685.
https://ethereum.org/developers/docs/data-structures-and-encoding/rlp/
"""
from pathlib import Path
import hashlib
import json
import re
import runpy
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PRIMITIVE = 'reference/fixtures/generate-ethereum-proof-fixtures.py'
PRIMITIVE_SHA256 = '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'
RETAINED = (
    ('retained-publicnode-prague', 'reference/fixtures/caw-token-publicnode.json',
     '1563f69bc37a657525fe5ac1dfc125a82d37a58bfe6d70df671ebb0cc475e2d4'),
    ('retained-drpc-prague', 'reference/fixtures/caw-token-drpc.json',
     '9a0781dc1d692e4f8ba0e9d9da51064a9bfd5a36c9d17bc34910bf8ed4235e04'),
)
BASE_FIELDS = (
    'parentHash', 'sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot',
    'receiptsRoot', 'logsBloom', 'difficulty', 'number', 'gasLimit', 'gasUsed',
    'timestamp', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas',
)
PROFILES = {
    'london-16': BASE_FIELDS,
    'shanghai-17': BASE_FIELDS + ('withdrawalsRoot',),
    'cancun-20': BASE_FIELDS + (
        'withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot'),
    'prague-21': BASE_FIELDS + (
        'withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot',
        'requestsHash'),
}
QUANTITIES = {
    'difficulty': 256, 'number': 256, 'gasLimit': 256, 'gasUsed': 256,
    'timestamp': 256, 'baseFeePerGas': 256, 'blobGasUsed': 64, 'excessBlobGas': 64,
}
WIDTHS = {
    'parentHash': 32, 'sha3Uncles': 32, 'miner': 20, 'stateRoot': 32,
    'transactionsRoot': 32, 'receiptsRoot': 32, 'logsBloom': 256,
    'mixHash': 32, 'nonce': 8, 'withdrawalsRoot': 32,
    'parentBeaconBlockRoot': 32, 'requestsHash': 32,
}
METADATA = {'totalDifficulty', 'size', 'uncles', 'transactions', 'withdrawals'}
MAX_SOURCE = 1024 * 1024
MAX_OUTPUT = 2 * 1024 * 1024


def require(condition, code):
    if not condition:
        raise ValueError('Header fixture rejected: ' + code)


def read_source(relative, expected=None):
    path = ROOT / relative
    with path.open('rb') as source:
        raw = source.read(MAX_SOURCE + 1)
    require(len(raw) <= MAX_SOURCE, 'source-size')
    digest = hashlib.sha256(raw).hexdigest()
    require(expected is None or digest == expected, 'source-pin')
    return raw, digest


def encoded_header(header, profile, primitive):
    """Assemble the consensus list directly from the named specification layout."""
    names = PROFILES[profile]
    require(set(names).issubset(header), 'missing-header-field')
    require(set(header).issubset(set(names) | METADATA | {'hash'}), 'header-field')
    parts = []
    for field in names:
        value = header[field]
        require(type(value) is str, 'field-type')
        if field in QUANTITIES:
            require(re.fullmatch(r'0x(?:0|[1-9a-f][0-9a-f]*)', value) is not None,
                    'quantity-encoding')
            number = int(value, 16)
            require(number < 1 << QUANTITIES[field], 'quantity-width')
            parts.append(primitive['integer'](number))
        else:
            require(re.fullmatch(r'0x(?:[0-9a-f]{2})*', value) is not None,
                    'data-encoding')
            raw = bytes.fromhex(value[2:])
            require(len(raw) <= 32 if field == 'extraData' else len(raw) == WIDTHS[field],
                    'data-width')
            parts.append(raw)
    encoded = primitive['rlp'](parts)
    require(len(encoded) <= 2048, 'rlp-size')
    return encoded, '0x' + primitive['digest'](encoded).hex()


def synthetic_header(profile, value, maximum=False):
    # Distinct slot patterns expose reordered fixed-width fields. These roots,
    # bloom and other values do not claim a corresponding execution or body.
    header = {
        'parentHash': '0x' + '11' * 32,
        'sha3Uncles': '0x' + '22' * 32,
        'miner': '0x' + '33' * 20,
        'stateRoot': '0x' + '44' * 32,
        'transactionsRoot': '0x' + '55' * 32,
        'receiptsRoot': '0x' + '66' * 32,
        'logsBloom': '0x' + bytes(range(256)).hex(),
        'difficulty': hex(value),
        'number': hex(value),
        'gasLimit': '0x1000000',
        'gasUsed': hex(value),
        'timestamp': hex(value),
        'extraData': '0x' if value % 2 == 0 else '0x' + bytes(range(32)).hex(),
        'mixHash': '0x' + '88' * 32,
        'nonce': '0x' + ('00' * 8 if value == 0 else '0123456789abcdef'),
        'baseFeePerGas': hex(value),
        'withdrawalsRoot': '0x' + '99' * 32,
        'blobGasUsed': hex(value),
        'excessBlobGas': hex(value),
        'parentBeaconBlockRoot': '0x' + 'aa' * 32,
        'requestsHash': '0x' + 'bb' * 32,
    }
    if maximum:
        for field in ('difficulty', 'baseFeePerGas'):
            header[field] = hex((1 << 256) - 1)
        for field in ('blobGasUsed', 'excessBlobGas'):
            header[field] = hex((1 << 64) - 1)
    return {field: header[field] for field in PROFILES[profile]}


def vector(name, profile, header, primitive, source=None):
    encoded, computed = encoded_header(header, profile, primitive)
    require('hash' not in header or header['hash'] == computed, 'retained-hash')
    header = {**header, 'hash': computed}
    return {
        'name': name, 'synthetic': source is None, 'profile': profile,
        'header': header,
        'selection': {'schema': 'caw-execution-header-selection/1',
                      'profile': profile, 'hash': computed},
        'expected': {'hash': computed, 'rlp': '0x' + encoded.hex(),
                     'field_count': len(PROFILES[profile])},
        'source': source,
    }


def chain(name, profile, numbers, primitive, invalid=False):
    require(2 <= len(numbers) <= 129, 'chain-size')
    headers, hashes, rlps = [], [], []
    parent = '0x' + 'dd' * 32
    for index, number in enumerate(numbers):
        header = synthetic_header(profile, index % 2 + 1)
        header.update(parentHash=parent, number=hex(number), timestamp=hex(1000 + index))
        encoded, computed = encoded_header(header, profile, primitive)
        headers.append({**header, 'hash': computed})
        hashes.append(computed)
        rlps.append('0x' + encoded.hex())
        parent = computed
    result = {
        'name': name, 'profile': profile, 'headers': headers,
        'selection': {'schema': 'caw-execution-header-chain-selection/1',
                      'profile': profile, 'startHash': hashes[0], 'endHash': hashes[-1]},
    }
    if invalid:
        result['expected_error'] = 'number-sequence'
    else:
        result['expected'] = {'hashes': hashes, 'rlps': rlps, 'header_count': len(headers)}
    return result


def retained_vector(name, relative, expected_pin, primitive):
    raw, digest = read_source(relative, expected_pin)
    capture = json.loads(raw)
    require(capture['schema'] == 'caw-token-rpc-capture/1', 'retained-schema')
    headers = []
    source = None
    for label in ('block_before', 'block_after'):
        matches = [row for row in capture['calls'] if row['label'] == label]
        require(len(matches) == 1, 'retained-row')
        row = matches[0]
        request, response = row['request'], row['response']
        require(request['method'] == 'eth_getBlockByNumber'
                and request['params'] == [capture['block_number'], False]
                and request['jsonrpc'] == response['jsonrpc'] == '2.0'
                and request['id'] == response['id'] and 'error' not in response,
                'retained-request')
        header = response['result']
        require(header['number'] == capture['block_number']
                and header['hash'] == capture['expected_block_hash'], 'retained-endpoint')
        encoded, computed = encoded_header(header, 'prague-21', primitive)
        require(computed == capture['expected_block_hash'], 'retained-hash')
        headers.append((header, encoded))
        if label == 'block_before':
            source = {'path': relative, 'request_id': request['id'], 'label': label}
    require(headers[0][1] == headers[1][1], 'retained-boundary-change')
    return vector(name, 'prague-21', headers[0][0], primitive, source), digest


def main():
    _, primitive_pin = read_source(PRIMITIVE, PRIMITIVE_SHA256)
    primitive = runpy.run_path(str(ROOT / PRIMITIVE), run_name='caw_header_fixture_primitives')
    # Fixed Keccak and RLP anchors catch accidental primitive selection or SHA3
    # substitution; this does not make the shared primitive independent.
    require(primitive['digest'](b'').hex()
            == 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
            'keccak-anchor')
    require(primitive['rlp'](primitive['integer'](0)) == b'\x80'
            and primitive['rlp'](primitive['integer'](127)) == b'\x7f'
            and primitive['rlp'](primitive['integer'](128)) == b'\x81\x80'
            and primitive['rlp'](b'\x00' * 8) == b'\x88' + b'\x00' * 8,
            'rlp-anchor')
    sources = {PRIMITIVE: primitive_pin}
    own_path = Path(__file__).resolve().relative_to(ROOT).as_posix()
    _, sources[own_path] = read_source(own_path)
    vectors = []
    for profile in PROFILES:
        for value in (0, 1, 127, 128, 255, 256):
            vectors.append(vector(profile + '-quantity-' + str(value), profile,
                                  synthetic_header(profile, value), primitive))
        vectors.append(vector(profile + '-uint256-max', profile,
                              synthetic_header(profile, 1, maximum=True), primitive))
    for name, relative, pin in RETAINED:
        retained, sources[relative] = retained_vector(name, relative, pin, primitive)
        vectors.append(retained)
    result = {
        'schema': 'caw-execution-header-fixtures/1',
        'notice': ('Offline encoding fixtures. Synthetic vectors are not consensus-validity '
                   'claims. Historical RPC headers are rehashed under their supplied endpoint; '
                   'no new provider query, authenticated root, body proof or finality is claimed.'),
        'primitive': {'path': PRIMITIVE, 'sha256': primitive_pin},
        'sources': sources,
        'vectors': vectors,
        'chains': [chain(profile + '-three-headers', profile, [256, 257, 258], primitive)
                   for profile in PROFILES] + [
                       chain('london-16-boundary-129', 'london-16', list(range(256, 385)), primitive)],
        'invalid_chains': [chain('london-16-linked-number-gap', 'london-16',
                                 [256, 258, 259], primitive, invalid=True)],
    }
    encoded = (json.dumps(result, indent=2, ensure_ascii=True) + '\n').encode('utf-8')
    require(len(encoded) <= MAX_OUTPUT, 'output-size')
    output = HERE / 'execution-header-v1.json'
    output.write_bytes(encoded)
    print(json.dumps({'vectors': len(vectors), 'chains': len(result['chains']),
                      'invalid_chains': len(result['invalid_chains']),
                      'fixture_bytes': len(encoded),
                      'fixture_sha256': hashlib.sha256(encoded).hexdigest()}))


if __name__ == '__main__':
    main()
