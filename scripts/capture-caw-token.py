"""Read-only CAW RPC capture. No wallet, signing, override state or transaction RPC.

Explicit invocation only; never part of the website, build or offline test suite.
Each response is bounded to 256 KiB and each request to 15 seconds. Captures pin
one historical block; they do not establish chain consensus or current state.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request

TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452'
BLOCK = '0x18bc1ea'
BLOCK_HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d'
STATE_ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152'
PROVIDERS = {'publicnode': 'https://ethereum-rpc.publicnode.com',
             'drpc': 'https://eth.drpc.org'}
ZERO = '0x' + '00' * 20
CALLER = '0x' + '00' * 19 + '01'
RECIPIENT = '0x' + '00' * 19 + '02'
DEAD = '0x' + '00' * 18 + 'dead'
ALLOWED = {'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getProof', 'eth_call'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused')


def word(value):
    if isinstance(value, str):
        value = int(value, 16)
    if not 0 <= value < 2 ** 256:
        raise ValueError('ABI word range')
    return f'{value:064x}'


def requests():
    rows = [('chain', 'eth_chainId', []),
            ('block_before', 'eth_getBlockByNumber', [BLOCK, False]),
            ('runtime', 'eth_getCode', [TOKEN, BLOCK]),
            ('account_proof', 'eth_getProof', [TOKEN, [], BLOCK])]

    def call(label, selector, *args):
        rows.append((label, 'eth_call', [{'from': CALLER, 'to': TOKEN,
                     'gas': '0x30d40', 'data': selector + ''.join(word(x) for x in args)}, BLOCK]))

    for label, selector in [('name', '0x06fdde03'), ('symbol', '0x95d89b41'),
                            ('decimals', '0x313ce567'), ('total_supply', '0x18160ddd')]:
        call(label, selector)
    call('caller_balance', '0x70a08231', CALLER)
    call('caller_self_allowance', '0xdd62ed3e', CALLER, CALLER)
    call('transfer_zero_to_regular', '0xa9059cbb', RECIPIENT, 0)
    call('transfer_zero_to_zero_address', '0xa9059cbb', ZERO, 0)
    call('transfer_one_to_zero_address', '0xa9059cbb', ZERO, 1)
    call('transfer_zero_to_dead', '0xa9059cbb', DEAD, 0)
    call('transfer_from_zero_to_regular', '0x23b872dd', CALLER, RECIPIENT, 0)
    call('transfer_from_zero_to_zero_address', '0x23b872dd', CALLER, ZERO, 0)
    call('burn_zero', '0x42966c68', 0)
    rows.append(('block_after', 'eth_getBlockByNumber', [BLOCK, False]))
    return rows


def capture(provider, output):
    if output.exists():
        raise ValueError('Refuse to overwrite an existing receipt')
    opener = urllib.request.build_opener(NoRedirect)
    receipt = {'schema': 'caw-token-rpc-capture/1', 'provider': PROVIDERS[provider],
               'captured_at_utc': datetime.now(timezone.utc).isoformat(),
               'token': TOKEN, 'block_number': BLOCK, 'expected_block_hash': BLOCK_HASH,
               'transaction_sent': False, 'state_overrides_used': False, 'calls': []}
    for index, (label, method, params) in enumerate(requests(), 1):
        if method not in ALLOWED:
            raise ValueError('Non-read method refused')
        body = {'jsonrpc': '2.0', 'id': index, 'method': method, 'params': params}
        entry = {'label': label, 'request': body}
        req = urllib.request.Request(PROVIDERS[provider], data=json.dumps(body).encode('utf-8'),
                                     headers={'Content-Type': 'application/json', 'User-Agent': 'CAW-token-review/1'})
        try:
            with opener.open(req, timeout=15) as response:
                raw = response.read(262145)
            if len(raw) > 262144:
                raise ValueError('Response size exceeded')
            data = json.loads(raw)
            if data.get('jsonrpc') != '2.0' or data.get('id') != index:
                raise ValueError('RPC envelope mismatch')
            if ('result' in data) == ('error' in data):
                raise ValueError('RPC result/error envelope')
            entry['response'] = data
        except Exception as error:
            # Error text may expose proxy/user paths; preserve only the class.
            entry['transport_failure'] = type(error).__name__
        receipt['calls'].append(entry)
        # Persist partial observations so failed acquisition is not lost.
        output.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    for label in ['chain', 'block_before', 'block_after']:
        item = next(row for row in receipt['calls'] if row['label'] == label)
        result = item.get('response', {}).get('result')
        expected = '0x1' if label == 'chain' else BLOCK_HASH
        actual = result if label == 'chain' else result.get('hash') if isinstance(result, dict) else None
        if actual != expected:
            raise ValueError('Chain/block guard failed: ' + label)
        if label != 'chain' and (result.get('number') != BLOCK or result.get('stateRoot') != STATE_ROOT):
            raise ValueError('Block number/root guard failed: ' + label)
    print(json.dumps({'provider': provider, 'calls': len(receipt['calls']),
                      'transport_failures': sum('transport_failure' in x for x in receipt['calls']),
                      'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--provider', choices=PROVIDERS, required=True)
    parser.add_argument('--output', type=Path, required=True)
    options = parser.parse_args()
    capture(options.provider, options.output)
