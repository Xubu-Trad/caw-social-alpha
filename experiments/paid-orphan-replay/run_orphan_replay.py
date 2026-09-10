"""Explicit synthetic rollback with one signed action accepted on both branches.

The unchanged contracts check current signing conditions. This experiment does
not add a branch-specific signature domain or infer public-chain finality. It
uses one local node, public test keys and the existing bounded read/write guard.
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


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def need(condition, code):
    if not condition:
        raise RuntimeError(code)


def load(name, path, expected):
    source = path.read_bytes()
    need(sha(source) == expected, 'EXECUTION_INPUT_PIN')
    spec = importlib.util.spec_from_loader(name, loader=None)
    module = importlib.util.module_from_spec(spec)
    module.__file__ = str(path)
    sys.modules[name] = module
    exec(compile(source, str(path), 'exec'), module.__dict__)
    return module


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--anvil', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-input-sha256', required=True)
    args = parser.parse_args()
    raw = (HERE / 'experiment-inputs.json').read_bytes()
    need(sha(raw) == args.expected_input_sha256, 'INPUT_MANIFEST')
    inputs = json.loads(raw)
    need(inputs['schema'] == 'caw-paid-orphan-replay-inputs/1', 'INPUT_SCHEMA')
    pins = inputs['files']

    def verify_pins():
        for name, expected in pins.items():
            need(sha((HERE / name).read_bytes()) == expected, 'INPUT_PIN')

    verify_pins()
    need(args.output.parent.is_dir() and not args.output.exists(), 'NEW_OUTPUT')

    def source(name, relative):
        return load(name, HERE / relative, pins[relative])

    base = source('orphan_writer_base', '../paid-action/run_paid_action.py')
    node_module = source('orphan_reorg_node', '../paid-reorg/reorg_node.py')
    keccak = source('orphan_keccak', '../../reference/fixtures/generate-ethereum-proof-fixtures.py')
    reader = source('orphan_python_reader', '../../reference/paid_action_reader.py')
    build = json.loads((HERE / '../paid-action/paid-build.json').read_bytes())
    A, B, D, TOKEN, F = base.A, base.B, base.D, base.TOKEN, base.FEE
    q1, q2 = F // 3, 2 * F // 3
    pool = '0x' + keccak.digest(b''.join(base.word(n) for n in (0, 1, 2))).hex()
    domain = None

    class Writer(base.Run):
        def __init__(self, node):
            super().__init__(node, keccak, build)
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

    # Independent arithmetic for this fixed sequence, not values obtained by
    # parsing the contract logs or either reader's returned accounting.
    def expected_state(branch):
        ancestor = branch == 'ancestor'
        extra = 1 if branch == 'right' else 0
        posts = 1 if ancestor else 2
        return {
            'owners': [A if ancestor else B, A, B],
            'epochs': ['0' if ancestor else '1', '0', '0'],
            'nonces': [str(posts), '0', '0'],
            'stakes': ['0', '1', '2'],
            'credits': [str((20 - posts) * F + extra), str(10 + posts * q1), str(10 + posts * q2)],
            'totalCredits': str(20 * F + 20 - posts + extra),
            'poolDust': str(posts), 'tokenBalance': str(20 * F + 20 + extra),
            'messageCount': str(posts)
        }

    def expected_message(message_id, text, owner, epoch, nonce):
        return {'id': str(message_id), 'accountId': '1', 'owner': owner,
                'epoch': str(epoch), 'nonce': str(nonce), 'text_hex': '0x' + text.hex(),
                'fee': str(F), 'distributionHash': pool,
                'allocations': ['0', str(q1), str(q2)], 'dust': '1'}

    common_message = expected_message(1, b'common-prefix', A, 0, 0)
    replay_message = expected_message(2, b'orphan-replay', B, 1, 1)
    oracles = {branch: {**expected_state(branch), 'messages': copy.deepcopy(
        [common_message] if branch == 'ancestor' else [common_message, replay_message])}
        for branch in ('ancestor', 'left', 'right')}

    node = node_module.ReorgNode(args.anvil, args.output.parent / (args.output.stem + '-node'))
    result = {
        'schema': 'caw-paid-orphan-replay-run/1',
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'input_manifest_sha256': sha(raw), 'status': 'incomplete',
        'branches': {}, 'accepted': {}, 'duplicate_rejections': {}, 'signing_conditions': {},
        'oracles': oracles, 'selected_branch': 'right',
        'selection_policy': 'explicit local fixture checkpoint',
        'independent_providers': False, 'authenticates_consensus': False,
        'historical_caw_execution': False, 'replay_only': False,
        'new_signature_on_right': False, 'permanent_orphan_invalidation': False,
        'same_branch_duplicate_accepted': False
    }
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
            registry_keccak = '0x' + writer.k(bytes.fromhex(registry_runtime[2:])).hex()
            probe = writer.probe = writer.deploy('CawPaidActionProbe', (registry, registry_keccak),
                                                {'registry': registry, 'registryCodeHash': registry_keccak})
            probe_runtime = writer.deployments[-1]['runtime']
            domain = '0x' + writer.k(writer.k(b'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
                + writer.k(b'CAW Paid Action Experiment') + writer.k(b'1') + base.word(31337) + base.word(probe)).hex()
            for actor in (A, B):
                writer.call('approve', actor, TOKEN, 'approve(address,uint256)', probe, F * 40)
            for account, actor, amount in ((1, A, 20 * F), (2, A, 10), (3, B, 10)):
                writer.call('deposit', actor, probe, 'deposit(uint256,uint256,uint256)', account, 0, amount)
            for account, actor, amount in ((2, A, 1), (3, B, 2)):
                writer.call('stake', actor, probe, 'stake(uint256,uint256,uint256)', account, 0, amount)
            request, signature = writer.intent('common-prefix', b'common-prefix')
            writer.post('common-prefix', request, signature)
            ancestor = writer.header('prefix.ancestor')
            ancestor_state = writer.state('prefix.ancestor_state')
            need(ancestor_state == expected_state('ancestor'), 'ANCESTOR_ACCOUNTING')
            getters = {
                registry: [writer.data('authority(uint256)', i) for i in (1, 2, 3)],
                probe: [writer.data(field + '(uint256)', i) for field in ('credits', 'stakes', 'nonces') for i in (1, 2, 3)]
                    + [writer.data(field + '()') for field in ('totalCredits', 'poolDust', 'messageCount')],
                TOKEN: [writer.data('balanceOf(address)', probe)]
            }
            trust = {
                'chain_id': 31337, 'addresses': {'registry': registry, 'probe': probe, 'token': TOKEN},
                'start_block_number': int(start['number'], 16), 'start_block_hash': start['hash'],
                'registry_runtime_sha256': sha(bytes.fromhex(registry_runtime[2:])),
                'probe_runtime_sha256': sha(bytes.fromhex(probe_runtime[2:]))
            }
            for actor in (A, B, D):
                node.rpc('prefix.gas_reserve', 'anvil_setBalance', [actor, '0xde0b6b3a7640000'])
            result['ancestor'] = {'header': ancestor, 'state': ancestor_state, 'snapshot': node.snapshot_ancestor()}
            window = {'validAfter': int(ancestor['timestamp'], 16) - 1,
                      'deadline': int(ancestor['timestamp'], 16) + 100000}

            def acquire(branch, end):
                config = {**copy.deepcopy(trust), 'end_block_number': int(end['number'], 16), 'end_block_hash': end['hash']}
                node.begin_read(branch, config, getters)
                handoff = {
                    'writer_deleted': True, 'writer_trace_read_by_collectors': False,
                    'frontend_started': False, 'indexer_started': False, 'writes_sealed_for_phase': True,
                    'first_read_only_request_id': node._request_id + 1
                }
                before = len(node.calls)
                try:
                    node.rpc('must_not_write', 'anvil_setBalance', [D, '0xde0b6b3a7640000'])
                except RuntimeError as error:
                    need(str(error) == 'REORG_READ_LEASE_REQUIRED' and len(node.calls) == before, 'PHASE_REFUSAL')
                    handoff['direct_write_refused_before_transport'] = True
                else:
                    raise RuntimeError('PHASE_WRITE_ALLOWED')
                captured = {'config': config, 'handoff': handoff, 'collectors': {}}
                result['branches'][branch] = captured
                for name in ('number', 'hash'):
                    relative = '../paid-acquisition/collect_by_' + name + '.py'
                    collector = source('orphan_' + branch + '_' + name, relative)
                    read = node.read_lease(name)
                    for method, params, code in (
                            ('anvil_setBalance', [D, '0xde0b6b3a7640000'], 'ACQUISITION_READ_ONLY_SCOPE'),
                            ('evm_snapshot', [], 'REORG_CONTROLLER_ONLY')):
                        before = len(node.calls)
                        try:
                            read(method, params)
                        except RuntimeError as error:
                            need(str(error) == code and len(node.calls) == before, 'LEASE_MUTATION_REFUSAL')
                        else:
                            raise RuntimeError('LEASE_MUTATION_ALLOWED')
                    first = node._request_id
                    acquired = collector.collect(read, copy.deepcopy(config))
                    last = node._request_id
                    rebuilt = reader.reconstruct(acquired['history'], acquired['manifest'])
                    need(rebuilt == oracles[branch], 'COMPLETE_' + branch.upper() + '_ORACLE')
                    captured['collectors'][name] = {
                        **acquired, 'reconstruction': rebuilt, 'request_count': last - first,
                        'first_request_id': first + 1, 'last_request_id': last,
                        'request_ids': list(range(first + 1, last + 1))
                    }
                numbered, hashed = captured['collectors']['number'], captured['collectors']['hash']
                need(numbered['history'] == hashed['history'], 'HISTORY_DISAGREEMENT')
                need(numbered['manifest'] == hashed['manifest'], 'MANIFEST_DISAGREEMENT')
                need(numbered['reconstruction'] == hashed['reconstruction'], 'RECONSTRUCTION_DISAGREEMENT')
                need(numbered['history']['end_block'] == numbered['history']['blocks'][-1]['header'], 'ENDPOINT_FIELDS')
                need(numbered['history']['final'] == expected_state(branch), 'COLLECTED_ENDPOINT_ORACLE')
                return read

            writer.call('left.transfer', A, registry, 'transferFrom(address,address,uint256)', A, B, 1)
            orphan_request, orphan_signature = writer.intent('orphan-replay', b'orphan-replay', owner=2, **window)
            result['orphan_intent'] = copy.deepcopy(writer.intents[-1])
            need(result['orphan_intent']['signer'] == B, 'SIGNER_B')
            need(orphan_request['accountId'] == 1 and orphan_request['epoch'] == 1
                 and orphan_request['nonce'] == 1 and orphan_request['distributionHash'] == pool, 'SIGNED_CONDITIONS')
            shared_calldata = writer.encode(orphan_request, orphan_signature)
            shared_transaction = writer.tx(D, probe, shared_calldata)
            result['shared_transaction'] = copy.deepcopy(shared_transaction)
            tup = b''.join(base.word(orphan_request[field]) for field in
                ('accountId', 'epoch', 'nonce', 'validAfter', 'deadline', 'distributionHash'))
            tup += base.word(224) + base.blob(orphan_request['text'])
            digest_data = '0x' + (writer.k(b'postDigest((uint256,uint256,uint256,uint256,uint256,bytes32,bytes))')[:4]
                                  + base.word(32) + tup).hex()

            def conditions(branch):
                first = node._request_id
                label = branch + '.conditions'
                header = writer.header(label + '.header')
                state = writer.state(label + '.state')
                evidence = {
                    'header': header, 'state': state,
                    'chain_id': node.rpc(label + '.chain_id', 'eth_chainId', []),
                    'domain_separator': writer.view(label + '.domain_separator', probe, 'domainSeparator()'),
                    'digest': node.rpc(label + '.digest', 'eth_call', [writer.tx(D, probe, digest_data), 'latest']),
                    'distribution_hash': writer.view(label + '.distribution_hash', probe, 'distributionHash()'),
                    'fee': str(writer.uint(label + '.fee', probe, 'FEE()')),
                    'profile': writer.view(label + '.profile', probe, 'PROFILE()')
                }
                for name, address in (('registry', registry), ('probe', probe)):
                    runtime = node.rpc(label + '.' + name + '_runtime', 'eth_getCode', [address, 'latest'])
                    evidence[name + '_runtime_sha256'] = sha(bytes.fromhex(runtime[2:]))
                    need(evidence[name + '_runtime_sha256'] == trust[name + '_runtime_sha256'], 'SIGNING_RUNTIME_PIN')
                now = int(header['timestamp'], 16)
                need(evidence['chain_id'] == '0x7a69' and evidence['domain_separator'] == domain
                     and evidence['digest'] == result['orphan_intent']['digest']
                     and evidence['distribution_hash'] == pool and evidence['fee'] == str(F)
                     and evidence['profile'] == '0x' + writer.k(base.PROFILE.encode()).hex(), 'SAME_SIGNING_DOMAIN')
                need(state['owners'] == [B, A, B] and state['epochs'] == ['1', '0', '0']
                     and state['nonces'] == ['1', '0', '0'] and state['stakes'] == ['0', '1', '2']
                     and int(state['credits'][0]) - int(state['stakes'][0]) >= F
                     and orphan_request['validAfter'] <= now < orphan_request['deadline'], 'ACCEPTANCE_PRECONDITIONS')
                expected_pre = expected_state('ancestor')
                expected_pre['owners'][0], expected_pre['epochs'][0] = B, '1'
                if branch == 'right':
                    expected_pre['credits'][0] = str(int(expected_pre['credits'][0]) + 1)
                    for field in ('totalCredits', 'tokenBalance'):
                        expected_pre[field] = str(int(expected_pre[field]) + 1)
                need(state == expected_pre, 'PRECONDITION_ACCOUNTING')
                evidence['request_ids'] = list(range(first + 1, node._request_id + 1))
                result['signing_conditions'][branch] = evidence

            def submit_pair(branch):
                conditions(branch)
                # Reuse the original request and signature objects. Encode and
                # compare every call; no signer is invoked on the right branch.
                accepted = writer.post(branch + '.accepted', orphan_request, orphan_signature)
                duplicate = writer.post(branch + '.duplicate', orphan_request, orphan_signature,
                                        success=False, error='InvalidNonce()')
                for row in (accepted, duplicate):
                    need(row['transaction'] == shared_transaction, 'IDENTICAL_SIGNED_CALLDATA')
                need(accepted['before'] == result['signing_conditions'][branch]['state'], 'ACCEPTED_PRESTATE')
                need(accepted['after'] == expected_state(branch), 'ACCEPTED_ACCOUNTING')
                need(duplicate['before'] == duplicate['after'] == accepted['after'], 'DUPLICATE_NO_EFFECT')
                need(accepted['receipt']['status'] == '0x1' and duplicate['receipt']['status'] == '0x0'
                     and duplicate['receipt']['logs'] == [], 'ACCEPTED_AND_DUPLICATE_RECEIPTS')
                result['accepted'][branch] = copy.deepcopy(accepted)
                result['duplicate_rejections'][branch] = copy.deepcopy(duplicate)

            submit_pair('left')
            left_end = writer.header('left.end')
            need(int(left_end['number'], 16) == int(ancestor['number'], 16) + 3, 'LEFT_THREE_BLOCKS')
            need(writer.state('left.end_state') == expected_state('left'), 'LEFT_ACCOUNTING')
            writer.retire()
            del writer
            old_read = acquire('left', left_end)
            node.restore_ancestor()
            before = len(node.calls)
            try:
                old_read('eth_chainId', [])
            except RuntimeError as error:
                need(str(error) == 'REORG_RETIRED_LEASE' and len(node.calls) == before, 'OLD_LEASE_REFUSAL')
                result['retired_left_lease_refused_before_transport'] = True
            else:
                raise RuntimeError('OLD_LEASE_SURVIVED')
            writer = Writer(node)
            writer.reg, writer.probe = registry, probe
            need(writer.header('right.restored_ancestor') == ancestor, 'RESTORED_ANCESTOR_HEADER')
            need(writer.state('right.restored_state') == ancestor_state, 'RESTORED_ANCESTOR_STATE')
            result['ancestor_restored_exactly'] = True
            writer.call('right.deposit_one', A, probe, 'deposit(uint256,uint256,uint256)', 1, 0, 1)
            writer.call('right.transfer', A, registry, 'transferFrom(address,address,uint256)', A, B, 1)
            submit_pair('right')
            need(not writer.intents, 'NO_RIGHT_RESIGNING')
            right_end = writer.header('right.end')
            need(int(right_end['number'], 16) == int(ancestor['number'], 16) + 4, 'RIGHT_FOUR_BLOCKS')
            need(right_end['hash'] != left_end['hash'], 'DISTINCT_BRANCH_TIPS')
            need(writer.state('right.end_state') == expected_state('right'), 'RIGHT_ACCOUNTING')
            need(result['accepted']['left']['transaction'] == result['accepted']['right']['transaction'], 'CROSS_BRANCH_EXACT_REPLAY')
            need(result['accepted']['left']['receipt']['blockHash'] != result['accepted']['right']['receipt']['blockHash'], 'DISTINCT_ACCEPTANCE_BLOCKS')
            writer.retire()
            del writer
            last_read = acquire('right', right_end)
            node.finish_reads()
            before = len(node.calls)
            try:
                last_read('eth_chainId', [])
            except RuntimeError as error:
                need(str(error) == 'REORG_RETIRED_LEASE' and len(node.calls) == before, 'CLOSED_LEASE_REFUSAL')
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
            retained = args.output.with_name(args.output.stem + '-incomplete-rpc.json')
            with retained.open('x', encoding='utf-8') as stream:
                json.dump(result['rpc'], stream, ensure_ascii=True, separators=(',', ':'))
            result['rpc'], result['branches'] = [], {}
            result['status'], result['error'] = 'fail', 'OUTPUT_BOUND'
            result['retained_rpc_file'] = retained.name
            encoded = json.dumps(result, ensure_ascii=True, separators=(',', ':')) + '\n'
        with args.output.open('x', encoding='utf-8') as stream:
            stream.write(encoded)
    print(json.dumps({key: result[key] for key in ('status', 'node', 'owned_listener_released')}))
    if result['status'] != 'pass':
        print(result.get('error', 'ORPHAN_REPLAY_FAILED'))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
