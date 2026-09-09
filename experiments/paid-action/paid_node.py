"""Bounded local Anvil runner. No real wallet or remote transaction transport. Test signing is in the runner.

Explicitly invoked support for the original custody experiment; never imported by
the website. Fork reads pass through a fixed, read-only historical-state proxy.
Synthetic code replacement and native-gas/authority overrides are recorded.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import threading
import time
import urllib.request

ANVIL_SHA256 = 'c6e29da1b010fe00bac6c0dc5c29484bd641deb5a84050aea10d13e9dc4fe26f'
ANVIL_BYTES = 41583616
FIXTURE_SHA256 = '55a07478fa4673c9d48d4f5905b1b73cc540e6bac90b023cec705cf80562129f'
RUNTIME_SHA256 = '82ce425aec55509ecb5c3ebb083a9254cc503ad209a531f57ff92ee873e68e14'
TOKEN = '0xf3b9569f82b18aef890de263b84189bd33ebe452'
BLOCK = '0x18bc1ea'
BLOCK_HASH = '0xf3e3dfad2242562dbed62de90831c39eace7c7c6e88f8c509afccef9a5f73e4d'
STATE_ROOT = '0x6d530d69c70f41b4b1a57f39751336304ff7c2c5d45e4dcd946869ecce4c0152'
ACTORS = frozenset(('0x765d03fe39e2a0a48ac162a15b541c3cd1d63e76',
                    '0x47ecac8221f18970c48cf48aaa3cbe8167bbbe73',
                    '0x000000000000000000000000000000000000dead',
                    '0x00000000000000000000000000000000ca180001'))
LOCAL_URL = 'http://127.0.0.1:18545'
REMOTE_URL = 'https://eth.drpc.org'
MAX_RESPONSE = 1024 * 1024
MAX_REQUEST = 64 * 1024
MAX_TRACE = 4 * 1024 * 1024
MEMORY_LIMIT = 512 * 1024 * 1024
GAS_PRICE = '0x174876e800'
_HEX = re.compile(r'0x(?:[0-9a-f]{2})*\Z')
_ADDRESS = re.compile(r'0x[0-9a-f]{40}\Z')
_HASH = re.compile(r'0x[0-9a-f]{64}\Z')
_QUANTITY = re.compile(r'0x(?:0|[1-9a-f][0-9a-f]*)\Z')


def _fail(code):
    raise RuntimeError(code)


def _quantity(value, maximum=(1 << 256) - 1):
    return isinstance(value, str) and bool(_QUANTITY.fullmatch(value)) and int(value, 16) <= maximum


def _address(value):
    return isinstance(value, str) and bool(_ADDRESS.fullmatch(value))


def _hash(value):
    return isinstance(value, str) and bool(_HASH.fullmatch(value))


def _pinned_block(value):
    # EIP-1898 pins the same historical state by hash. No latest/pending reads.
    return value == BLOCK or (isinstance(value, dict)
        and set(value) == {'blockHash', 'requireCanonical'}
        and value['blockHash'] == BLOCK_HASH and type(value['requireCanonical']) is bool)


def _json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                _fail('JSON_DUPLICATE_FIELD')
            result[key] = value
        return result
    def invalid(_):
        _fail('JSON_NONFINITE')
    return json.loads(data, object_pairs_hook=unique, parse_constant=invalid)


def _encoded(data):
    return json.dumps(data, ensure_ascii=True, separators=(',', ':'), allow_nan=False).encode('ascii')


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _fail('REDIRECT_REFUSED')


def _post_request(url, body, cancelled):
    raw = _encoded(body)
    if len(raw) > MAX_REQUEST:
        _fail('REQUEST_LIMIT')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    request = urllib.request.Request(url, data=raw, method='POST', headers={
        'Content-Type': 'application/json', 'User-Agent': 'CAW-local-custody/1',
        'Accept-Encoding': 'identity'})
    with opener.open(request, timeout=10) as response:
        if cancelled.is_set():
            _fail('REQUEST_DEADLINE')
        if response.status != 200 or response.headers.get('Content-Encoding', 'identity') != 'identity':
            _fail('HTTP_RESPONSE_REFUSED')
        content = response.read(MAX_RESPONSE + 1)
    if len(content) > MAX_RESPONSE:
        _fail('RESPONSE_LIMIT')
    result = _json(content)
    if (not isinstance(result, dict) or set(result) - {'jsonrpc', 'id', 'result', 'error'}
            or result.get('jsonrpc') != '2.0' or type(result.get('id')) is not type(body['id'])
            or result.get('id') != body['id'] or ('result' in result) == ('error' in result)):
        _fail('RPC_ENVELOPE')
    return result, content.decode('utf-8', errors='strict')


def _post(url, body):
    # urllib timeouts are per blocking socket operation. Bound the whole caller
    # wait independently; an overrun closes the experiment, without any retry.
    outcome = queue.Queue(maxsize=1)
    cancelled = threading.Event()
    def run():
        try:
            outcome.put((True, _post_request(url, body, cancelled)))
        except Exception:
            outcome.put((False, None))
    threading.Thread(target=run, daemon=True).start()
    try:
        succeeded, value = outcome.get(timeout=10)
    except queue.Empty:
        cancelled.set()
        _fail('REQUEST_DEADLINE')
    if not succeeded:
        _fail('HTTP_REQUEST_FAILED')
    return value


class _WindowsGuard:
    """Own-process Job Object, memory readings, and exact loopback listener PID."""
    def __init__(self):
        if os.name != 'nt':
            _fail('WINDOWS_REQUIRED')
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.psapi = ctypes.WinDLL('psapi', use_last_error=True)
        self.ip = ctypes.WinDLL('iphlpapi', use_last_error=True)
        self.job = None
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
            ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        self.kernel.CreateFileW.restype = wintypes.HANDLE
        self.psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
        self.ip.GetExtendedTcpTable.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOL,
                                               wintypes.ULONG, ctypes.c_int, wintypes.ULONG]

    def open_binary(self, path):
        import msvcrt
        # Keep a read-only share lock until process cleanup: no replacement or
        # writer can alter the bytes between the hash check and process launch.
        handle = self.kernel.CreateFileW(str(path), 0x80000000, 0x1, None, 3, 0x80, None)
        if handle in (None, ctypes.c_void_p(-1).value):
            _fail('ANVIL_READ_LOCK_FAILED')
        try:
            descriptor = msvcrt.open_osfhandle(int(handle), os.O_RDONLY | os.O_BINARY)
        except Exception:
            self.kernel.CloseHandle(handle)
            raise RuntimeError('ANVIL_READ_LOCK_FAILED') from None
        return os.fdopen(descriptor, 'rb')

    def available(self):
        class Memory(ctypes.Structure):
            _fields_ = [('length', wintypes.DWORD), ('load', wintypes.DWORD)] + [
                (name, ctypes.c_ulonglong) for name in ('total', 'available', 'page_total', 'page_available',
                                                       'virtual_total', 'virtual_available', 'extended')]
        info = Memory()
        info.length = ctypes.sizeof(info)
        if not self.kernel.GlobalMemoryStatusEx(ctypes.byref(info)):
            _fail('MEMORY_QUERY_FAILED')
        return info.available

    def attach(self, process):
        class Basic(ctypes.Structure):
            _fields_ = [('per_process_time', ctypes.c_longlong), ('per_job_time', ctypes.c_longlong),
                        ('flags', wintypes.DWORD), ('minimum_working_set', ctypes.c_size_t),
                        ('maximum_working_set', ctypes.c_size_t), ('active_process_limit', wintypes.DWORD),
                        ('affinity', ctypes.c_size_t), ('priority', wintypes.DWORD), ('scheduling', wintypes.DWORD)]
        class IO(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in
                        ('read_operations', 'write_operations', 'other_operations', 'read_bytes', 'write_bytes', 'other_bytes')]
        class Extended(ctypes.Structure):
            _fields_ = [('basic', Basic), ('io', IO), ('process_memory', ctypes.c_size_t),
                        ('job_memory', ctypes.c_size_t), ('peak_process', ctypes.c_size_t), ('peak_job', ctypes.c_size_t)]
        limits = Extended()
        limits.basic.flags = 0x2000 | 0x100 | 0x8  # kill-on-close, process memory, one process
        limits.basic.active_process_limit = 1
        limits.process_memory = MEMORY_LIMIT
        self.job = self.kernel.CreateJobObjectW(None, None)
        if not self.job or not self.kernel.SetInformationJobObject(self.job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            _fail('JOB_LIMIT_FAILED')
        if not self.kernel.AssignProcessToJobObject(self.job, wintypes.HANDLE(int(process._handle))):
            _fail('JOB_ASSIGN_FAILED')

    def memory(self, process):
        class Counters(ctypes.Structure):
            _fields_ = [('cb', wintypes.DWORD), ('faults', wintypes.DWORD)] + [
                (name, ctypes.c_size_t) for name in ('peak_working_set', 'working_set', 'peak_paged', 'paged',
                                                   'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile', 'private')]
        info = Counters()
        info.cb = ctypes.sizeof(info)
        if not self.psapi.GetProcessMemoryInfo(wintypes.HANDLE(int(process._handle)), ctypes.byref(info), info.cb):
            _fail('PROCESS_MEMORY_QUERY_FAILED')
        return max(info.working_set, info.private)

    def listener_owned(self, pid):
        size = wintypes.DWORD(0)
        status = self.ip.GetExtendedTcpTable(None, ctypes.byref(size), False, socket.AF_INET, 3, 0)
        if status not in (0, 122) or size.value > 4 * 1024 * 1024:
            _fail('LISTENER_QUERY_FAILED')
        data = ctypes.create_string_buffer(size.value)
        if self.ip.GetExtendedTcpTable(data, ctypes.byref(size), False, socket.AF_INET, 3, 0):
            _fail('LISTENER_QUERY_FAILED')
        count = struct.unpack_from('<I', data.raw)[0]
        if 4 + count * 24 > size.value:
            _fail('LISTENER_QUERY_FAILED')
        matches = []
        for offset in range(4, 4 + count * 24, 24):
            state, address, port, _, _, owner = struct.unpack_from('<6I', data.raw, offset)
            if state == 2 and socket.ntohs(port & 0xffff) == 18545:
                matches.append((socket.inet_ntoa(struct.pack('<I', address)), owner))
        return matches == [('127.0.0.1', pid)]

    def close(self):
        if self.job:
            self.kernel.CloseHandle(self.job)
            self.job = None


class _ProxyServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True
    block_on_close = False

    def __init__(self, *args):
        self._clients, self._clients_lock = set(), threading.Lock()
        self._slots = threading.BoundedSemaphore(8)
        super().__init__(*args)

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(10)
        with self._clients_lock:
            self._clients.add(connection)
        return connection, address

    def process_request(self, request, client_address):
        if not self._slots.acquire(blocking=False):
            self.close_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()

    def close_request(self, request):
        with self._clients_lock:
            self._clients.discard(request)
        super().close_request(request)

    def server_close(self):
        with self._clients_lock:
            clients = list(self._clients)
        for connection in clients:
            try:
                connection.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            connection.close()
        super().server_close()


class Node:
    def __init__(self, anvil: Path, mode: str, work: Path):
        if mode not in ('fork', 'synthetic'):
            _fail('MODE_REFUSED')
        self.anvil, self.mode, self.work = Path(anvil), mode, Path(work)
        self.calls, self.remote_calls, self.overrides = [], [], []
        self.process = self.guard = self.proxy = None
        self._binary_file = None
        self.started = self.finished = None
        self.stop_reason = None
        self.peak_memory = self.output_bytes = self.trace_bytes = self.transaction_count = 0
        self._lock, self._stop_event = threading.Lock(), threading.Event()
        self._threads = []
        self._request_id = 0
        self._remote_count = 0
        self._entered = False
        self._snapshot_ids = set()

    def _record(self, collection, entry):
        size = len(_encoded(entry))
        with self._lock:
            if self.trace_bytes + size > MAX_TRACE:
                _fail('TRACE_LIMIT')
            self.trace_bytes += size
            collection.append(entry)

    def _halt(self, reason):
        with self._lock:
            if self.stop_reason is None:
                self.stop_reason = reason
        self._stop_event.set()
        if self.process and self.process.poll() is None:
            self.process.kill()

    def _watch(self):
        while not self._stop_event.wait(0.1):
            if self.process.poll() is not None:
                self._halt('NODE_EXITED')
                return
            if time.monotonic() - self.started > 600:
                self._halt('WALL_TIME_LIMIT')
                return
            try:
                memory = self.guard.memory(self.process)
                self.peak_memory = max(self.peak_memory, memory)
                if memory > MEMORY_LIMIT:
                    self._halt('PROCESS_MEMORY_LIMIT')
                    return
            except Exception:
                self._halt('PROCESS_MONITOR_FAILED')
                return

    def _drain(self, stream, private_log):
        try:
            with private_log.open('xb') as output:
                while chunk := stream.read(8192):
                    with self._lock:
                        room = max(0, MAX_RESPONSE - self.output_bytes)
                        self.output_bytes += len(chunk)
                        over = self.output_bytes > MAX_RESPONSE
                        output.write(chunk[:room])
                        output.flush()
                    if over:
                        self._halt('OUTPUT_LIMIT')
                        return
        except Exception:
            self._halt('PRIVATE_LOG_FAILED')
        finally:
            stream.close()

    def _live(self):
        if self.stop_reason:
            _fail(self.stop_reason)
        if not self.process or self.process.poll() is not None:
            _fail('NODE_NOT_RUNNING')
        if not self.guard.listener_owned(self.process.pid):
            _fail('LOOPBACK_LISTENER_NOT_OWNED')

    def _remote_params(self, method, params):
        if method in ('eth_chainId', 'net_version'):
            return params == []
        if method == 'eth_getBlockByNumber':
            return len(params) == 2 and params[0] == BLOCK and type(params[1]) is bool
        if method == 'eth_getBlockByHash':
            return len(params) == 2 and params[0] == BLOCK_HASH and type(params[1]) is bool
        if method in ('eth_getCode', 'eth_getBalance', 'eth_getTransactionCount'):
            return len(params) == 2 and _address(params[0]) and _pinned_block(params[1])
        if method == 'eth_getStorageAt':
            return len(params) == 3 and _address(params[0]) and (_quantity(params[1]) or _hash(params[1])) and _pinned_block(params[2])
        return False

    def _upstream(self, body, request_bytes):
        # Capture the original envelope. Anvil omits params for eth_chainId;
        # only the two parameter-free identity reads may receive an explicit [].
        # State-read parameters and all batches remain subject to exact gates.
        entry = {'request': body, 'forwarded': False,
                 'request_body_sha256': hashlib.sha256(request_bytes).hexdigest(),
                 'request_shape': {'type': type(body).__name__,
                    'keys': list(body) if isinstance(body, dict) else None,
                    'items': len(body) if isinstance(body, list) else None}}
        try:
            if (isinstance(body, dict) and set(body) == {'jsonrpc', 'id', 'method'}
                    and body.get('method') in ('eth_chainId', 'net_version')):
                body = {**body, 'params': []}
                entry['forwarded_request'] = body
                entry['normalization'] = 'EXPLICIT_EMPTY_IDENTITY_PARAMETERS'
            if (isinstance(body, dict) and set(body) == {'jsonrpc', 'id', 'method', 'params'}
                    and body.get('method') == 'anvil_nodeInfo' and body.get('params') is None):
                # Anvil's optional capability probe is answered locally as
                # unsupported. It is never sent to the public provider.
                body = {**body, 'params': []}
                entry['normalization'] = 'LOCAL_UNSUPPORTED_CAPABILITY'
            if (not isinstance(body, dict) or set(body) != {'jsonrpc', 'id', 'method', 'params'}
                    or body['jsonrpc'] != '2.0' or type(body['id']) not in (int, str)
                    or not isinstance(body['method'], str) or not isinstance(body['params'], list)):
                _fail('PROXY_ENVELOPE_REFUSED')
            with self._lock:
                self._remote_count += 1
                over_limit = self._remote_count > 200
            if over_limit:
                self._halt('UPSTREAM_REQUEST_LIMIT')
                _fail('UPSTREAM_REQUEST_LIMIT')
            allowed = self._remote_params(body['method'], body['params'])
            entry['forwarded'] = allowed
            if not allowed:
                result = {'jsonrpc': '2.0', 'id': body['id'], 'error': {'code': -32601, 'message': 'Read-only historical proxy refused method or parameters'}}
                raw = _encoded(result).decode('ascii')
            else:
                result, raw = _post(REMOTE_URL, body)
                if 'result' in result:
                    value = result['result']
                    if body['method'] == 'eth_chainId' and value != '0x1':
                        _fail('UPSTREAM_CHAIN_MISMATCH')
                    if body['method'] == 'net_version' and value != '1':
                        _fail('UPSTREAM_CHAIN_MISMATCH')
                    if body['method'].startswith('eth_getBlockBy') and (not isinstance(value, dict)
                            or value.get('number') != BLOCK or value.get('hash') != BLOCK_HASH
                            or value.get('stateRoot') != STATE_ROOT):
                        _fail('UPSTREAM_BLOCK_MISMATCH')
            entry['response'] = result
            entry['raw_response'] = raw
            return result
        except Exception as error:
            code = str(error) if isinstance(error, RuntimeError) else 'UPSTREAM_READ_FAILED'
            entry['failure'] = code if re.fullmatch(r'[A-Z0-9_]{1,96}', code) else 'UPSTREAM_READ_FAILED'
            entry['request_body_hex'] = request_bytes.hex()
            entry['transport_error'] = 'UPSTREAM_READ_FAILED'
            raise RuntimeError('UPSTREAM_READ_FAILED') from None
        finally:
            self._record(self.remote_calls, entry)

    def _start_proxy(self):
        node = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                self.connection.settimeout(10)
                response = {'jsonrpc': '2.0', 'id': None, 'error': {'code': -32600, 'message': 'Proxy request refused'}}
                raw = b''
                delegated = False
                try:
                    size = self.headers.get('Content-Length', '')
                    if (self.path != '/' or self.headers.get('Transfer-Encoding') is not None
                            or not size.isdigit() or not 0 < int(size) <= MAX_REQUEST):
                        _fail('PROXY_REQUEST_REFUSED')
                    raw = self.rfile.read(int(size))
                    if len(raw) != int(size):
                        _fail('PROXY_REQUEST_REFUSED')
                    body = _json(raw)
                    delegated = True
                    response = node._upstream(body, raw)
                except Exception as error:
                    if not delegated:
                        code = str(error) if isinstance(error, RuntimeError) else 'PROXY_BODY_PARSE_FAILED'
                        node._record(node.remote_calls, {'request': None, 'forwarded': False,
                            'failure': code if re.fullmatch(r'[A-Z0-9_]{1,96}', code) else 'PROXY_REQUEST_REFUSED',
                            'request_body_hex': raw.hex(),
                            'request_body_sha256': hashlib.sha256(raw).hexdigest(),
                            'http_shape': {'expected_path': self.path == '/',
                                'content_length': self.headers.get('Content-Length', '')[:128],
                                'transfer_encoding_present': self.headers.get('Transfer-Encoding') is not None}})
                    node._halt('PROXY_READ_FAILED')
                encoded = _encoded(response)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
        self.proxy = _ProxyServer(('127.0.0.1', 18546), Handler)
        thread = threading.Thread(target=self.proxy.serve_forever, kwargs={'poll_interval': 0.1}, daemon=True)
        self._threads.append(thread)
        thread.start()

    def __enter__(self):
        if self._entered:
            _fail('NODE_CONTEXT_REUSED')
        self._entered = True
        try:
            self.guard = _WindowsGuard()
            if self.guard.available() < 768 * 1024 * 1024:
                _fail('STARTUP_MEMORY_FLOOR')
            self.anvil = self.anvil.resolve(strict=True)
            self._binary_file = self.guard.open_binary(self.anvil)
            if os.fstat(self._binary_file.fileno()).st_size != ANVIL_BYTES or hashlib.file_digest(self._binary_file, 'sha256').hexdigest() != ANVIL_SHA256:
                _fail('ANVIL_IDENTITY_MISMATCH')
            self.work.mkdir(parents=True, exist_ok=True)
            if shutil.disk_usage(self.work).free < 2 * 1024 * 1024 * 1024:
                _fail('STARTUP_DISK_FLOOR')
            # A fresh directory contains no project code, wallet settings or dotenv content.
            runtime = Path(tempfile.mkdtemp(prefix='node-', dir=self.work.resolve()))
            config = runtime / 'foundry.toml'
            config.write_text('[profile.default]\n', encoding='ascii')
            (runtime / '.env').write_text('', encoding='ascii')
            with socket.socket() as check:
                check.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                check.bind(('127.0.0.1', 18545))
            args = [str(self.anvil.resolve()), '--host', '127.0.0.1', '--port', '18545', '--accounts', '0',
                    '--quiet', '--chain-id', '31337', '--network', 'ethereum', '--hardfork', 'london',
                    '--gas-limit', '30000000', '--gas-price', str(int(GAS_PRICE, 16)), '--allow-origin', LOCAL_URL,
                    '--disable-default-create2-deployer', '--prune-history', '8', '--transaction-block-keeper', '256',
                    '--memory-limit', '67108864', '--disable-console-log']
            if self.mode == 'fork':
                self._start_proxy()
                args += ['--fork-url', 'http://127.0.0.1:18546', '--fork-block-number', str(int(BLOCK, 16)),
                         '--timeout', '10000', '--retries', '0', '--no-storage-caching']
            environment = {key: os.environ[key] for key in ('SystemRoot', 'WINDIR') if key in os.environ}
            environment.update({'TEMP': str(runtime), 'TMP': str(runtime), 'FOUNDRY_CONFIG': str(config),
                                'FOUNDRY_DIR': str(runtime), 'RUST_LOG': 'off', 'NO_COLOR': '1'})
            self.started = time.monotonic()
            self.process = subprocess.Popen(args, cwd=runtime, env=environment, stdin=subprocess.DEVNULL,
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                            creationflags=subprocess.CREATE_NO_WINDOW, close_fds=True)
            self.guard.attach(self.process)
            for target, arguments in ((self._watch, ()), (self._drain, (self.process.stdout, runtime / 'stdout.log')),
                                      (self._drain, (self.process.stderr, runtime / 'stderr.log'))):
                thread = threading.Thread(target=target, args=arguments, daemon=True)
                self._threads.append(thread)
                thread.start()
            ready_until = self.started + 60
            while time.monotonic() < ready_until:
                if self.stop_reason or self.process.poll() is not None:
                    _fail(self.stop_reason or 'NODE_START_FAILED')
                if self.guard.listener_owned(self.process.pid):
                    if self.rpc('startup_chain', 'eth_chainId', []) != '0x7a69':
                        _fail('LOCAL_CHAIN_MISMATCH')
                    return self
                time.sleep(0.1)
            _fail('NODE_START_TIMEOUT')
        except Exception as error:
            if self.stop_reason is None:
                code = str(error) if isinstance(error, RuntimeError) else 'NODE_START_FAILED'
                self.stop_reason = code if re.fullmatch(r'[A-Z0-9_]{1,96}', code) else 'NODE_START_FAILED'
            self.__exit__(None, None, None)
            raise RuntimeError(self.stop_reason) from None

    def _params(self, method, params):
        if not isinstance(params, list):
            _fail('LOCAL_PARAMETERS_REFUSED')
        if method in ('eth_chainId', 'eth_blockNumber', 'eth_gasPrice', 'anvil_nodeInfo') and params == []:
            return
        if method == 'eth_getTransactionReceipt' and len(params) == 1 and _hash(params[0]):
            return
        if method == 'eth_getBlockByNumber' and len(params) == 2 and params[1] is False and (params[0] == 'latest' or _quantity(params[0])):
            return
        if method == 'eth_getBlockByHash' and len(params) == 2 and _hash(params[0]) and params[1] is False:
            return
        if method in ('eth_getCode', 'eth_getBalance', 'eth_getTransactionCount') and len(params) == 2 and _address(params[0]) and (params[1] in ('latest', 'pending') or _quantity(params[1])):
            return
        if method in ('anvil_impersonateAccount', 'anvil_stopImpersonatingAccount') and len(params) == 1 and params[0] in ACTORS:
            return
        if method == 'anvil_setBalance' and len(params) == 2 and params[0] in ACTORS and _quantity(params[1], 10 ** 18):
            return
        if method == 'evm_snapshot' and params == []:
            return
        if method == 'evm_revert' and len(params) == 1 and params[0] in self._snapshot_ids:
            return
        if method in ('eth_sendTransaction', 'eth_call'):
            if method == 'eth_sendTransaction' and params and params[0].get('from') == '0x000000000000000000000000000000000000dead':
                if params[0].get('to') != TOKEN or not params[0].get('data', '').startswith('0xa9059cbb'):
                    _fail('FUNDING_ACTOR_SCOPE')
            wanted = 1 if method == 'eth_sendTransaction' else 2
            if len(params) != wanted or (wanted == 2 and params[1] != 'latest'):
                _fail('TRANSACTION_PARAMETERS_REFUSED')
            transaction = params[0]
            if (not isinstance(transaction, dict) or set(transaction) - {'from', 'to', 'gas', 'gasPrice', 'data', 'value', 'nonce'}
                    or transaction.get('from') not in ACTORS or not _quantity(transaction.get('gas'), 4000000)
                    or int(transaction['gas'], 16) == 0 or transaction.get('value', '0x0') != '0x0'
                    or transaction.get('gasPrice', GAS_PRICE) != GAS_PRICE
                    or ('to' in transaction and not _address(transaction['to']))
                    or ('nonce' in transaction and not _quantity(transaction['nonce'], (1 << 64) - 1))
                    or not isinstance(transaction.get('data', '0x'), str)
                    or not _HEX.fullmatch(transaction.get('data', '0x'))
                    or len(transaction.get('data', '0x')) > 48002):
                _fail('TRANSACTION_SCOPE_REFUSED')
            if method == 'eth_sendTransaction' and transaction.get('gasPrice') != GAS_PRICE:
                _fail('TRANSACTION_GAS_PRICE_REQUIRED')
            return
        _fail('LOCAL_METHOD_REFUSED')

    def rpc_raw(self, label, method, params):
        self._live()
        if not isinstance(label, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,96}', label):
            _fail('LABEL_REFUSED')
        # Capture caller data before validation, I/O and trace retention.
        captured = _json(_encoded(params))
        self._params(method, captured)
        if self._request_id >= 1800:
            self._halt('LOCAL_REQUEST_LIMIT')
            _fail('LOCAL_REQUEST_LIMIT')
        if method == 'eth_sendTransaction':
            if self.transaction_count >= 250:
                self._halt('LOCAL_TRANSACTION_LIMIT')
                _fail('LOCAL_TRANSACTION_LIMIT')
            # Every submitted attempt counts, including RPC rejection or timeout.
            self.transaction_count += 1
        self._request_id += 1
        request = {'jsonrpc': '2.0', 'id': self._request_id, 'method': method, 'params': captured}
        entry = {'label': label, 'request': request}
        try:
            response, raw = _post(LOCAL_URL, request)
            self._live()
            entry['response'], entry['raw_response'] = response, raw
            if 'result' in response:
                if method == 'eth_chainId' and response['result'] != '0x7a69':
                    _fail('LOCAL_CHAIN_MISMATCH')
                if method == 'evm_snapshot':
                    if not _quantity(response['result']):
                        _fail('SNAPSHOT_ID_REFUSED')
                    self._snapshot_ids.add(response['result'])
                if method == 'evm_revert' and response['result'] is True:
                    self._snapshot_ids.discard(captured[0])
                if method.startswith('anvil_') and method != 'anvil_nodeInfo':
                    override = {'method': method, 'params': captured, 'local_only': True}
                    self.overrides.append(override)
            return _json(_encoded(response))
        except Exception:
            entry['transport_error'] = 'LOCAL_RPC_FAILED'
            self._halt('LOCAL_RPC_FAILED')
            raise RuntimeError('LOCAL_RPC_FAILED') from None
        finally:
            self._record(self.calls, entry)

    def rpc(self, label, method, params):
        response = self.rpc_raw(label, method, params)
        if 'error' in response:
            _fail('LOCAL_RPC_ERROR')
        return response['result']

    def receipt(self):
        return _json(_encoded({'schema': 'caw-local-node/1', 'mode': self.mode,
            'anvil_version': '1.8.1', 'anvil_sha256': ANVIL_SHA256, 'anvil_bytes': ANVIL_BYTES,
            'local_chain_id': 31337, 'hardfork': 'london', 'host': '127.0.0.1', 'port': 18545,
            'remote_provider': REMOTE_URL if self.mode == 'fork' else None,
            'fork_block': BLOCK if self.mode == 'fork' else None,
            'expected_fork_hash': BLOCK_HASH if self.mode == 'fork' else None,
            'expected_state_root': STATE_ROOT if self.mode == 'fork' else None,
            'wallet_used': False, 'transaction_broadcast': False, 'local_transaction_attempts': self.transaction_count,
            'generated_accounts': 0, 'local_impersonation_is_ownership_proof': False,
            'token_storage_overridden': False, 'token_code_replaced': self.mode == 'synthetic' and any(
                row['method'] == 'anvil_setCode' for row in self.overrides),
            'peak_node_memory_bytes': self.peak_memory, 'node_output_bytes': self.output_bytes,
            'wall_seconds': round((self.finished or time.monotonic()) - self.started, 3) if self.started else 0,
            'limits': {'node_process_bytes': MEMORY_LIMIT, 'node_seconds': 600, 'output_bytes': MAX_RESPONSE,
                       'response_bytes': MAX_RESPONSE, 'trace_bytes': MAX_TRACE, 'local_requests': 1800, 'per_transaction_gas': 4000000,
                       'local_transaction_attempts': 250, 'upstream_requests': 200, 'request_seconds': 10},
            'stop_reason': self.stop_reason, 'overrides': self.overrides,
            'local_request_count': len(self.calls), 'proxy_request_count': len(self.remote_calls),
            'upstream_forwarded_count': sum(row['forwarded'] for row in self.remote_calls)}))

    def __exit__(self, exc_type, exc_value, traceback):
        self._stop_event.set()
        if self.proxy:
            self.proxy.shutdown()
            self.proxy.server_close()
            self.proxy = None
        if self.guard:
            self.guard.close()  # Kills only the process in this owned Job Object.
        if self.process:
            if self.process.poll() is None:
                self.process.kill()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        for thread in self._threads:
            if thread is not threading.current_thread():
                thread.join(timeout=2)
        if self._binary_file:
            self._binary_file.close()
            self._binary_file = None
        if self.started:
            self.finished = time.monotonic()
        return False
