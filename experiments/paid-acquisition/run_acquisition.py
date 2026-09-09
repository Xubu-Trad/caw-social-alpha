"""Fresh local writer, then two live read-only collectors; explicit invocation.

No real funds, wallet, external provider, fork, frontend or saved-history input.
The retained paid-action contract and offline readers remain unchanged.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True


def load(name, path, expected=None):
    source = path.read_bytes()
    if expected is not None and hashlib.sha256(source).hexdigest() != expected:
        raise RuntimeError('EXECUTION_INPUT_PIN')
    spec = importlib.util.spec_from_loader(name, loader=None)
    m = importlib.util.module_from_spec(spec)
    m.__file__ = str(path)
    sys.modules[name] = m
    exec(compile(source, str(path), 'exec'), m.__dict__)
    return m


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def need(condition, code):
    if not condition:
        raise RuntimeError(code)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--anvil', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--expected-input-sha256', required=True)
    a = p.parse_args()
    raw = (HERE / 'experiment-inputs.json').read_bytes()
    need(sha(raw) == a.expected_input_sha256, 'INPUT_MANIFEST')
    pins = json.loads(raw)['files']
    for name, expected in pins.items():
        need(sha((HERE / name).read_bytes()) == expected, 'INPUT_PIN')
    need(a.output.parent.is_dir() and not a.output.exists(), 'NEW_OUTPUT')
    base = load('acquisition_writer_base', HERE / '../paid-action/run_paid_action.py')
    node_module = load('acquisition_node', HERE / 'acquisition_node.py')
    k = load('acquisition_keccak', HERE / '../../reference/fixtures/generate-ethereum-proof-fixtures.py')
    build = json.loads((HERE / '../paid-action/paid-build.json').read_bytes())
    A, B, D, TOKEN, FEE = base.A, base.B, base.D, base.TOKEN, base.FEE

    class Writer(base.Run):
        def __init__(self, node):
            super().__init__(node, k, build)
            self.spent = {}

        def send(self, label, caller, to, data, success=True, error=None, returned='0x'):
            row = super().send(label, caller, to, data, success, error, returned)
            self.spent[caller] = self.spent.get(caller, 0) + int(row['receipt']['gasUsed'], 16)
            if self.spent[caller] >= 2000000:
                self.n.rpc(label + '.gas_refill', 'anvil_setBalance', [caller, '0xde0b6b3a7640000'])
                self.spent[caller] = 0
            return row

        def write(self):
            for actor in (A, B, D):
                self.n.rpc('gas', 'anvil_setBalance', [actor, '0xde0b6b3a7640000'])
                self.n.rpc('actor', 'anvil_impersonateAccount', [actor])
            self.n.install_token()
            for actor in (A, B):
                self.send('synthetic_funding', D, TOKEN, self.data('setBalance(address,uint256)', actor, FEE * 40))
            # Synthetic funding precedes the reader's exclusive start anchor.
            start = self.header('writer.start')
            self.reg = self.deploy('TestAccountRegistry', (A, B))
            registry_runtime = self.deployments[-1]['runtime']
            rh = '0x' + self.k(bytes.fromhex(registry_runtime[2:])).hex()
            self.probe = self.deploy('CawPaidActionProbe', (self.reg, rh), {'registry': self.reg, 'registryCodeHash': rh})
            probe_runtime = self.deployments[-1]['runtime']
            for actor in (A, B):
                self.call('approve', actor, TOKEN, 'approve(address,uint256)', self.probe, FEE * 40)
            for i, actor, amount in ((1, A, FEE * 20), (2, A, 10), (3, B, 10)):
                self.call('deposit', actor, self.probe, 'deposit(uint256,uint256,uint256)', i, 0, amount)
            request, sig = self.intent('empty_pool', b'No pool yet.')
            self.post('empty_pool', request, sig, success=False, error='NoEligibleStake()')
            for i, actor, amount in ((2, A, 1), (3, B, 2)):
                self.call('stake', actor, self.probe, 'stake(uint256,uint256,uint256)', i, 0, amount)
            request, sig = self.intent('first', b'CAW. The record survives the writer.')
            self.post('first', request, sig)
            self.post('replay', request, sig, caller=B, success=False, error='InvalidNonce()')
            for label, text in (('composed', '\u00e9'), ('decomposed', 'e\u0301')):
                request, sig = self.intent(label, text.encode())
                self.post(label, request, sig, caller=A)
            stale, old_sig = self.intent('stale_owner', b'Past authority.')
            self.call('transfer', A, self.reg, 'transferFrom(address,address,uint256)', A, B, 1)
            self.post('stale_owner', stale, old_sig, success=False, error='StaleEpoch()')
            request, sig = self.intent('current_owner', b'Current owner. Same history.', owner=2)
            self.post('current_owner', request, sig)
            self.call('return', B, self.reg, 'transferFrom(address,address,uint256)', B, A, 1)
            self.call('unstake', B, self.probe, 'unstake(uint256,uint256,uint256)', 3, 0, 1)
            self.call('withdraw', A, self.probe, 'withdraw(uint256,uint256,uint256)', 1, 2, 1)
            end = self.header('writer.end')
            return {'chain_id': 31337, 'addresses': {'registry': self.reg, 'probe': self.probe, 'token': TOKEN},
                    'start_block_number': int(start['number'], 16), 'end_block_number': int(end['number'], 16),
                    'start_block_hash': start['hash'], 'end_block_hash': end['hash'],
                    'registry_runtime_sha256': sha(bytes.fromhex(registry_runtime[2:])),
                    'probe_runtime_sha256': sha(bytes.fromhex(probe_runtime[2:]))}

    node = node_module.AcquisitionNode(a.anvil, a.output.parent / (a.output.stem + '-node'))
    result = {'schema': 'caw-paid-acquisition-run/1', 'created_utc': datetime.now(timezone.utc).isoformat(),
              'input_manifest_sha256': sha(raw), 'status': 'incomplete', 'collectors': {}}
    try:
        with node:
            writer = Writer(node)
            config = writer.write()
            # Only explicit checkpoint/runtime/address trust crosses the handoff.
            # Collectors never receive rows, intents, deployment receipts or state.
            getters = {
                config['addresses']['registry']: [writer.data('authority(uint256)', i) for i in (1, 2, 3)],
                config['addresses']['probe']: [writer.data(f + '(uint256)', i) for f in ('credits', 'stakes', 'nonces') for i in (1, 2, 3)] + [writer.data(f + '()') for f in ('totalCredits', 'poolDust', 'messageCount')],
                TOKEN: [writer.data('balanceOf(address)', config['addresses']['probe'])]}
            writer.rows.clear()
            writer.intents.clear()
            writer.deployments.clear()
            del writer
            node.seal(config, getters)
            result['config'] = config
            result['handoff'] = {'writer_deleted': True, 'writer_trace_read_by_collectors': False,
                'frontend_started': False, 'indexer_started': False, 'writes_sealed': True,
                'first_read_only_request_id': node._request_id + 1}
            # Reject a write without sending it to the node.
            try:
                node._params('anvil_setBalance', [D, '0xde0b6b3a7640000'])
            except RuntimeError as error:
                need(str(error) == 'ACQUISITION_READ_ONLY_SCOPE', 'SEAL_ERROR')
                result['handoff']['write_refused'] = True
            else:
                raise RuntimeError('WRITE_SEAL_FAILED')
            for name in ('number', 'hash'):
                source_name = 'collect_by_' + name + '.py'
                collector = load('acquisition_' + name, HERE / source_name, pins[source_name])
                first = len(node.calls)
                def rpc(method, params):
                    return node.rpc('collector.' + name + '.' + str(len(node.calls) - first), method, params)
                try:
                    acquired = collector.collect(rpc, copy.deepcopy(config))
                    result['collectors'][name] = {**acquired, 'request_count': len(node.calls) - first}
                except Exception as error:
                    result['collectors'][name] = {'error': str(error), 'request_count': len(node.calls) - first}
                    raise
            need(result['collectors']['number']['history'] == result['collectors']['hash']['history'], 'COLLECTOR_HISTORY_DISAGREEMENT')
            need(result['collectors']['number']['manifest'] == result['collectors']['hash']['manifest'], 'COLLECTOR_MANIFEST_DISAGREEMENT')
            result['status'] = 'pass'
    except Exception as error:
        result['status'] = 'fail'
        result['error'] = str(error)
    finally:
        result['node'] = node.receipt()
        result['rpc'] = node.calls
        with socket.socket() as check:
            check.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            check.bind(('127.0.0.1', 18545))
        result['owned_listener_released'] = True
        encoded = json.dumps(result, ensure_ascii=True, separators=(',', ':')) + '\n'
        need(len(encoded.encode()) <= 8 * 1024 * 1024, 'OUTPUT_BOUND')
        a.output.write_text(encoded, encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('status', 'node', 'owned_listener_released')}))
    if result['status'] != 'pass':
        print(result.get('error', 'ACQUISITION_FAILED'))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
