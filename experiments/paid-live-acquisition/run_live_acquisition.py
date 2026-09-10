"""Explicit synthetic live-node change during one acquisition session.

The unchanged local guard permits one ancestor rollback. A trusted controller
changes the node between requests; this is not simultaneous in-flight RPC,
independent-provider evidence, consensus, public finality or a deployment.
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


def load(name, path, expected):
    source = path.read_bytes()
    need(sha(source) == expected, 'EXECUTION_INPUT_PIN')
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

    def verify_pins():
        for name, expected in pins.items():
            need(sha((HERE / name).read_bytes()) == expected, 'INPUT_PIN')
    verify_pins()
    need(a.output.parent.is_dir() and not a.output.exists(), 'NEW_OUTPUT')

    def source(name, relative):
        return load(name, HERE / relative, pins[relative])
    coordinator = source('live_acquisition_session', '../../reference/paid_acquisition_session.py')
    base = source('reorg_writer_base', '../paid-action/run_paid_action.py')
    node_module = source('live_reorg_node', '../paid-reorg/reorg_node.py')
    k = source('reorg_keccak', '../../reference/fixtures/generate-ethereum-proof-fixtures.py')
    build = json.loads((HERE / '../paid-action/paid-build.json').read_bytes())
    A, B, D, TOKEN, F = base.A, base.B, base.D, base.TOKEN, base.FEE
    q1, q2 = F // 3, 2 * F // 3

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

        def retire(self):
            self.rows.clear()
            self.intents.clear()
            self.deployments.clear()

    def expected(owners, nonces, stakes, credits, total, dust, vault, messages, epochs=(1, 0, 0)):
        return {'owners': owners, 'epochs': list(map(str, epochs)), 'nonces': list(map(str, nonces)),
                'stakes': list(map(str, stakes)), 'credits': list(map(str, credits)),
                'totalCredits': str(total), 'poolDust': str(dust), 'tokenBalance': str(vault),
                'messageCount': str(messages)}

    node = node_module.ReorgNode(a.anvil, a.output.parent / (a.output.stem + '-node'))
    result = {'schema': 'caw-paid-live-acquisition/1', 'created_utc': datetime.now(timezone.utc).isoformat(),
              'input_manifest_sha256': sha(raw), 'status': 'incomplete', 'branches': {}, 'attempts': [],
              'selected_branch': 'right', 'selection_policy': 'explicit local fixture checkpoint',
              'independent_providers': False, 'authenticates_consensus': False,
              'replay_only': False, 'controlled_local_request_boundary': True, 'concurrent_inflight_rpc': False}
    try:
        with node:
            writer = Writer(node)
            for actor in (A, B, D):
                node.rpc('gas', 'anvil_setBalance', [actor, '0xde0b6b3a7640000'])
                node.rpc('actor', 'anvil_impersonateAccount', [actor])
            node.install_token()
            for actor in (A, B):
                writer.send('synthetic_funding', D, TOKEN, writer.data('setBalance(address,uint256)', actor, F * 40))
            start = writer.header('prefix.start')
            registry = writer.reg = writer.deploy('TestAccountRegistry', (A, B))
            registry_runtime = writer.deployments[-1]['runtime']
            rh = '0x' + writer.k(bytes.fromhex(registry_runtime[2:])).hex()
            probe = writer.probe = writer.deploy('CawPaidActionProbe', (registry, rh), {'registry': registry, 'registryCodeHash': rh})
            probe_runtime = writer.deployments[-1]['runtime']
            for actor in (A, B):
                writer.call('approve', actor, TOKEN, 'approve(address,uint256)', probe, F * 40)
            for i, actor, amount in ((1, A, 20 * F), (2, A, 10), (3, B, 10)):
                writer.call('deposit', actor, probe, 'deposit(uint256,uint256,uint256)', i, 0, amount)
            for i, actor, amount in ((2, A, 1), (3, B, 2)):
                writer.call('stake', actor, probe, 'stake(uint256,uint256,uint256)', i, 0, amount)
            request, sig = writer.intent('common-prefix', b'common-prefix')
            writer.post('common-prefix', request, sig)
            ancestor = writer.header('prefix.ancestor')
            ancestor_state = writer.state('prefix.ancestor_state')
            need(ancestor_state == expected([A, A, B], [1, 0, 0], [0, 1, 2], [19 * F, 10 + q1, 10 + q2], 20 * F + 19, 1, 20 * F + 20, 1, (0, 0, 0)), 'ANCESTOR_ACCOUNTING')
            getters = {registry: [writer.data('authority(uint256)', i) for i in (1, 2, 3)],
                probe: [writer.data(f + '(uint256)', i) for f in ('credits', 'stakes', 'nonces') for i in (1, 2, 3)] + [writer.data(f + '()') for f in ('totalCredits', 'poolDust', 'messageCount')],
                TOKEN: [writer.data('balanceOf(address)', probe)]}
            trust = {'chain_id': 31337, 'addresses': {'registry': registry, 'probe': probe, 'token': TOKEN},
                'start_block_number': int(start['number'], 16), 'start_block_hash': start['hash'],
                'registry_runtime_sha256': sha(bytes.fromhex(registry_runtime[2:])),
                'probe_runtime_sha256': sha(bytes.fromhex(probe_runtime[2:]))}
            for actor in (A, B, D):
                node.rpc('prefix.gas_reserve', 'anvil_setBalance', [actor, '0xde0b6b3a7640000'])
            result['ancestor'] = {'header': ancestor, 'state': ancestor_state, 'snapshot': node.snapshot_ancestor()}
            window = {'validAfter': int(ancestor['timestamp'], 16) - 1, 'deadline': int(ancestor['timestamp'], 16) + 100000}

            writer.call('left.transfer', A, registry, 'transferFrom(address,address,uint256)', A, B, 1)
            orphan_request, orphan_sig = writer.intent('discarded-first', b'discarded-first', owner=2, **window)
            result['orphan_intent'] = copy.deepcopy(writer.intents[-1])
            writer.post('discarded-first', orphan_request, orphan_sig)
            writer.call('left.stake', B, probe, 'stake(uint256,uint256,uint256)', 3, 0, 1)
            request, sig = writer.intent('discarded-second', b'discarded-second', owner=2, **window)
            writer.post('discarded-second', request, sig)
            writer.call('left.withdraw', B, probe, 'withdraw(uint256,uint256,uint256)', 1, 1, 7)
            left_end = writer.header('left.end')
            need(int(left_end['number'], 16) == int(ancestor['number'], 16) + 5, 'LEFT_FIVE_BLOCKS')
            need(writer.state('left.end_state') == expected([B, A, B], [3, 0, 0], [0, 1, 3], [17 * F - 7, 10 + 2 * q1 + F // 4, 10 + 2 * q2 + 3 * F // 4], 20 * F + 11, 2, 20 * F + 13, 3), 'LEFT_ACCOUNTING')
            writer.retire()
            del writer

            def configuration(end):
                return {**copy.deepcopy(trust), 'end_block_number': int(end['number'], 16), 'end_block_hash': end['hash']}

            left_config = configuration(left_end)
            node.begin_read('left', left_config, getters)
            session = coordinator.AcquisitionSession()

            def state():
                value = session.state()
                value['current'] = None if value['current'] is None else {
                    'manifest': value['current']['manifest'], 'result': value['current']['result']}
                return value

            def switch_to_right():
                need(result.get('switch') is None, 'ONE_SWITCH')
                need(session.state()['busy'] and session.state()['status'] == 'unresolved', 'SWITCH_DURING_ACQUISITION')
                result['switch'] = {'phase': 'before_request', 'method': 'eth_getBlockByNumber',
                    'params': [left_end['number'], False], 'end_occurrence': 3,
                    'after_request_id': node._request_id, 'session_before': state()}
                node.restore_ancestor()
                result['switch']['restore_request_id'] = node._request_id
                prior_count = len(node.calls)
                try:
                    stale_lease('eth_chainId', [])
                except RuntimeError as error:
                    need(str(error) == 'REORG_RETIRED_LEASE' and len(node.calls) == prior_count, 'RETIRED_LEASE_REFUSAL')
                    result['switch']['retired_lease_refused_before_transport'] = True
                else:
                    raise RuntimeError('OLD_LEASE_SURVIVED')
                writer = Writer(node)
                writer.reg, writer.probe = registry, probe
                need(writer.header('right.restored_ancestor') == ancestor, 'RESTORED_ANCESTOR_HEADER')
                need(writer.state('right.restored_state') == ancestor_state, 'RESTORED_ANCESTOR_STATE')
                result['ancestor_restored_exactly'] = True
                writer.call('right.self_transfer', A, registry, 'transferFrom(address,address,uint256)', A, A, 1)
                pre = writer.state('right.orphan_preconditions')
                now = int(writer.header('right.orphan_time')['timestamp'], 16)
                need(pre['owners'][0] == A and pre['epochs'][0] == str(orphan_request['epoch']) == '1' and pre['nonces'][0] == str(orphan_request['nonce']) == '1' and pre['stakes'] == ['0', '1', '2'] and int(pre['credits'][0]) >= F and orphan_request['validAfter'] <= now < orphan_request['deadline'], 'ORPHAN_PRECONDITIONS')
                need(writer.view('right.orphan_pool', probe, 'distributionHash()') == orphan_request['distributionHash'], 'ORPHAN_POOL_COMMITMENT')
                failed = writer.post('right.orphan_rejected', orphan_request, orphan_sig, success=False, error='InvalidSignature()')
                result['orphan_rejection'] = copy.deepcopy(failed)
                writer.call('right.stake', A, probe, 'stake(uint256,uint256,uint256)', 2, 0, 2)
                request, sig = writer.intent('selected-first', b'selected-first', **window)
                writer.post('selected-first', request, sig)
                writer.call('right.withdraw', A, probe, 'withdraw(uint256,uint256,uint256)', 1, 1, 9)
                right_end = writer.header('right.end')
                need(right_end['number'] == left_end['number'] and right_end['hash'] != left_end['hash'], 'SAME_HEIGHT_DISTINCT_TIPS')
                need(writer.state('right.end_state') == expected([A, A, B], [2, 0, 0], [0, 3, 2], [18 * F - 9, 10 + q1 + 3 * F // 5, 10 + q2 + 2 * F // 5], 20 * F + 10, 1, 20 * F + 11, 2), 'RIGHT_ACCOUNTING')
                writer.retire()
                del writer

                right_config = configuration(right_end)
                result['right_config'] = right_config
                result['right_end'] = right_end
                node.begin_read('right', right_config, getters)
                result['switch']['before_resumed_request_id'] = node._request_id + 1
                result['switch']['session_after_controller'] = state()
                result['switch']['controller_completed'] = True

            def acquire(name, config, branch=None, switching=False):
                token = session.select(config)
                need(session.state()['status'] == 'unresolved' and session.state()['current'] is None, 'SELECT_INVALIDATES')
                row = {'name': name, 'selection': copy.deepcopy(config), 'before': state(),
                    'request_ids': {'number': [], 'hash': []}, 'error': None}
                result['attempts'].append(row)
                end_occurrences = 0

                def transport(strategy):
                    lease = None
                    lease_generation = None
                    def rpc(method, params):
                        nonlocal lease, lease_generation, end_occurrences
                        if switching and strategy == 'number' and method == 'eth_getBlockByNumber' and params == [left_end['number'], False]:
                            end_occurrences += 1
                            if end_occurrences == 3:
                                switch_to_right()
                        if lease is None or lease_generation != node.generation:
                            lease = node.read_lease(strategy)
                            lease_generation = node.generation
                        value = lease(method, params)
                        row['request_ids'][strategy].append(node._request_id)
                        if switching and end_occurrences == 3:
                            result['switch']['resumed_request_id'] = node._request_id
                        return value
                    return rpc

                try:
                    published = session.acquire(token, transport('number'), transport('hash'))
                except coordinator.SessionError as error:
                    row['error'] = error.code
                    published = None
                row['after'] = state()
                if switching:
                    need(result.get('switch', {}).get('controller_completed') is True, 'SWITCH_COMPLETED')
                    need(row['error'] == 'ACQUISITION_SESSION_FINAL_BOUNDARY', 'OBSERVED_FINAL_BOUNDARY_REJECTION')
                    need(row['after']['current'] is None and row['after']['status'] == 'unresolved' and not row['after']['busy'], 'INTERRUPTED_UNRESOLVED')
                    need(row['after']['selected'] == left_config, 'NO_SILENT_RESELECTION')
                    need(row['after']['error']['stage'] == 'final_boundaries', 'FINAL_STAGE')
                    resumed = node.calls[result['switch']['resumed_request_id'] - 1]
                    need(resumed['request']['id'] == result['switch']['before_resumed_request_id'], 'RESUMED_REQUEST_ORDER')
                    need(resumed['request']['method'] == 'eth_getBlockByNumber' and resumed['request']['params'] == [left_end['number'], False]
                         and resumed['response']['result'] == result['right_end'], 'ACTUAL_RIGHT_HEADER_RETURNED')
                    need([len(row['request_ids'][s]) for s in ('number', 'hash')] == [60, 84], 'SWITCH_QUERY_COVERAGE')
                else:
                    need(published is not None and row['error'] is None and row['after']['status'] == 'ready', 'READY_CONTROL')
                    need([len(row['request_ids'][s]) for s in ('number', 'hash')] == [60, 87], 'COMPLETE_ACQUISITION')
                    need(published['result'] == published['history']['final'] or all(
                        published['result'][key] == value for key, value in published['history']['final'].items()), 'COMPLETE_ACCOUNTING')
                    result['branches'][branch] = {'config': copy.deepcopy(config), **published}
                return row

            acquire('stable-left', left_config, 'left')
            stale_lease = node.read_lease('number')
            acquire('interrupted-left', left_config, switching=True)
            acquire('fresh-right', result['right_config'], 'right')
            need(session.state()['calls'] == 438 and session.state()['attempts'] == 3 and session.state()['generation'] == 3, 'CUMULATIVE_ACQUISITION_WORK')
            need(result['branches']['left']['history']['end_block']['number'] == result['branches']['right']['history']['end_block']['number'], 'SAME_HEIGHT')
            need(result['branches']['left']['history']['end_block']['hash'] != result['branches']['right']['history']['end_block']['hash'], 'DISTINCT_TIPS')
            last_read = node.read_lease('hash')
            node.finish_reads()
            prior_count = len(node.calls)
            try:
                last_read('eth_chainId', [])
            except RuntimeError as error:
                need(str(error) == 'REORG_RETIRED_LEASE' and len(node.calls) == prior_count, 'CLOSED_LEASE_REFUSAL')
                result['closed_right_lease_refused_before_transport'] = True
            else:
                raise RuntimeError('CLOSED_LEASE_SURVIVED')
            verify_pins()
            result['source_pins_unchanged_after_run'] = True
            result['status'] = 'pass'
    except Exception as error:
        result['status'] = 'fail'
        result['error'] = str(error)
    finally:
        result['node'] = node.receipt()
        result['rpc'] = node.calls
        result['phases'] = node.transitions
        try:
            with socket.socket() as check:
                check.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                check.bind(('127.0.0.1', 18545))
            result['owned_listener_released'] = True
        except OSError:
            result['owned_listener_released'] = False
            result['status'] = 'fail'
            result['cleanup_error'] = 'LISTENER_RELEASE_NOT_CONFIRMED'
        encoded = json.dumps(result, ensure_ascii=True, separators=(',', ':')) + '\n'
        if len(encoded.encode()) > 8 * 1024 * 1024:
            # Keep the bounded raw evidence even when the expanded collector
            # copies exceed the separate report budget. Never report a pass.
            retained = a.output.with_name(a.output.stem + '-incomplete-rpc.json')
            with retained.open('x', encoding='utf-8') as f:
                json.dump(result['rpc'], f, ensure_ascii=True, separators=(',', ':'))
            result['rpc'] = []
            result['branches'] = {}
            result['status'], result['error'] = 'fail', 'OUTPUT_BOUND'
            result['retained_rpc_file'] = retained.name
            encoded = json.dumps(result, ensure_ascii=True, separators=(',', ':')) + '\n'
        with a.output.open('x', encoding='utf-8') as f:
            f.write(encoded)
    print(json.dumps({key: result[key] for key in ('status', 'node', 'owned_listener_released')}))
    if result['status'] != 'pass':
        print(result.get('error', 'LIVE_ACQUISITION_FAILED'))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
