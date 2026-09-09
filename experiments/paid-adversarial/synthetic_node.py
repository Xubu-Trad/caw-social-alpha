"""Strictly local synthetic adapter for the retained bounded node guard.

Only one extra RPC is allowed: install the exact retained synthetic token runtime
at its test address on this fresh empty chain. No fork or remote proxy is used.
The historical paid-action node source and its resource limits remain unchanged.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_guard():
    path = HERE / '../paid-action/paid_node.py'
    spec = importlib.util.spec_from_loader('caw_adversarial_base_node', loader=None)
    module = importlib.util.module_from_spec(spec)
    module.__file__ = str(path)
    sys.modules[spec.name] = module
    exec(compile(path.read_bytes(), str(path), 'exec'), module.__dict__)
    return module


BASE = load_guard()


class SyntheticNode(BASE.Node):
    def __init__(self, anvil, work):
        super().__init__(anvil, 'synthetic', work)
        fixture = json.loads((HERE / '../account-authority/account-token-build.json').read_bytes())
        self.synthetic_runtime = fixture['runtime']
        raw = bytes.fromhex(self.synthetic_runtime[2:])
        if hashlib.sha256(raw).hexdigest() != BASE.RUNTIME_SHA256:
            raise RuntimeError('SYNTHETIC_RUNTIME_PIN')
        self.installed = False

    def _start_proxy(self):
        raise RuntimeError('SYNTHETIC_PROXY_FORBIDDEN')

    def _params(self, method, params):
        if method == 'anvil_setCode':
            if (self.mode != 'synthetic' or self.installed or
                    params != [BASE.TOKEN, self.synthetic_runtime]):
                raise RuntimeError('SYNTHETIC_CODE_SCOPE')
            return
        return super()._params(method, params)

    def install_token(self):
        if self.rpc('synthetic_empty_token', 'eth_getCode', [BASE.TOKEN, 'latest']) != '0x':
            raise RuntimeError('SYNTHETIC_CHAIN_NOT_EMPTY')
        self.rpc('install_synthetic_token', 'anvil_setCode', [BASE.TOKEN, self.synthetic_runtime])
        self.installed = True
        if self.rpc('installed_token', 'eth_getCode', [BASE.TOKEN, 'latest']) != self.synthetic_runtime:
            raise RuntimeError('SYNTHETIC_RUNTIME_READBACK')
