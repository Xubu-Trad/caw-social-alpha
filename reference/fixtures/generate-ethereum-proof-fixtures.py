"""Original, deterministic synthetic fixtures; no network or account data.

Run with Python 3.11+ from any directory. Writes only the adjacent fixture.
This construction oracle does not import the JavaScript verifier. Keccak uses
generated round constants and a 2D state; SHA3 mode is checked against hashlib.
Spec references: https://keccak.team/keccak_specs_summary.html and
https://ethereum.org/developers/docs/data-structures-and-encoding/patricia-merkle-trie/
"""
from pathlib import Path
import hashlib
import json

MASK = (1 << 64) - 1
ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
       [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]


def digest(message, suffix=1):
    assert isinstance(message, bytes) and len(message) <= 65536
    data = bytearray(message)
    data.append(suffix)
    data.extend(b'\0' * ((-len(data)) % 136))
    data[-1] |= 128
    a = [[0] * 5 for _ in range(5)]
    rotate = lambda x, n: ((x << n) | (x >> (64 - n))) & MASK
    for start in range(0, len(data), 136):
        for lane in range(17):
            a[lane % 5][lane // 5] ^= int.from_bytes(data[start + lane * 8:start + lane * 8 + 8], 'little')
        lfsr = 1
        for _ in range(24):
            c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
            d = [c[(x - 1) % 5] ^ rotate(c[(x + 1) % 5], 1) for x in range(5)]
            b = [[0] * 5 for _ in range(5)]
            for x in range(5):
                for y in range(5):
                    b[y][(2 * x + 3 * y) % 5] = rotate(a[x][y] ^ d[x], ROT[x][y])
            for x in range(5):
                for y in range(5):
                    a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y])
            for bit in range(7):
                if lfsr & 1:
                    a[0][0] ^= 1 << ((1 << bit) - 1)
                lfsr = ((lfsr << 1) ^ (0x71 if lfsr & 128 else 0)) & 255
    return b''.join(a[i % 5][i // 5].to_bytes(8, 'little') for i in range(4))


def integer(n):
    return n.to_bytes((n.bit_length() + 7) // 8, 'big')


def rlp(value):
    if isinstance(value, list):
        payload = b''.join(rlp(v) for v in value)
        base = 192
    else:
        payload = value
        base = 128
        if len(payload) == 1 and payload[0] < 128:
            return payload
    if len(payload) < 56:
        return bytes([base + len(payload)]) + payload
    size = integer(len(payload))
    return bytes([base + 55 + len(size)]) + size + payload


def hp(path, leaf):
    flag = (2 if leaf else 0) + len(path) % 2
    nibbles = ([flag] if len(path) % 2 else [flag, 0]) + path
    return bytes(nibbles[n] * 16 + nibbles[n + 1] for n in range(0, len(nibbles), 2))


def nibbles(key):
    return [v for byte in key for v in [byte >> 4, byte & 15]]


def link(node):
    return node if len(rlp(node)) < 32 else digest(rlp(node))


class Trie:
    def __init__(self, pairs):
        self.db = {}
        def build(rows):
            if not rows:
                return b''
            if len(rows) == 1:
                node = [hp(rows[0][0], True), rows[0][1]]
            else:
                common = 0
                while all(len(p) > common and p[common] == rows[0][0][common] for p, _ in rows):
                    common += 1
                if common:
                    child = build([(p[common:], v) for p, v in rows])
                    node = [hp(rows[0][0][:common], False), link(child)]
                else:
                    node = [b''] * 17
                    for p, v in rows:
                        if not p:
                            node[16] = v
                    for branch in range(16):
                        group = [(p[1:], v) for p, v in rows if p and p[0] == branch]
                        if group:
                            node[branch] = link(build(group))
            self.db[digest(rlp(node))] = node
            return node
        self.root_node = build(sorted((nibbles(k), v) for k, v in pairs))
        self.root = digest(rlp(self.root_node))

    def proof(self, key):
        if self.root_node == b'':
            return []
        node, path, out = self.root_node, nibbles(key), [rlp(self.root_node)]
        while True:
            if len(node) == 17:
                if not path:
                    break
                child, path = node[path[0]], path[1:]
            else:
                encoded = nibbles(node[0])
                part = encoded[1:] if encoded[0] & 1 else encoded[2:]
                if path[:len(part)] != part or encoded[0] & 2:
                    break
                path, child = path[len(part):], node[1]
            if child == b'':
                break
            if isinstance(child, bytes):
                node = self.db[child]
                out.append(rlp(node))
            else:
                node = child
        return ['0x' + b.hex() for b in out]


def main():
    assert digest(b'').hex() == 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    assert digest(b'abc').hex() == '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    lengths = [0, 1, 31, 32, 55, 56, 135, 136, 137, 271, 272, 1024]
    inputs = [bytes(i % 251 for i in range(n)) for n in lengths] + [b'abc']
    for message in inputs:
        assert digest(message, 6) == hashlib.sha3_256(message).digest()
    hx = lambda b: '0x' + b.hex()
    empty_root, empty_code = digest(rlp(b'')), digest(b'')
    trie_cases = []
    def case(name, pairs, key):
        tree = Trie(pairs)
        value = dict(pairs).get(key)
        trie_cases.append({'name': name, 'root': hx(tree.root), 'key': hx(key), 'proof': tree.proof(key),
                           'expected': {'exists': value is not None, 'value': hx(value) if value is not None else None}})
    case('empty', [], b'\0')
    case('short-root-leaf', [(b'\x12', b'a')], b'\x12')
    case('leaf-divergence', [(b'\x12', b'a')], b'\x13')
    for length in [55, 56]:
        case('rlp-value-' + str(length), [(b'\x12', b'v' * length)], b'\x12')
    for length in [28, 29, 30]:
        pairs = [(b'\x10', b'v' * length), (b'\x11', b'z')]
        case('child-rlp-' + str(length + 3), pairs, b'\x10')
    pairs = [(b'do', b'verb'), (b'dog', b'puppy'), (b'doge', b'coin'), (b'horse', b'stallion')]
    for key in [b'do', b'dog', b'doge', b'horse', b'cat', b'dot', b'd']:
        case('words-' + key.decode(), pairs, key)
    case('empty-key-branch-value', [(b'', b'value'), (b'\x10', b'other')], b'')
    slots = [i.to_bytes(32, 'big') for i in range(4)]
    values = [1, 128, (1 << 256) - 1]
    storage = Trie([(digest(k), rlp(integer(v))) for k, v in zip(slots, values)])
    addresses = [(i + 1).to_bytes(20, 'big') for i in range(32)]
    first = addresses[0]
    other = next(a for a in addresses[1:] if digest(a)[0] >> 4 == digest(first)[0] >> 4)
    account_values = {first: [integer(1), integer(1024), storage.root, empty_code],
                      other: [b'', b'', empty_root, empty_code]}
    state = Trie([(digest(a), rlp(v)) for a, v in account_values.items()])
    state_cases = []
    def statecase(name, tree, address, keys, fields=None, zero_defaults=False):
        stored = account_values.get(address) if tree is state else None
        exists = stored is not None
        data = fields or stored or [b'', b'', empty_root, empty_code]
        response = {'address': hx(address), 'balance': hex(int.from_bytes(data[1], 'big')),
                    'codeHash': hx(data[3]), 'nonce': hex(int.from_bytes(data[0], 'big')),
                    'storageHash': hx(data[2]), 'accountProof': tree.proof(digest(address)), 'storageProof': []}
        if zero_defaults:
            response['storageHash'] = response['codeHash'] = '0x' + '00' * 32
        expected_storage = []
        for index, slot in enumerate(keys):
            value = values[slots.index(slot)] if exists and address == first and slot in slots[:3] else 0
            witnesses = storage.proof(digest(slot)) if exists and address == first else []
            response['storageProof'].append({'key': hx(slot) if index % 2 else hex(int.from_bytes(slot, 'big')), 'value': hex(value), 'proof': witnesses})
            expected_storage.append({'key': hx(slot), 'value': hex(value), 'exists': value != 0})
        state_cases.append({'name': name, 'trusted': {'stateRoot': hx(tree.root), 'address': hx(address), 'storageKeys': [hx(k) for k in keys]},
                            'proof': response, 'expected': {'accountExists': exists, 'nonce': response['nonce'], 'balance': response['balance'],
                            'codeHash': response['codeHash'] if exists else None, 'storageHash': response['storageHash'] if exists else None,
                            'storage': expected_storage}})
    statecase('account-and-three-slots-plus-absence', state, first, slots)
    statecase('account-without-slots', state, first, [])
    statecase('present-empty-storage', state, other, slots[:1])
    missing = b'\xff' * 20
    statecase('absent-account-empty-hash-defaults', state, missing, slots[:1])
    statecase('absent-account-zero-hash-defaults', state, missing, slots[:1], zero_defaults=True)
    statecase('empty-state', Trie([]), missing, slots[:1], zero_defaults=True)
    invalid_trie_cases = []
    def invalid(name, raw, key=b'\x10', extra=()):
        invalid_trie_cases.append({'name': name, 'root': hx(digest(raw)), 'key': hx(key), 'proof': [hx(raw)] + [hx(e) for e in extra]})
    invalid('nonminimal-single-byte', b'\xc5\x82\x20\x10\x81\x61')
    invalid('long-list-below56', b'\xf8\x02\x20\x61')
    invalid('leading-zero-list-length', b'\xf9\x00\x02\x20\x61')
    invalid('long-string-below56', b'\xc4\xb8\x01\x20\x61')
    invalid('truncated-list', b'\xc3\x20\x61')
    invalid('trailing-item', rlp([hp([1, 0], True), b'a']) + b'\x80')
    invalid('bad-hp-flag', rlp([b'\x60\x10', b'a']))
    invalid('bad-even-hp-padding', rlp([b'\x21', b'a']))
    invalid('empty-extension-path', rlp([b'\x00', [hp([1, 0], True), b'a']]))
    invalid('empty-leaf-value', rlp([hp([1, 0], True), b'']))
    invalid('31byte-string-child', rlp([hp([1], False), b'a' * 31]))
    invalid('32byte-inline-child', rlp([hp([1], False), [hp([0], True), b'v' * 29]]))
    short = rlp([hp([0], True), b'v'])
    invalid('short-child-hashed', rlp([hp([1], False), digest(short)]), extra=[short])
    invalid_state_cases = []
    def invalid_state(name, account, storage_nodes=None, storage_value='0x0'):
        tree = Trie([(digest(first), rlp(account))])
        response = {'address': hx(first), 'balance': '0x0', 'codeHash': hx(empty_code), 'nonce': '0x0',
                    'storageHash': hx(account[2]), 'accountProof': tree.proof(digest(first)), 'storageProof': []}
        keys = []
        if storage_nodes is not None:
            keys = [hx(slots[0])]
            response['storageProof'] = [{'key': '0x0', 'value': storage_value, 'proof': storage_nodes}]
        invalid_state_cases.append({'name': name, 'trusted': {'stateRoot': hx(tree.root), 'address': hx(first), 'storageKeys': keys}, 'proof': response})
    invalid_state('leading-zero-account-nonce', [b'\0', b'', empty_root, empty_code])
    invalid_state('leading-zero-account-balance', [b'', b'\0', empty_root, empty_code])
    invalid_state('short-account-codehash', [b'', b'', empty_root, empty_code[:-1]])
    for name, raw in [('nonminimal-storage-zero', b'\x00'), ('included-storage-zero', b'\x80'), ('storage-list-instead-of-integer', b'\xc0')]:
        tree = Trie([(digest(slots[0]), raw)])
        invalid_state(name, [b'', b'', tree.root, empty_code], tree.proof(digest(slots[0])))
    result = {'format': 'caw-ethereum-proof-fixtures-v1', 'synthetic': True,
              'notice': 'Constructed test tries, not observations of a deployed CAW contract or a live chain.',
              'oracle': 'Original Python Keccak/RLP/trie construction, separate from the JavaScript verifier. SHA3 padding variant cross-checked with Python hashlib for all 13 hash inputs. Ethereum empty/abc fixed Keccak vectors also checked.',
              'hash_vectors': [{'input': hx(m), 'expected': hx(digest(m))} for m in inputs],
              'trie_cases': trie_cases, 'state_cases': state_cases,
              'invalid_trie_cases': invalid_trie_cases, 'invalid_state_cases': invalid_state_cases}
    output = Path(__file__).with_name('ethereum-state-proof-v1.json')
    output.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'hash_vectors': len(inputs), 'trie_cases': len(trie_cases), 'state_cases': len(state_cases), 'fixture_sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
