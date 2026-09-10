"""Phased, synthetic-only branch experiment over unchanged resource guards.

Read leases expire permanently. This constrains reviewed code in one process;
it is not isolation against a hostile collector or an Ethereum finality rule.
The earlier AcquisitionNode seal and all retained guard sources are unchanged.
"""
import copy
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
path = HERE / '../paid-acquisition/acquisition_node.py'
spec = importlib.util.spec_from_loader('caw_reorg_acquisition_scope', loader=None)
module = importlib.util.module_from_spec(spec)
module.__file__ = str(path)
sys.modules[spec.name] = module
exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)


class ReorgNode(module.module.SyntheticNode):
    def __init__(self, anvil, work):
        super().__init__(anvil, work)
        self.phase = 'prefix'
        self.generation = 0
        self._scope = None
        self._lease_active = False
        self._control = None
        self._ancestor_snapshot = None
        self.transitions = []

    def _phase(self, phase):
        self.transitions.append({'from': self.phase, 'to': phase,
                                 'after_request_id': self._request_id})
        self.phase = phase
        self.generation += 1

    def snapshot_ancestor(self):
        if self.phase != 'prefix' or self._ancestor_snapshot is not None:
            raise RuntimeError('REORG_SNAPSHOT_PHASE')
        self._control = 'evm_snapshot'
        try:
            self._ancestor_snapshot = self.rpc('controller.snapshot', 'evm_snapshot', [])
        finally:
            self._control = None
        self._phase('write-left')
        return self._ancestor_snapshot

    def begin_read(self, branch, config, getters):
        if branch not in ('left', 'right') or self.phase != 'write-' + branch:
            raise RuntimeError('REORG_READ_PHASE')
        # A new immutable-by-convention scope; never reopen AcquisitionNode.
        self._scope = SimpleNamespace(read_config=copy.deepcopy(config), getters=copy.deepcopy(getters))
        self._phase('read-' + branch)

    def read_lease(self, name):
        if self.phase not in ('read-left', 'read-right') or name not in ('number', 'hash'):
            raise RuntimeError('REORG_LEASE_PHASE')
        generation, phase = self.generation, self.phase
        first = len(self.calls)

        def read(method, params):
            if self.generation != generation or self.phase != phase:
                raise RuntimeError('REORG_RETIRED_LEASE')
            if self._lease_active:
                raise RuntimeError('REORG_NESTED_LEASE')
            self._lease_active = True
            try:
                return self.rpc('collector.' + phase[5:] + '.' + name + '.' + str(len(self.calls) - first), method, params)
            finally:
                self._lease_active = False
        return read

    def restore_ancestor(self):
        if self.phase != 'read-left' or self._ancestor_snapshot is None or self._lease_active:
            raise RuntimeError('REORG_RESTORE_PHASE')
        self._phase('switch-at-ancestor')
        self._control = 'evm_revert'
        try:
            restored = self.rpc('controller.restore', 'evm_revert', [self._ancestor_snapshot])
            if restored is not True:
                raise RuntimeError('REORG_RESTORE_FAILED')
            self._ancestor_snapshot = None
        finally:
            self._control = None
        self._phase('write-right')

    def finish_reads(self):
        if self.phase != 'read-right' or self._lease_active:
            raise RuntimeError('REORG_CLOSE_PHASE')
        self._phase('closed')

    def _params(self, method, params):
        if method in ('evm_snapshot', 'evm_revert'):
            wanted = 'prefix' if method == 'evm_snapshot' else 'switch-at-ancestor'
            if self.phase != wanted or self._control != method:
                raise RuntimeError('REORG_CONTROLLER_ONLY')
            return super()._params(method, params)
        if self.phase.startswith('read-'):
            if not self._lease_active:
                raise RuntimeError('REORG_READ_LEASE_REQUIRED')
            return module.AcquisitionNode._params(self._scope, method, params)
        if self.phase in ('switch-at-ancestor', 'closed'):
            raise RuntimeError('REORG_PHASE_CLOSED')
        return super()._params(method, params)
