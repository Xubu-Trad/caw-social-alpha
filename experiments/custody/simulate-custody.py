"""Fixed read-only CAW custody simulation; stdlib only, no wallet or chain writes.

Explicit invocation only. A provider executes an ephemeral sequence with
validation=False; signatures, ownership, consensus and persistent custody are
not established. No state/block/nonce overrides or native-value fields are sent.
The main thread aborts the complete capture after any 30-second request deadline.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import queue
import re
import sys
import threading
import time
import urllib.error
import urllib.request


TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452'
BLOCK = '0x18bc1ea'
BLOCK_HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d'
STATE_ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152'
TOKEN_CODE_HASH = '0x6ee560d3e6b1f881a8711e0be0b30a0e8e0cf8b915ce8f75ea05002126c94256'
DEPLOYER = '0x' + '00' * 16 + 'ca170001'
CALLER_A = '0x' + '00' * 19 + '01'
CALLER_B = '0x' + '00' * 19 + '02'
MAX_UINT = (1 << 256) - 1
SOURCE_SHA256 = 'a9015124d51c80d16cdedce9d97e456bc902d39d23a29d6e0528053340f4c0ee'
ORACLE_SHA256 = '5f100b6e1a12d29b0004bcb29f2ba5b23ffefc076646d2b67b1fb8df81c2effa'
BUILD_SHA256 = 'c939cea1d6bb8e75a3dc1f4809bb3b7fdd7358ed2c244f67e480148690e6d06a'
COMPILER_INPUT_SHA256 = '03e08988181215b3005577146fe0372e3c6f5705a47459de7ad3b93b84883886'
PROVIDERS = {'publicnode': 'https://ethereum-rpc.publicnode.com',
             'drpc': 'https://eth.drpc.org'}
READ_METHODS = frozenset({'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode',
                          'eth_getTransactionCount', 'eth_call', 'eth_simulateV1'})
MAX_RESPONSE = 1024 * 1024
MAX_REQUEST = 128 * 1024
MAX_CALLS = 100
MAX_RPC_REQUESTS = 40
MAX_SIMULATED_GAS = 20_000_000
REQUEST_SECONDS = 30
CAPTURE_SECONDS = 300


class CaptureError(Exception):
    """Only fixed, non-sensitive reason labels are used with this exception."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise CaptureError('REDIRECT_REFUSED')


def require(condition, label):
    if not condition:
        raise CaptureError(label)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hash_argument(value):
    require(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value) is not None,
            'EXPECTED_HASH_FORMAT')
    return value


def exact_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'DUPLICATE_JSON_KEY')
        result[key] = value
    return result


def read_bounded(path, maximum):
    with path.open('rb') as handle:
        result = handle.read(maximum + 1)
    require(len(result) <= maximum, 'LOCAL_INPUT_LIMIT')
    return result


def code_hex(value, maximum):
    require(isinstance(value, str), 'BYTECODE_FORMAT')
    if value.startswith('0x'):
        value = value[2:]
    require(0 < len(value) <= maximum * 2 and len(value) % 2 == 0 and
            re.fullmatch('[0-9a-f]+', value) is not None, 'BYTECODE_FORMAT')
    return '0x' + value


def word(value):
    if isinstance(value, str):
        require(re.fullmatch('0x[0-9a-f]{40}', value) is not None, 'ADDRESS_FORMAT')
        value = int(value, 16)
    require(type(value) is int and 0 <= value <= MAX_UINT, 'ABI_WORD_RANGE')
    return f'{value:064x}'


def abi_uint(data):
    require(isinstance(data, str) and re.fullmatch('0x[0-9a-f]{64}', data) is not None,
            'ABI_UINT_FORMAT')
    return int(data, 16)


def load_inputs(expected_build, expected_script):
    for address in (TOKEN, DEPLOYER, CALLER_A, CALLER_B):
        require(re.fullmatch('0x[0-9a-f]{40}', address) is not None, 'FIXED_ADDRESS_FORMAT')
    here = Path(__file__).resolve().parent
    script = read_bounded(Path(__file__).resolve(), 128 * 1024)
    source = read_bounded(here / 'CawCustodyProbe.sol', 32 * 1024)
    build_bytes = read_bounded(here / 'probe-build.json', 256 * 1024)
    oracle_path = here.parent.parent / 'reference' / 'fixtures' / 'generate-ethereum-proof-fixtures.py'
    oracle_bytes = read_bounded(oracle_path, 64 * 1024)
    require(sha(script) == hash_argument(expected_script), 'SCRIPT_HASH_MISMATCH')
    require(sha(source) == SOURCE_SHA256, 'SOURCE_HASH_MISMATCH')
    require(sha(build_bytes) == hash_argument(expected_build) == BUILD_SHA256, 'BUILD_HASH_MISMATCH')
    require(sha(oracle_bytes) == ORACLE_SHA256, 'ORACLE_HASH_MISMATCH')
    # Compile the captured, checked bytes once under a non-main module name.
    # No path re-read, pycache write or fixture-generator main() occurs.
    spec = importlib.util.spec_from_loader('caw_pinned_keccak_rlp', loader=None)
    oracle = importlib.util.module_from_spec(spec)
    exec(compile(oracle_bytes, '<pinned-caw-keccak-rlp>', 'exec'), oracle.__dict__)
    build = json.loads(build_bytes.decode('utf-8'), object_pairs_hook=exact_object)
    require(type(build) is dict and set(build) == {'schema', 'compiler', 'compiler_input_sha256',
            'source_sha256', 'abi', 'bytecode', 'runtime', 'methodIdentifiers'},
            'BUILD_SCHEMA')
    require(build['schema'] == 'caw-custody-probe-build/1' and build['compiler'] == '0.8.10+commit.fc410830' and
            build['source_sha256'] == SOURCE_SHA256 and build['compiler_input_sha256'] == COMPILER_INPUT_SHA256,
            'BUILD_METADATA')
    require(type(build['abi']) is list and type(build['methodIdentifiers']) is dict, 'BUILD_SCHEMA')
    bytecode = code_hex(build['bytecode'], 24 * 1024)
    runtime = code_hex(build['runtime'], 16 * 1024)
    methods = build['methodIdentifiers']
    signatures = ('TOKEN()', 'credits(address)', 'deposit(uint256)', 'totalCredits()', 'withdraw(uint256)')
    require(set(methods) == set(signatures), 'PROBE_METHOD_SET')
    for signature in signatures:
        require(methods[signature] == oracle.digest(signature.encode('ascii')).hex()[:8],
                'PROBE_METHOD_SELECTOR')
    probe = '0x' + oracle.digest(oracle.rlp([bytes.fromhex(DEPLOYER[2:]), oracle.integer(0)]))[-20:].hex()
    return {'bytecode': bytecode, 'runtime': runtime, 'methods': methods, 'probe': probe,
            'oracle': oracle, 'hashes': {'script_sha256': sha(script), 'source_sha256': sha(source),
            'build_sha256': sha(build_bytes), 'oracle_sha256': sha(oracle_bytes),
            'probe_runtime_keccak256': '0x' + oracle.digest(bytes.fromhex(runtime[2:])).hex()}}


def perform_request(url, body, seconds):
    completed = queue.Queue(maxsize=1)

    def worker():
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
            request = urllib.request.Request(url, data=body,
                headers={'Content-Type': 'application/json', 'User-Agent': 'CAW-custody-review/1'})
            try:
                response = opener.open(request, timeout=min(10, seconds))
            except urllib.error.HTTPError as error:
                response = error
            with response:
                raw = response.read(MAX_RESPONSE + 1)
                status = response.status
            require(len(raw) <= MAX_RESPONSE, 'RESPONSE_SIZE_LIMIT')
            completed.put_nowait(('response', status, raw))
        except Exception as error:
            # Do not retain exception text, proxy names, paths or HTTP headers.
            completed.put_nowait(('failure', type(error).__name__, None))

    thread = threading.Thread(target=worker, daemon=True, name='caw-readonly-rpc')
    thread.start()
    try:
        result = completed.get(timeout=seconds)
    except queue.Empty:
        # Caller stops the entire capture and exits; it never starts another
        # request while this daemon worker could remain blocked in network I/O.
        raise CaptureError('REQUEST_DEADLINE') from None
    return result


class Recorder:
    def __init__(self, provider, handle, inputs):
        self.url = PROVIDERS[provider]
        self.handle = handle
        self.started = time.monotonic()
        self.data = {'schema': 'caw-custody-simulation/1', 'provider': self.url,
            'captured_at_utc': datetime.now(timezone.utc).isoformat(), 'token': TOKEN,
            'block_number': BLOCK, 'expected_block_hash': BLOCK_HASH, 'expected_state_root': STATE_ROOT,
            'deployer': DEPLOYER, 'caller_a': CALLER_A, 'caller_b': CALLER_B,
            'predicted_probe': inputs['probe'], 'inputs': inputs['hashes'],
            'transaction_sent': False, 'state_overrides_used': False, 'block_overrides_used': False,
            'nonce_overrides_used': False, 'wallet_or_signature_used': False,
            'validation': False, 'native_value_fields_used': False,
            'limits': {'request_seconds': REQUEST_SECONDS, 'capture_seconds': CAPTURE_SECONDS,
                'response_bytes': MAX_RESPONSE, 'request_bytes': MAX_REQUEST,
                'simulation_calls': MAX_CALLS, 'simulation_gas': MAX_SIMULATED_GAS,
                'rpc_requests': MAX_RPC_REQUESTS}, 'calls': [], 'complete': False}
        self.save()

    def save(self):
        self.handle.seek(0)
        self.handle.write(json.dumps(self.data, indent=2, ensure_ascii=True) + '\n')
        self.handle.truncate()
        self.handle.flush()

    def rpc(self, label, method, params):
        require(method in READ_METHODS, 'NON_READ_METHOD')
        require(len(self.data['calls']) < MAX_RPC_REQUESTS, 'RPC_COUNT_LIMIT')
        remaining = CAPTURE_SECONDS - (time.monotonic() - self.started)
        require(remaining > 0, 'CAPTURE_DEADLINE')
        identifier = len(self.data['calls']) + 1
        request = {'jsonrpc': '2.0', 'id': identifier, 'method': method, 'params': params}
        body = json.dumps(request, separators=(',', ':'), ensure_ascii=True).encode('ascii')
        require(len(body) <= MAX_REQUEST, 'REQUEST_SIZE_LIMIT')
        entry = {'label': label, 'request': request}
        self.data['calls'].append(entry)
        self.save()
        try:
            kind, status, raw = perform_request(self.url, body, min(REQUEST_SECONDS, remaining))
            if kind != 'response':
                entry['transport_failure'] = status
                raise CaptureError('TRANSPORT_FAILURE')
            entry['http_status'] = status
            response = json.loads(raw.decode('utf-8'), object_pairs_hook=exact_object)
            require(type(response) is dict and response.get('jsonrpc') == '2.0' and
                    type(response.get('id')) is int and response['id'] == identifier,
                    'RPC_ENVELOPE')
            require(('result' in response) != ('error' in response), 'RPC_ENVELOPE')
            entry['response'] = response
            require(status == 200 and 'error' not in response, 'RPC_REJECTED')
            return response['result']
        except CaptureError as error:
            entry['capture_failure'] = str(error)
            raise
        except Exception as error:
            entry['capture_failure'] = type(error).__name__
            raise CaptureError('RPC_DECODE_FAILURE') from None
        finally:
            self.save()


def token_call(selector, *args):
    return selector + ''.join(word(value) for value in args)


def read_token(recorder, label, calldata):
    return abi_uint(recorder.rpc(label, 'eth_call', [
        {'from': CALLER_A, 'to': TOKEN, 'gas': '0x30d40', 'data': calldata}, BLOCK]))


def persistent_state(recorder, prefix, probe):
    queries = {'balance_a': token_call('0x70a08231', CALLER_A),
        'balance_b': token_call('0x70a08231', CALLER_B),
        'balance_probe': token_call('0x70a08231', probe), 'total_supply': '0x18160ddd',
        'allowance_probe': token_call('0xdd62ed3e', CALLER_A, probe),
        'allowance_b': token_call('0xdd62ed3e', CALLER_A, CALLER_B)}
    return {name: read_token(recorder, prefix + '.' + name, data) for name, data in queries.items()}


def check_block(value):
    require(type(value) is dict and value.get('number') == BLOCK and value.get('hash') == BLOCK_HASH and
            value.get('stateRoot') == STATE_ROOT, 'PINNED_BLOCK_MISMATCH')


def make_sequence(inputs, initial):
    probe, methods, oracle = inputs['probe'], inputs['methods'], inputs['oracle']
    rows = []

    def add(label, to, data, expected, caller=CALLER_A, gas=200_000):
        request = {'from': caller, 'gas': hex(gas), 'data': data}
        if to is not None:
            request['to'] = to
        rows.append({'label': label, 'call': request, 'expected': expected})

    def probe_call(signature, value=None):
        return '0x' + methods[signature] + ('' if value is None else word(value))

    def success(data='0x'):
        return {'status': '0x1', 'returnData': data}

    def custom_error(signature):
        return {'status': '0x0', 'returnData': '0x' + oracle.digest(signature.encode('ascii')).hex()[:8]}

    def reason_error(reason):
        raw = reason.encode('ascii')
        payload = raw.hex().ljust(((len(raw) + 31) // 32) * 64, '0')
        return {'status': '0x0', 'returnData': '0x08c379a0' + word(32) + word(len(raw)) + payload}

    def snapshot(label, spent, held, allowance, credit):
        expected_values = (initial['balance_a'] - spent, held, initial['total_supply'], allowance, credit, credit)
        calls = ((TOKEN, token_call('0x70a08231', CALLER_A)),
            (TOKEN, token_call('0x70a08231', probe)), (TOKEN, '0x18160ddd'),
            (TOKEN, token_call('0xdd62ed3e', CALLER_A, probe)),
            (probe, probe_call('credits(address)', CALLER_A)), (probe, probe_call('totalCredits()')))
        names = ('balance_a', 'balance_probe', 'total_supply', 'allowance_probe', 'credits_a', 'total_credits')
        for name, (target, data), value in zip(names, calls, expected_values):
            add(label + '.' + name, target, data, success('0x' + word(value)), gas=100_000)

    add('create_probe', None, inputs['bytecode'], success(inputs['runtime']), DEPLOYER, 1_000_000)
    snapshot('initial', 0, 0, initial['allowance_probe'], 0)
    add('approve_13', TOKEN, token_call('0x095ea7b3', probe, 13), success('0x' + word(1)))
    snapshot('after_approve', 0, 0, 13, 0)
    add('deposit_1', probe, probe_call('deposit(uint256)', 1), success())
    snapshot('after_deposit_1', 1, 1, 12, 1)
    add('deposit_7', probe, probe_call('deposit(uint256)', 7), success())
    snapshot('after_deposit_7', 8, 8, 5, 8)
    add('foreign_withdraw_1', probe, probe_call('withdraw(uint256)', 1), custom_error('InsufficientCredit()'), CALLER_B)
    add('deployer_withdraw_1', probe, probe_call('withdraw(uint256)', 1), custom_error('InsufficientCredit()'), DEPLOYER)
    add('deposit_zero', probe, probe_call('deposit(uint256)', 0), custom_error('ZeroAmount()'))
    add('withdraw_zero', probe, probe_call('withdraw(uint256)', 0), custom_error('ZeroAmount()'))
    add('withdraw_over_credit_9', probe, probe_call('withdraw(uint256)', 9), custom_error('InsufficientCredit()'))
    add('deposit_over_allowance_6', probe, probe_call('deposit(uint256)', 6),
        reason_error('ERC20: transfer amount exceeds allowance'))
    snapshot('after_rejections', 8, 8, 5, 8)
    add('withdraw_3', probe, probe_call('withdraw(uint256)', 3), success())
    snapshot('after_withdraw_3', 5, 5, 5, 5)
    add('withdraw_5', probe, probe_call('withdraw(uint256)', 5), success())
    snapshot('after_withdraw_5', 0, 0, 5, 0)
    add('donate_2', TOKEN, token_call('0xa9059cbb', probe, 2), success('0x' + word(1)))
    snapshot('after_donation', 2, 2, 5, 0)
    add('withdraw_surplus_1', probe, probe_call('withdraw(uint256)', 1), custom_error('InsufficientCredit()'))
    snapshot('after_surplus_rejection', 2, 2, 5, 0)
    add('maximum.initial_balance_b', TOKEN, token_call('0x70a08231', CALLER_B),
        success('0x' + word(initial['balance_b'])), gas=100_000)
    add('maximum.approve', TOKEN, token_call('0x095ea7b3', CALLER_B, MAX_UINT), success('0x' + word(1)))
    add('maximum.allowance_before_spend', TOKEN, token_call('0xdd62ed3e', CALLER_A, CALLER_B),
        success('0x' + word(MAX_UINT)), gas=100_000)
    add('maximum.transfer_from_1', TOKEN, token_call('0x23b872dd', CALLER_A, CALLER_B, 1),
        success('0x' + word(1)), CALLER_B)
    add('maximum.allowance_after_spend', TOKEN, token_call('0xdd62ed3e', CALLER_A, CALLER_B),
        success('0x' + word(MAX_UINT - 1)), gas=100_000)
    add('maximum.final_balance_b', TOKEN, token_call('0x70a08231', CALLER_B),
        success('0x' + word(initial['balance_b'] + 1)), gas=100_000)
    snapshot('after_maximum_allowance', 3, 2, 5, 0)
    require(len(rows) <= MAX_CALLS, 'SIMULATION_COUNT_LIMIT')
    require(sum(int(row['call']['gas'], 16) for row in rows) <= MAX_SIMULATED_GAS, 'SIMULATION_GAS_LIMIT')
    for index, row in enumerate(rows):
        require(set(row['call']) == ({'from', 'gas', 'data'} if index == 0 else {'from', 'to', 'gas', 'data'}),
                'SIMULATION_CALL_SHAPE')
        require(int(row['call']['gas'], 16) <= (1_000_000 if index == 0 else 200_000), 'CALL_GAS_LIMIT')
    return rows


def check_simulation(result, rows):
    require(type(result) is list and len(result) == 1 and type(result[0]) is dict, 'SIMULATION_BLOCKS')
    block = result[0]
    require(block.get('number') == hex(int(BLOCK, 16) + 1) and block.get('parentHash') == BLOCK_HASH,
            'SIMULATION_PARENT')
    calls = block.get('calls')
    require(type(calls) is list and len(calls) == len(rows), 'SIMULATION_CALL_COUNT')
    checked = []
    for row, call in zip(rows, calls):
        require(type(call) is dict and call.get('status') == row['expected']['status'], 'CALL_STATUS')
        gas = call.get('gasUsed')
        require(isinstance(gas, str) and re.fullmatch('0x(?:0|[1-9a-f][0-9a-f]*)', gas) is not None,
                'GAS_FORMAT')
        require(int(gas, 16) < int(row['call']['gas'], 16), 'CALL_GAS_EXHAUSTION')
        returned = call.get('returnData', '0x')
        require(isinstance(returned, str) and re.fullmatch('0x(?:[0-9a-f]{2})*', returned) is not None,
                'CALL_RETURN_FORMAT')
        normalized = returned
        if call['status'] == '0x0':
            require(call.get('logs', []) == [], 'FAILED_CALL_LOGS')
            error = call.get('error')
            require(error is None or type(error) is dict, 'CALL_ERROR_FORMAT')
            error_data = error.get('data', '0x') if error is not None else '0x'
            require(isinstance(error_data, str) and re.fullmatch('0x(?:[0-9a-f]{2})*', error_data) is not None,
                    'CALL_ERROR_DATA_FORMAT')
            require(returned == '0x' or error_data == '0x' or returned == error_data, 'CONFLICTING_REVERT_DATA')
            normalized = returned if returned != '0x' else error_data
        else:
            require(call.get('error') is None, 'SUCCESS_WITH_ERROR')
        require(normalized == row['expected']['returnData'], 'CALL_RETURN_DATA')
        checked.append({'label': row['label'], 'status': call['status'], 'gas_used': gas,
                        'normalized_return_data': normalized})
    return checked


def capture(provider, output, inputs):
    # Exclusive creation is atomic. Keep this owned handle for every partial save.
    with output.open('x+', encoding='utf-8', newline='\n') as handle:
        recorder = Recorder(provider, handle, inputs)
        try:
            require(recorder.rpc('chain', 'eth_chainId', []) == '0x1', 'CHAIN_MISMATCH')
            check_block(recorder.rpc('block_before', 'eth_getBlockByNumber', [BLOCK, False]))
            runtime = code_hex(recorder.rpc('token_runtime', 'eth_getCode', [TOKEN, BLOCK]), 24 * 1024)
            require('0x' + inputs['oracle'].digest(bytes.fromhex(runtime[2:])).hex() == TOKEN_CODE_HASH,
                    'TOKEN_RUNTIME_MISMATCH')
            for name, address in (('deployer', DEPLOYER), ('probe', inputs['probe'])):
                require(recorder.rpc(name + '_nonce_before', 'eth_getTransactionCount', [address, BLOCK]) == '0x0',
                        'FRESH_NONCE_REQUIRED')
                require(recorder.rpc(name + '_code_before', 'eth_getCode', [address, BLOCK]) == '0x',
                        'FRESH_CODE_REQUIRED')
            initial = persistent_state(recorder, 'persistent_before', inputs['probe'])
            require(initial['balance_probe'] == 0, 'FRESH_PROBE_BALANCE_REQUIRED')
            require(initial['balance_a'] >= 14, 'CALLER_BALANCE_BELOW_SEQUENCE_MINIMUM')
            rows = make_sequence(inputs, initial)
            recorder.data['sequence'] = rows
            recorder.data['baseline'] = {key: str(value) for key, value in initial.items()}
            recorder.data['simulation_call_count'] = len(rows)
            recorder.data['simulation_gas_limit_sum'] = sum(int(row['call']['gas'], 16) for row in rows)
            recorder.save()
            payload = {'blockStateCalls': [{'calls': [row['call'] for row in rows]}],
                       'validation': False, 'traceTransfers': False, 'returnFullTransactions': False}
            result = recorder.rpc('custody_sequence', 'eth_simulateV1', [payload, BLOCK])
            recorder.data['checks'] = check_simulation(result, rows)
            after = persistent_state(recorder, 'persistent_after', inputs['probe'])
            require(after == initial, 'PINNED_PERSISTENT_STATE_CHANGED')
            for name, address in (('deployer', DEPLOYER), ('probe', inputs['probe'])):
                require(recorder.rpc(name + '_nonce_after', 'eth_getTransactionCount', [address, BLOCK]) == '0x0',
                        'PINNED_PERSISTENT_NONCE_CHANGED')
                require(recorder.rpc(name + '_code_after', 'eth_getCode', [address, BLOCK]) == '0x',
                        'PINNED_PERSISTENT_CODE_CHANGED')
            check_block(recorder.rpc('block_after', 'eth_getBlockByNumber', [BLOCK, False]))
            recorder.data['persistent_after'] = {key: str(value) for key, value in after.items()}
            recorder.data['complete'] = True
            recorder.data['interpretation'] = 'Provider-reported ephemeral execution; not a local fork, wallet authorization, consensus proof or persistent custody.'
        except CaptureError as error:
            recorder.data['failure'] = str(error)
            raise
        except Exception as error:
            recorder.data['failure'] = type(error).__name__
            raise CaptureError('CAPTURE_FAILED') from None
        finally:
            recorder.data['elapsed_seconds'] = round(time.monotonic() - recorder.started, 3)
            recorder.save()
    print(json.dumps({'complete': True, 'provider': provider,
        'simulation_calls': len(rows), 'rpc_requests': len(recorder.data['calls']),
        'capture_sha256': sha(output.read_bytes())}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=PROVIDERS, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-build-sha256', required=True, type=hash_argument)
    parser.add_argument('--expected-script-sha256', required=True, type=hash_argument)
    try:
        args = parser.parse_args()
        inputs = load_inputs(args.expected_build_sha256, args.expected_script_sha256)
        capture(args.provider, args.output, inputs)
    except Exception as error:
        print(json.dumps({'complete': False, 'failure': str(error) if isinstance(error, CaptureError)
                          else type(error).__name__}), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
