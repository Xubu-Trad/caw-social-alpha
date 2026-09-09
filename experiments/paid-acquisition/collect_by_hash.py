"""Read a finite paid-action interval by walking parent hashes backwards.

Only the supplied synchronous ``rpc(method, params)`` performs I/O. It returns
decoded results, not JSON-RPC envelopes, and must enforce transport/resource
limits. This collector neither starts a node nor submits transactions. It never
imports a writer, another collector, an accounting reader, or a saved capture.

Separate acquisition code against one supplied node is still shared-node trust.
Hash links, receipt/log agreement and boundary rechecks do not authenticate
header hashes, transaction/receipt tries, consensus, finality or availability.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re


MAX_BLOCKS = 128                 # Blocks after the exclusive start anchor.
MAX_TRANSACTIONS = 128
MAX_LOGS = 1024
MAX_RESPONSE_BYTES = 1024 * 1024
MAX_OUTPUT_BYTES = 8 * 1024 * 1024
CALLER = '0x00000000000000000000000000000000ca180001'
TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452'
HEX = re.compile(r'0x(?:[0-9a-f]{2})*\Z')
HASH = re.compile(r'0x[0-9a-f]{64}\Z')
ADDRESS = re.compile(r'0x[0-9a-f]{40}\Z')
QUANTITY = re.compile(r'0x(?:0|[1-9a-f][0-9a-f]{0,63})\Z')
HEADER_REQUIRED = {'hash', 'parentHash', 'number', 'timestamp', 'transactions', 'gasUsed', 'gasLimit'}
HEADER_OPTIONAL = {'sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot', 'receiptsRoot', 'logsBloom', 'difficulty', 'totalDifficulty', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas', 'withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot', 'requestsHash', 'size', 'uncles', 'withdrawals'}
RECEIPT_REQUIRED = {'status', 'cumulativeGasUsed', 'logs', 'transactionHash', 'transactionIndex', 'blockHash', 'blockNumber', 'gasUsed', 'from', 'to', 'contractAddress'}
RECEIPT_OPTIONAL = {'type', 'logsBloom', 'effectiveGasPrice', 'blobGasPrice', 'blobGasUsed', 'blockTimestamp'}
LOG_REQUIRED = {'address', 'topics', 'data', 'blockHash', 'blockNumber', 'transactionHash', 'transactionIndex', 'logIndex', 'removed'}


class AcquisitionError(RuntimeError):
    """A missing, conflicting, malformed or out-of-scope observation."""


def _need(condition, code):
    if not condition:
        raise AcquisitionError('HASH_ACQUISITION_' + code)


def _bytes(value, limit=65536, exact=None):
    _need(isinstance(value, str) and len(value) <= 2 + limit * 2 and HEX.fullmatch(value), 'HEX')
    raw = bytes.fromhex(value[2:])
    _need(exact is None or len(raw) == exact, 'HEX_LENGTH')
    return raw


def _hash(value):
    _need(isinstance(value, str) and HASH.fullmatch(value), 'HASH')
    return value


def _address(value, nullable=False):
    _need((nullable and value is None) or (isinstance(value, str) and ADDRESS.fullmatch(value)), 'ADDRESS')
    return value


def _quantity(value):
    _need(isinstance(value, str) and QUANTITY.fullmatch(value), 'QUANTITY')
    return int(value, 16)


def _fields(value, required, optional=frozenset()):
    _need(isinstance(value, dict) and required <= value.keys() and value.keys() <= required | optional, 'FIELDS')


def _encoded(value):
    try:
        return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')
    except (TypeError, ValueError, OverflowError):
        raise AcquisitionError('HASH_ACQUISITION_JSON') from None


def _header(value):
    _fields(value, HEADER_REQUIRED, HEADER_OPTIONAL)
    _hash(value['hash']); _hash(value['parentHash'])
    for name in ('number', 'timestamp', 'gasUsed', 'gasLimit'):
        _quantity(value[name])
    _need(_quantity(value['gasUsed']) <= _quantity(value['gasLimit']), 'HEADER_GAS')
    transactions = value['transactions']
    _need(isinstance(transactions, list) and len(transactions) <= MAX_TRANSACTIONS, 'HEADER_TRANSACTIONS')
    for item in transactions:
        _hash(item)
    _need(len(set(transactions)) == len(transactions), 'DUPLICATE_HEADER_TRANSACTION')
    for name in ('sha3Uncles', 'stateRoot', 'transactionsRoot', 'receiptsRoot', 'mixHash', 'withdrawalsRoot', 'parentBeaconBlockRoot', 'requestsHash'):
        if value.get(name) is not None:
            _hash(value[name])
    for name in ('difficulty', 'totalDifficulty', 'baseFeePerGas', 'blobGasUsed', 'excessBlobGas', 'size'):
        if value.get(name) is not None:
            _quantity(value[name])
    if 'miner' in value:
        _address(value['miner'])
    if 'logsBloom' in value:
        _bytes(value['logsBloom'], 256, 256)
    if 'extraData' in value:
        _bytes(value['extraData'], 32768)
    if 'nonce' in value:
        _bytes(value['nonce'], 8, 8)
    if 'uncles' in value:
        _need(isinstance(value['uncles'], list), 'UNCLES')
        for item in value['uncles']:
            _hash(item)
    if 'withdrawals' in value:
        _need(isinstance(value['withdrawals'], list), 'WITHDRAWALS')
    return value


def _log(entry, header, transaction_hashes):
    _fields(entry, LOG_REQUIRED, {'blockTimestamp'})
    _address(entry['address']); _bytes(entry['data'], 4096)
    _need(isinstance(entry['topics'], list) and len(entry['topics']) <= 4, 'TOPICS')
    for topic in entry['topics']:
        _hash(topic)
    _need(entry['blockHash'] == header['hash'] and entry['blockNumber'] == header['number'] and entry['removed'] is False, 'LOG_BLOCK')
    index = _quantity(entry['transactionIndex'])
    _need(index < len(transaction_hashes) and entry['transactionHash'] == transaction_hashes[index], 'LOG_TRANSACTION')
    _quantity(entry['logIndex'])
    if 'blockTimestamp' in entry:
        _need(_quantity(entry['blockTimestamp']) == _quantity(header['timestamp']), 'LOG_TIMESTAMP')
    # blockTimestamp is optional RPC metadata. Each supplied timestamp is checked,
    # while missing optional metadata on one route is not a content conflict.
    return {name: entry[name] for name in sorted(LOG_REQUIRED)}


def _selector(signature):
    # Standalone retained Keccak primitive only; __main__ is never entered and
    # importing via compile avoids bytecode-cache writes during read-only use.
    path = Path(__file__).resolve().parents[2] / 'reference/fixtures/generate-ethereum-proof-fixtures.py'
    namespace = {'__name__': 'caw_hash_acquisition_keccak', '__file__': str(path)}
    exec(compile(path.read_bytes(), str(path), 'exec'), namespace)
    return '0x' + namespace['digest'](signature.encode('ascii'))[:4].hex()


def collect(rpc, config):
    """Return ``{history, manifest, acquisition}`` from fresh RPC observations.

    ``start_block_hash`` is an exclusive history anchor, normally the block
    before registry creation. Included history is start+1 through end. The two
    boundary heights must be explicit integers. Runtime SHA-256 commitments and
    addresses are supplied trust, never extracted from a writer's saved result.
    """
    required = {'chain_id', 'addresses', 'start_block_hash', 'end_block_hash', 'start_block_number', 'end_block_number', 'registry_runtime_sha256', 'probe_runtime_sha256'}
    _fields(config, required)
    _need(callable(rpc) and type(config['chain_id']) is int and config['chain_id'] == 31337, 'CONFIG_CHAIN')
    addresses = config['addresses']
    _fields(addresses, {'registry', 'probe', 'token'})
    for value in addresses.values():
        _address(value)
        _need(value != '0x' + '00' * 20, 'ZERO_ADDRESS')
    _need(len(set(addresses.values())) == 3 and addresses['token'] == TOKEN, 'CONFIG_ADDRESSES')
    start_number, end_number = config['start_block_number'], config['end_block_number']
    _need(type(start_number) is int and type(end_number) is int and 0 <= start_number < end_number < 2 ** 256 and end_number - start_number <= MAX_BLOCKS, 'BLOCK_BOUND')
    start_hash, end_hash = _hash(config['start_block_hash']), _hash(config['end_block_hash'])
    for name in ('registry_runtime_sha256', 'probe_runtime_sha256'):
        _need(isinstance(config[name], str) and re.fullmatch('[0-9a-f]{64}', config[name]), 'RUNTIME_COMMITMENT')
    methods = Counter()
    observations = []

    def request(method, params):
        # Per-call transport limits are additionally enforced by the caller.
        _need(sum(methods.values()) < 800, 'REQUEST_BOUND')
        frozen_params = json.loads(_encoded(params))
        methods[method] += 1
        result = rpc(method, frozen_params)
        _need(result is not None, 'MISSING_' + method)
        raw = _encoded(result)
        _need(len(raw) <= MAX_RESPONSE_BYTES, 'RESPONSE_BOUND')
        observations.append({'method': method, 'params': frozen_params,
                             'result_sha256': hashlib.sha256(raw).hexdigest()})
        return json.loads(raw)

    _need(request('eth_chainId', []) == '0x7a69', 'CHAIN_ID')

    def canonical_boundaries():
        checked = []
        for number, block_hash in ((start_number, start_hash), (end_number, end_hash)):
            header = _header(request('eth_getBlockByNumber', [hex(number), False]))
            _need(header['hash'] == block_hash and _quantity(header['number']) == number, 'CANONICAL_BOUNDARY_CHANGED')
            checked.append(header)
        return checked

    boundary_before = canonical_boundaries()
    descending = []
    seen_blocks = set()
    requested_hash = end_hash
    for number in range(end_number, start_number - 1, -1):
        _need(requested_hash not in seen_blocks, 'DUPLICATE_BLOCK')
        header = _header(request('eth_getBlockByHash', [requested_hash, False]))
        _need(header['hash'] == requested_hash and _quantity(header['number']) == number, 'HASH_BLOCK_IDENTITY')
        if descending:
            _need(_quantity(header['timestamp']) <= _quantity(descending[-1]['timestamp']), 'PARENT_TIMESTAMP')
        descending.append(header)
        seen_blocks.add(requested_hash)
        requested_hash = header['parentHash']
    anchor = descending.pop()
    _need(anchor['hash'] == start_hash, 'ANCHOR_MISMATCH')
    _need(anchor == boundary_before[0] and descending[0] == boundary_before[1], 'BOUNDARY_OBSERVATION_CONFLICT')
    # Query records in the same backward traversal order. Only the final output
    # is reversed into ascending canonical order for the accounting readers.
    blocks = []
    seen_transactions = set(anchor['transactions'])
    transaction_count = log_count = 0
    for header in descending:
        envelopes = []
        receipt_logs = []
        cumulative_gas = 0
        tx_hashes = header['transactions']
        for index, tx_hash in enumerate(tx_hashes):
            _need(tx_hash not in seen_transactions, 'DUPLICATE_TRANSACTION')
            seen_transactions.add(tx_hash)
            transaction_count += 1
            _need(transaction_count <= MAX_TRANSACTIONS, 'TRANSACTION_BOUND')
            tx = request('eth_getTransactionByHash', [tx_hash])
            _need(isinstance(tx, dict) and {'hash', 'blockHash', 'blockNumber', 'transactionIndex', 'from', 'to', 'input', 'gas', 'gasPrice', 'value'} <= tx.keys(), 'TRANSACTION_FIELDS')
            _need(isinstance(tx, dict) and tx.get('hash') == tx_hash and tx.get('blockHash') == header['hash'] and tx.get('blockNumber') == header['number'] and _quantity(tx.get('transactionIndex')) == index, 'TRANSACTION_IDENTITY')
            _address(tx.get('from')); _address(tx.get('to'), nullable=True)
            _bytes(tx.get('input'))
            gas = _quantity(tx.get('gas'))
            _need(0 < gas <= 4000000 and _quantity(tx.get('value')) == 0, 'TRANSACTION_SCOPE')
            price = _quantity(tx.get('gasPrice'))
            normalized = {'from': tx['from'], 'to': tx['to'], 'data': tx['input'],
                          'gas': tx['gas'], 'gasPrice': tx['gasPrice'], 'value': tx['value']}
            receipt = request('eth_getTransactionReceipt', [tx_hash])
            _fields(receipt, RECEIPT_REQUIRED, RECEIPT_OPTIONAL)
            _need(receipt['transactionHash'] == tx_hash and receipt['blockHash'] == header['hash'] and receipt['blockNumber'] == header['number'] and _quantity(receipt['transactionIndex']) == index, 'RECEIPT_IDENTITY')
            _need(receipt['from'] == normalized['from'] and receipt['to'] == normalized['to'], 'RECEIPT_ACTORS')
            _need(receipt['status'] in ('0x0', '0x1'), 'RECEIPT_STATUS')
            gas_used = _quantity(receipt['gasUsed'])
            cumulative_gas += gas_used
            _need(0 < gas_used <= gas and _quantity(receipt['cumulativeGasUsed']) == cumulative_gas, 'RECEIPT_GAS')
            if 'effectiveGasPrice' in receipt:
                _need(_quantity(receipt['effectiveGasPrice']) == price, 'RECEIPT_GAS_PRICE')
            if 'logsBloom' in receipt:
                _bytes(receipt['logsBloom'], 256, 256)
            if 'blockTimestamp' in receipt:
                timestamp = receipt['blockTimestamp']
                _need((type(timestamp) is int and timestamp >= 0 and timestamp == _quantity(header['timestamp'])) or (isinstance(timestamp, str) and _quantity(timestamp) == _quantity(header['timestamp'])), 'RECEIPT_TIMESTAMP')
            for field in ('type', 'blobGasUsed', 'blobGasPrice'):
                if receipt.get(field) is not None:
                    _quantity(receipt[field])
            _address(receipt['contractAddress'], nullable=True)
            _need(normalized['to'] is None or receipt['contractAddress'] is None, 'NONCREATION_ADDRESS')
            _need(normalized['to'] is not None or receipt['status'] != '0x1' or receipt['contractAddress'] is not None, 'MISSING_CREATION_ADDRESS')
            _need(isinstance(receipt['logs'], list) and len(receipt['logs']) <= MAX_LOGS and (receipt['status'] == '0x1' or not receipt['logs']), 'RECEIPT_LOGS')
            for entry in receipt['logs']:
                projected = _log(entry, header, tx_hashes)
                _need(entry['transactionHash'] == tx_hash and _quantity(entry['transactionIndex']) == index and _quantity(entry['logIndex']) == len(receipt_logs), 'RECEIPT_LOG_ORDER')
                receipt_logs.append(projected)
                log_count += 1
                _need(log_count <= MAX_LOGS, 'LOG_BOUND')
            envelopes.append({'transaction': normalized, 'receipt': receipt})
        _need(cumulative_gas == _quantity(header['gasUsed']), 'BLOCK_GAS')
        # No address or topic filter: omitted unrelated events must not create
        # a deceptively complete shorter history. Readers decide event scope.
        independent_logs = request('eth_getLogs', [{'blockHash': header['hash']}])
        _need(isinstance(independent_logs, list) and len(independent_logs) <= MAX_LOGS, 'RANGE_LOGS')
        by_index = {}
        for entry in independent_logs:
            projected = _log(entry, header, tx_hashes)
            log_index = _quantity(entry['logIndex'])
            _need(log_index not in by_index, 'DUPLICATE_RANGE_LOG')
            by_index[log_index] = projected
        _need(sorted(by_index) == list(range(len(receipt_logs))) and [by_index[n] for n in sorted(by_index)] == receipt_logs, 'RECEIPT_RANGE_LOG_CONFLICT')
        blocks.append({'header': header, 'transactions': envelopes})
    blocks.reverse()
    _need(len(blocks) == end_number - start_number and blocks[-1]['header']['hash'] == end_hash, 'INTERVAL_COMPLETENESS')
    end_tag = hex(end_number)
    runtime = {}
    for name in ('registry', 'probe'):
        observed = request('eth_getCode', [addresses[name], end_tag])
        raw = _bytes(observed)
        _need(raw and hashlib.sha256(raw).hexdigest() == config[name + '_runtime_sha256'], 'RUNTIME_MISMATCH')
        runtime[name] = observed

    selectors = {}

    def getter(target, signature, arguments=(), words=1):
        if signature not in selectors:
            selectors[signature] = _selector(signature)
        data = selectors[signature] + ''.join(int(value).to_bytes(32, 'big').hex() for value in arguments)
        result = request('eth_call', [{'from': CALLER, 'to': target, 'data': data,
                                      'gas': '0x3d0900', 'gasPrice': '0x174876e800',
                                      'value': '0x0'}, end_tag])
        raw = _bytes(result, words * 32, words * 32)
        return [int.from_bytes(raw[n:n+32], 'big') for n in range(0, len(raw), 32)]

    final = {'owners': [], 'epochs': [], 'credits': [], 'stakes': [], 'nonces': []}
    for account in (1, 2, 3):
        owner, epoch = getter(addresses['registry'], 'authority(uint256)', (account,), 2)
        _need(0 < owner < 2 ** 160, 'ENDPOINT_OWNER')
        final['owners'].append('0x' + owner.to_bytes(20, 'big').hex())
        final['epochs'].append(str(epoch))
        for name in ('credits', 'stakes', 'nonces'):
            final[name].append(str(getter(addresses['probe'], name + '(uint256)', (account,))[0]))
    for name in ('totalCredits', 'poolDust', 'messageCount'):
        final[name] = str(getter(addresses['probe'], name + '()')[0])
    final['tokenBalance'] = str(getter(addresses['token'], 'balanceOf(address)', (int(addresses['probe'], 16),))[0])
    boundary_after = canonical_boundaries()
    _need(boundary_after == boundary_before, 'BOUNDARY_CHANGED_DURING_ACQUISITION')
    manifest = {name: config[name] for name in ('chain_id', 'addresses', 'registry_runtime_sha256', 'probe_runtime_sha256', 'start_block_hash', 'end_block_hash')}
    manifest['addresses'] = dict(addresses)
    history = {'schema': 'caw-paid-history/1', 'chain_id': config['chain_id'],
               'addresses': dict(addresses), 'registry_runtime': runtime['registry'],
               'probe_runtime': runtime['probe'], 'start_block': anchor,
               'end_block': blocks[-1]['header'], 'blocks': blocks, 'final': final}
    acquisition = {'schema': 'caw-paid-acquisition/1', 'strategy': 'backward-parent-hash',
                   'included_blocks': len(blocks), 'anchor_headers': 1,
                   'transactions': transaction_count, 'logs': log_count,
                   'rpc_calls': sum(methods.values()), 'method_counts': dict(methods),
                   'endpoint_getter_block': end_tag, 'canonical_boundaries_rechecked': True,
                   'unfiltered_logs_cross_checked': True, 'observations': observations,
                   'used_writer_or_saved_capture': False, 'independent_provider_established': False,
                   'authenticates_chain': False, 'trust': 'Supplied RPC and runtime/endpoint commitments. A different collection strategy against the same node remains shared-node trust; no consensus, trie, finality, freshness-after-return or permanent-availability proof.'}
    result = {'history': history, 'manifest': manifest, 'acquisition': acquisition}
    _need(len(_encoded(result)) <= MAX_OUTPUT_BYTES, 'OUTPUT_BOUND')
    return result
