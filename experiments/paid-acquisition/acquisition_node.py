"""Owned local node: write phase followed by an irreversible read-only phase.

The two collectors share this transport and one synthetic node. This narrows
acquisition independence to separately authored traversal and normalization.
It does not establish provider independence or authenticate Ethereum consensus.
"""
import copy
import importlib.util
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
path = HERE / '../paid-adversarial/synthetic_node.py'
spec = importlib.util.spec_from_loader('caw_acquisition_synthetic', loader=None)
module = importlib.util.module_from_spec(spec)
module.__file__ = str(path)
sys.modules[spec.name] = module
exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
BASE = module.BASE


class AcquisitionNode(module.SyntheticNode):
    def __init__(self, anvil, work):
        super().__init__(anvil, work)
        self.read_config = None
        self.getters = None

    def seal(self, config, getters):
        if self.read_config is not None:
            raise RuntimeError('ALREADY_READ_ONLY')
        self.read_config = copy.deepcopy(config)
        self.getters = copy.deepcopy(getters)

    def _params(self, method, params):
        c = self.read_config
        if c is None:
            return super()._params(method, params)
        # Never fall through to the write-phase allowlist after handoff.
        if not isinstance(params, list):
            raise RuntimeError('ACQUISITION_PARAMETERS')
        lo, hi = c['start_block_number'], c['end_block_number']
        def block(value):
            return BASE._quantity(value) and lo <= int(value, 16) <= hi
        if method == 'eth_chainId' and params == []:
            return
        if method == 'eth_getBlockByNumber' and len(params) == 2 and block(params[0]) and type(params[1]) is bool:
            return
        if method == 'eth_getBlockByHash' and len(params) == 2 and BASE._hash(params[0]) and params[1] is False:
            return
        if method in ('eth_getTransactionByHash', 'eth_getTransactionReceipt') and len(params) == 1 and BASE._hash(params[0]):
            return
        if method == 'eth_getLogs' and len(params) == 1 and isinstance(params[0], dict):
            f = params[0]
            if set(f) == {'blockHash'} and BASE._hash(f['blockHash']):
                return
            if set(f) == {'fromBlock', 'toBlock'} and block(f['fromBlock']) and block(f['toBlock']) and int(f['fromBlock'], 16) <= int(f['toBlock'], 16):
                return
        if method == 'eth_getCode' and len(params) == 2 and params[0] in c['addresses'].values() and params[1] == hex(hi):
            return
        if method == 'eth_call' and len(params) == 2 and params[1] == hex(hi):
            tx = params[0]
            if isinstance(tx, dict) and set(tx) == {'from', 'to', 'gas', 'gasPrice', 'value', 'data'} and tx['from'] == '0x00000000000000000000000000000000ca180001' and tx['gas'] == '0x3d0900' and tx['gasPrice'] == BASE.GAS_PRICE and tx['value'] == '0x0' and tx['data'] in self.getters.get(tx['to'], ()):
                return
        raise RuntimeError('ACQUISITION_READ_ONLY_SCOPE')
