"""Explicit offline response-switch checks; writes only a new output directory.

No live node, network, wallet or writer import. Reuses the published alpha.28
collector results. Replay observations retain original request IDs and hashes;
missing recorded queries are fixture errors, not observed live-node behavior.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
import types

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def need(condition, code):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode('ascii')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def module(path, name):
    raw = path.read_bytes()
    need(len(raw) < 100000, 'SOURCE_SIZE')
    loaded = types.ModuleType(name)
    loaded.__file__ = str(path)
    sys.modules[name] = loaded
    exec(compile(raw, str(path), 'exec'), loaded.__dict__)
    return loaded


def main(output):
    session = module(ROOT / 'reference/paid_acquisition_session.py', 'race_session')
    replay = module(HERE / 'replay_transport.py', 'race_replay')
    raw = replay.TRACE_PATH.read_bytes()
    need(hashlib.sha256(raw).hexdigest() == replay.TRACE_SHA256, 'TRACE_PIN')
    trace = json.loads(raw)
    configs = {b: trace['branches'][b]['config'] for b in ('left', 'right')}
    cases, controls = [], {}

    def transports(branch='left', **kw):
        return (replay.ReplayTransport('number', branch, **kw), replay.ReplayTransport('hash', branch))

    def attempt(name, owner, token, pair, expected, branch=None):
        before = owner.state()
        result, error = None, None
        try:
            result = owner.acquire(token, *pair)
        except session.SessionError as failure:
            error = failure.code
        state = owner.state()
        need((result is not None) == (expected == 'ready'), name + '_OUTCOME')
        need(not state['busy'], name + '_BUSY')
        if expected == 'ready':
            need(state['status'] == 'ready' and state['current'] == result, name + '_PUBLICATION')
            need(result['history'] == trace['branches'][branch]['collectors']['number']['history'], name + '_HISTORY')
            need(result['manifest'] == trace['branches'][branch]['collectors']['hash']['manifest'], name + '_MANIFEST')
            retained = json.loads((ROOT / ('experiments/paid-reorg/reconstruction-python-' + branch + '-number.json')).read_bytes())
            need(result['result'] == retained, name + '_ACCOUNTING')
            if branch not in controls:
                controls[branch] = copy.deepcopy(result['result'])
            need(result['result'] == controls[branch], name + '_CLEAN_REBUILD')
        else:
            need(state['status'] == 'unresolved' and state['current'] is None and error is not None, name + '_UNRESOLVED')
        row = {'name': name, 'expected': expected, 'status': 'pass', 'error': error,
            'before': {k: before[k] for k in ('generation', 'status', 'attempts', 'calls')},
            'after': {k: state[k] for k in ('generation', 'status', 'attempts', 'calls', 'response_bytes', 'error')},
            'selected_end_hash': state['selected']['end_block_hash'] if state['selected'] else None,
            'result_sha256': digest(result['result']) if result is not None else None,
            'branch': branch, 'transports': [p.report() for p in pair]}
        cases.append(row)
        return result, row

    for branch in ('left', 'right'):
        owner = session.AcquisitionSession()
        selected = copy.deepcopy(configs[branch])
        token = owner.select(selected)
        selected['end_block_hash'] = '0x' + 'f' * 64
        result, row = attempt('stable-' + branch, owner, token, transports(branch), 'ready', branch)
        need([p['count'] for p in row['transports']] == [60, 87], 'CONTROL_COUNTS')
        result['result']['credits'][0] = '0'
        snapshot = owner.state()
        snapshot['current']['result']['credits'][0] = '0'
        need(owner.state()['current']['result'] == controls[branch], 'DETACHED_RESULT')
        # An already consumed or forged token cannot change a ready publication.
        for invalid in (token, object(), None):
            try:
                owner.acquire(invalid, *transports(branch))
                need(False, 'TOKEN_REUSE')
            except session.SessionError as error:
                need(error.code == 'ACQUISITION_SESSION_STALE_TOKEN', 'TOKEN_REUSE_CODE')
        need(owner.state()['current']['result'] == controls[branch], 'READY_PRESERVED')
        row['detached_copies_and_consumed_tokens_checked'] = True
        if branch == 'left':
            token = owner.select(configs['right'])
            need(owner.state()['current'] is None, 'READY_INVALIDATED_BEFORE_REFRESH')
            attempt('ready-refresh-fails', owner, token, transports('left'), 'unresolved')
            token = owner.select(configs['right'])
            attempt('ready-refresh-fresh-right', owner, token, transports('right'), 'ready', 'right')
        else:
            try:
                owner.select({})
                need(False, 'INVALID_REFRESH')
            except session.SessionError:
                need(owner.state()['current'] is None and owner.state()['selected'] is None, 'INVALID_REFRESH_CLEARS_READY')

    # Semantic boundaries are explicit: selected end is the third request;
    # both unchanged collectors repeat it at their own final boundary.
    for name, strategy, phase in (
        ('before-initial-end', 'number', 'initial'),
        ('number-interior-switch', 'number', 'interior'),
        ('hash-interior-missing-recorded-orphan', 'hash', 'interior'),
        ('number-final-boundary-switch', 'number', 'collector-final'),
        ('hash-final-boundary-switch', 'hash', 'collector-final'),
        ('number-coordinator-final-switch', 'number', 'coordinator-final'),
        ('hash-coordinator-final-switch', 'hash', 'coordinator-final')):
        owner = session.AcquisitionSession()
        token = owner.select(configs['left'])
        target_end_occurrence = {'initial': 1, 'collector-final': 2, 'coordinator-final': 3}.get(phase)
        calls = {'end': 0, 'switched': False}

        class Controlled:
            def __init__(self):
                self.inner = replay.ReplayTransport(strategy)
            def __call__(self, method, params):
                if method == 'eth_getBlockByNumber' and params == [hex(configs['left']['end_block_number']), False]:
                    calls['end'] += 1
                boundary = target_end_occurrence is not None and calls['end'] == target_end_occurrence
                interior = phase == 'interior' and self.inner.count == 3
                if not calls['switched'] and (boundary or interior):
                    self.inner.set_branch('right')
                    calls['switched'] = True
                return self.inner(method, params)
            def report(self):
                return self.inner.report()
        pair = list(transports())
        pair[0 if strategy == 'number' else 1] = Controlled()
        _, row = attempt(name, owner, token, pair, 'unresolved')
        need(calls['switched'], name + '_SWITCH_REACHED')
        row['trigger'] = {'strategy': strategy, 'phase': phase, 'end_occurrence': target_end_occurrence}
        if phase == 'coordinator-final':
            need(row['after']['error']['stage'] == 'final_boundaries', 'COORDINATOR_STAGE')
            need(row['error'] == 'ACQUISITION_SESSION_FINAL_BOUNDARY', 'COORDINATOR_ERROR')
        if name == 'hash-interior-missing-recorded-orphan':
            need(pair[1].report()['observations'][-1].get('error') == 'REPLAY_MISSING_RESPONSE', 'EXPLICIT_REPLAY_MISS')
        else:
            need(not any(o.get('error') for p in row['transports'] for o in p['observations']), name + '_NO_REPLAY_MISS')
        if phase != 'coordinator-final':
            need(row['after']['error']['stage'] == strategy and row['error'] == 'ACQUISITION_SESSION_REJECTED', name + '_FAILURE_STAGE')

    # Invalidate a response already captured, just before it is returned. The
    # latest selection survives both a late result and a late transport error.
    for name, at_strategy, at_call, late_error in (
        ('selection-during-first-response', 'number', 1, False),
        ('selection-before-final-return', 'hash', 87, False),
        ('selection-with-late-transport-error', 'number', 1, True)):
        owner, selected = session.AcquisitionSession(), {}
        token = owner.select(configs['left'])
        def hook(transport, observation):
            if observation['call'] == at_call:
                selected['token'] = owner.select(configs['right'])
                need(owner.state()['current'] is None, 'IMMEDIATE_INVALIDATION')
                try:
                    owner.acquire(selected['token'], lambda *_: None, lambda *_: None)
                    need(False, 'NESTED_ATTEMPT')
                except session.SessionError as error:
                    need(error.code == 'ACQUISITION_SESSION_BUSY', 'SERIAL_ATTEMPTS')
                selected['hook_completed'] = True
                if late_error:
                    raise RuntimeError('controlled late transport exception')
        pair = list(transports())
        pair[0 if at_strategy == 'number' else 1] = replay.ReplayTransport(at_strategy, after_response=hook)
        _, row = attempt(name, owner, token, pair, 'unresolved')
        need(selected.get('hook_completed') is True, 'HOOK_ASSERTIONS_COMPLETED')
        need(row['error'] == ('ACQUISITION_SESSION_REJECTED' if late_error else 'ACQUISITION_SESSION_SUPERSEDED'), 'SELECTION_FAILURE_CODE')
        need(owner.state()['selected'] == configs['right'] and owner.state()['error'] is None, 'NEW_SELECTION_PRESERVED')
        row['trigger'] = {'strategy': at_strategy, 'after_response_call': at_call, 'late_error': late_error}
        _, recovered = attempt(name + '-fresh-right', owner, selected['token'], transports('right'), 'ready', 'right')
        need(recovered['after']['calls'] - recovered['before']['calls'] == 147, 'FRESH_COMPLETE_RETRY')

    owner = session.AcquisitionSession()
    for n in range(4):
        token = owner.select(configs['left'])
        _, row = attempt('bounded-failed-attempt-' + str(n + 1), owner, token, transports('right'), 'unresolved')
        need(row['after']['attempts'] == n + 1 and row['after']['calls'] == (n + 1) * 3, 'CUMULATIVE_BUDGET')
    token = owner.select(configs['right'])
    _, row = attempt('attempt-limit', owner, token, transports('right'), 'unresolved')
    need(row['error'] == 'ACQUISITION_SESSION_ATTEMPT_LIMIT' and row['after']['calls'] == 12, 'ATTEMPT_LIMIT')

    owner = session.AcquisitionSession()
    for _ in range(32):
        owner.select(configs['left'])
    try:
        owner.select(configs['right'])
        need(False, 'SELECTION_LIMIT')
    except session.SessionError as error:
        need(error.code == 'ACQUISITION_SESSION_SELECTION_LIMIT', 'SELECTION_LIMIT_CODE')
    need(owner.state()['current'] is None and owner.state()['selected'] is None, 'INVALID_SELECTION_CLEARS')
    for cancellation in (KeyboardInterrupt, SystemExit):
        fresh = session.AcquisitionSession()
        token = fresh.select(configs['left'])
        def cancel(*_):
            raise cancellation()
        try:
            fresh.acquire(token, cancel, cancel)
            need(False, 'CANCELLATION_PROPAGATES')
        except cancellation:
            pass
        state = fresh.state()
        need(not state['busy'] and state['current'] is None and state['error']['code'] == 'ACQUISITION_SESSION_INTERRUPTED', 'CANCELLATION_CLEANUP')
        try:
            fresh.acquire(token, cancel, cancel)
            need(False, 'CANCELLED_TOKEN_REUSE')
        except session.SessionError as error:
            need(error.code == 'ACQUISITION_SESSION_STALE_TOKEN', 'CANCELLED_TOKEN_EXPIRED')
    malformed = [None, {}, {**configs['left'], 'start_block_number': True},
        {**configs['left'], 'end_block_number': 130}, {**configs['left'], 'chain_id': 1}]
    for value in malformed:
        fresh = session.AcquisitionSession()
        try:
            fresh.select(value)
            need(False, 'MALFORMED_SELECTION')
        except session.SessionError:
            need(fresh.state()['status'] == 'unresolved' and fresh.state()['selected'] is None, 'MALFORMED_STATE')
    cyclic = []; cyclic.append(cyclic)
    class Custom(dict):
        def items(self):
            raise RuntimeError('must not run subclass hook')
    for value in (cyclic, Custom(), float('nan'), 'x' * 262145, [0] * 4097):
        try:
            session.capture(value)
            need(False, 'BOUNDED_PLAIN_DATA')
        except session.SessionError:
            pass

    source_paths = ['reference/paid_acquisition_session.py', 'experiments/paid-acquisition-race/replay_transport.py',
        'experiments/paid-acquisition-race/check_race.py', 'experiments/paid-reorg/execution-trace.json',
        'experiments/paid-reorg/reconstruction-python-left-number.json', 'experiments/paid-reorg/reconstruction-python-right-number.json']
    source_paths += [str((ROOT / 'reference' / p).resolve().relative_to(ROOT)).replace('\\', '/') for p in session.INPUTS]
    report = {'schema': 'caw-paid-acquisition-race-check/1', 'status': 'pass', 'replay_only': True,
        'network_requests': 0, 'new_live_node': False, 'independent_providers': False, 'authenticates_consensus': False,
        'source_sha256': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in source_paths},
        'cases': cases, 'case_count': len(cases), 'control_result_sha256': {b: digest(r) for b, r in controls.items()},
        'additional_checks': ['detached selection and state copies', 'consumed and forged tokens',
            'serial acquisition busy guard', 'four-attempt aggregate limit', '32-selection limit',
            'KeyboardInterrupt and SystemExit retire the active token',
            'malformed selections', 'cycles, subclasses, nonfinite numbers, string and array bounds'],
        'limitations': ['recorded response switching, not concurrent live-node acquisition',
            'two strategies over one captured node, not independent providers',
            'explicit caller selection; no chain-choice rule, consensus or finality',
            'missing replay queries do not establish orphan availability',
            'unobserved ABA and changes after the last read may escape detection',
            'transport enforces I/O timeout; wrapper checks time only around callbacks',
            'call/byte/deadline constants are caps, not all exhausted by these fixtures']}
    payload = canonical(report) + b'\n'
    need(len(payload) <= 1024 * 1024, 'REPORT_BOUND')
    output.mkdir(parents=True, exist_ok=False)
    (output / 'replay-report.json').write_bytes(payload)
    for branch, result in controls.items():
        (output / ('result-' + branch + '.json')).write_bytes(canonical(result) + b'\n')
    print(json.dumps({'status': 'pass', 'cases': len(cases), 'report_bytes': len(payload), 'replay_only': True, 'network_requests': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    main(args.output_dir)
