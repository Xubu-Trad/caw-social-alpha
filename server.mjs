import http from 'node:http';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PUBLIC_ROOT = new URL('./public/', import.meta.url);
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ACTIVE_READS = 8;
const MAX_HEADER_PAIRS = 32;
const ROUTES = new Map([
  ['/', [new URL('./public/index.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/index.html', [new URL('./public/index.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/styles.css', [new URL('./public/styles.css', import.meta.url), 'text/css; charset=utf-8']],
  ['/app.mjs', [new URL('./public/app.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/model.mjs', [new URL('./public/model.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/history.mjs', [new URL('./public/history.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/fixtures.json', [new URL('./public/fixtures.json', import.meta.url), 'application/json; charset=utf-8']],
  ['/media.mjs', [new URL('./public/media.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/deployment.mjs', [new URL('./public/deployment.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/deployment.json', [new URL('./public/deployment.json', import.meta.url), 'application/json; charset=utf-8']],
  ['/alpha.mjs', [new URL('./public/alpha.mjs', import.meta.url), 'text/javascript; charset=utf-8']],
  ['/website.html', [new URL('./public/website.html', import.meta.url), 'text/html; charset=utf-8']],
  ['/website.css', [new URL('./public/website.css', import.meta.url), 'text/css; charset=utf-8']],
  ['/caw-symbol.png', [new URL('./public/caw-symbol.png', import.meta.url), 'image/png', 2 * 1024 * 1024]],
]);
// One fixed prefix exercises relocation without making arbitrary paths routable.
for(const [route,asset] of [...ROUTES])ROUTES.set('/mirror'+route,asset);

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
});

function headerCount(request, name) {
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) count += 1;
  }
  return count;
}

function respond(request, response, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  if (response.destroyed) return;
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': bytes.length,
    'Connection': 'close',
    ...extra,
  });
  response.end(request.method === 'HEAD' ? undefined : bytes);
}

function validPath(path) {
  if (typeof path !== 'string' || path.length > 128) return false;
  // Validate the raw target before URL normalization can remove dot segments.
  // No encoded paths, queries or fragments are part of this static interface.
  if (!/^\/[A-Za-z0-9._/-]*$/.test(path) || path.includes('//')) return false;
  return !path.split('/').some(segment => segment === '.' || segment === '..');
}

async function readPublicFile(file, byteLimit = MAX_FILE_BYTES) {
  const directory = await lstat(PUBLIC_ROOT);
  const entry = await lstat(file);
  if (!directory.isDirectory() || directory.isSymbolicLink() || !entry.isFile() || entry.isSymbolicLink()) {
    throw new Error('Asset unavailable');
  }
  const [rootPath, filePath] = await Promise.all([realpath(PUBLIC_ROOT), realpath(file)]);
  if (dirname(filePath) !== rootPath) throw new Error('Asset unavailable');

  // The fixed filename comes only from ROUTES, never from request data.
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > byteLimit) throw new Error('Asset unavailable');
    const buffer = Buffer.alloc(byteLimit + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(buffer, used, buffer.length - used, used);
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > byteLimit) throw new Error('Asset unavailable');
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}

export function createServer() {
  let activeReads = 0;
  const server = http.createServer({
    maxHeaderSize: 8192,
    headersTimeout: 5000,
    requestTimeout: 5000,
    keepAliveTimeout: 1000,
    connectionsCheckingInterval: 1000,
  }, (request, response) => {
    if (request.rawHeaders.length > MAX_HEADER_PAIRS * 2) {
      respond(request, response, 431, 'Request not accepted.');
      return;
    }
    const address = server.address();
    const authority = address && typeof address === 'object' ? `127.0.0.1:${address.port}` : null;
    if (request.socket.localAddress !== '127.0.0.1' || !authority ||
        headerCount(request, 'host') !== 1 || request.headers.host !== authority) {
      respond(request, response, 421, 'Request not accepted.');
      return;
    }
    if (headerCount(request, 'origin') > 1 ||
        (request.headers.origin !== undefined && request.headers.origin !== `http://${authority}`)) {
      respond(request, response, 403, 'Request not accepted.');
      return;
    }
    if (request.headers['sec-fetch-site'] !== undefined &&
        !['same-origin', 'none'].includes(request.headers['sec-fetch-site'])) {
      respond(request, response, 403, 'Request not accepted.');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      respond(request, response, 405, 'Method not allowed.', undefined, { Allow: 'GET, HEAD' });
      return;
    }
    if (request.headers['transfer-encoding'] !== undefined ||
        (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
      respond(request, response, 400, 'Request not accepted.');
      return;
    }
    if (!validPath(request.url)) {
      respond(request, response, 400, 'Request not accepted.');
      return;
    }
    const asset = ROUTES.get(request.url);
    if (!asset) {
      respond(request, response, 404, 'Not found.');
      return;
    }
    if (activeReads >= MAX_ACTIVE_READS) {
      respond(request, response, 503, 'Temporarily unavailable.');
      return;
    }
    activeReads += 1;
    readPublicFile(asset[0], asset[2])
      .then(bytes => respond(request, response, 200, bytes, asset[1]))
      .catch(() => {
        if (response.headersSent) response.destroy();
        else respond(request, response, 503, 'Temporarily unavailable.');
      })
      .finally(() => { activeReads -= 1; });
  });

  // Retain one extra pair so excess headers cause rejection, not silent
  // truncation that could conceal a late Origin or duplicate Host header.
  server.maxHeadersCount = MAX_HEADER_PAIRS + 1;
  server.maxConnections = 16;
  server.maxRequestsPerSocket = 32;
  server.setTimeout(5000, socket => socket.destroy());
  server.on('clientError', (error, socket) => {
    if (!socket.writable) return socket.destroy();
    const status = error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n`);
  });
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}

const entrypoint = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (entrypoint) {
  const server = createServer();
  server.on('error', () => {
    console.error('Local preview could not start.');
    process.exitCode = 1;
  });
  server.listen(4173, '127.0.0.1', () => {
    console.log('CAW local simulation: http://127.0.0.1:4173');
  });
  const stop = () => {
    server.closeAllConnections();
    server.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
