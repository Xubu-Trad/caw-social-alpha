import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createServer } from '../server.mjs';

async function fixtureServer(t) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return server;
}

function request(server, { path = '/', method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({
      hostname: '127.0.0.1', port, path, method, agent: false, setHost: false,
      headers: { Host: `127.0.0.1:${port}`, ...headers },
    }, response => {
      const chunks = [];
      let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 2 * 1024 * 1024) {
          response.destroy(new Error('Unexpectedly large test response'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Local test request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

test('serves only the named public assets, with exact file bytes and MIME types', async t => {
  const server = await fixtureServer(t);
  const assets = [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/index.html', 'index.html', 'text/html; charset=utf-8'],
    ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
    ['/app.mjs', 'app.mjs', 'text/javascript; charset=utf-8'],
    ['/model.mjs', 'model.mjs', 'text/javascript; charset=utf-8'],
    ['/history.mjs', 'history.mjs', 'text/javascript; charset=utf-8'],
    ['/economics.mjs', 'economics.mjs', 'text/javascript; charset=utf-8'],
    ['/signatures.mjs', 'signatures.mjs', 'text/javascript; charset=utf-8'],
    ['/signed-ledger.mjs', 'signed-ledger.mjs', 'text/javascript; charset=utf-8'],
    ['/signed-record.mjs', 'signed-record.mjs', 'text/javascript; charset=utf-8'],
    ['/delegation.mjs', 'delegation.mjs', 'text/javascript; charset=utf-8'],
    ['/owner-grant.mjs', 'owner-grant.mjs', 'text/javascript; charset=utf-8'],
    ['/checkpoint-continuity.mjs', 'checkpoint-continuity.mjs', 'text/javascript; charset=utf-8'],
    ['/anchor-package.mjs', 'anchor-package.mjs', 'text/javascript; charset=utf-8'],
    ['/fixtures.json', 'fixtures.json', 'application/json; charset=utf-8'],
    ['/media.mjs', 'media.mjs', 'text/javascript; charset=utf-8'],
    ['/deployment.mjs', 'deployment.mjs', 'text/javascript; charset=utf-8'],
    ['/deployment.json', 'deployment.json', 'application/json; charset=utf-8'],
    ['/alpha.mjs', 'alpha.mjs', 'text/javascript; charset=utf-8'],
    ['/website.html', 'website.html', 'text/html; charset=utf-8'],
    ['/website.css', 'website.css', 'text/css; charset=utf-8'],
    ['/caw-symbol.png', 'caw-symbol.png', 'image/png'],
  ];
  for (const [path, filename, type] of [...assets,...assets.map(([path,filename,type])=>['/mirror'+path,filename,type])]) {
    const response = await request(server, { path });
    const expected = await readFile(new URL(`../public/${filename}`, import.meta.url));
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], type, path);
    assert.equal(Number(response.headers['content-length']), expected.length, path);
    assert.deepEqual(response.body, expected, path);
  }
});

test('HEAD returns the GET metadata with no response body', async t => {
  const server = await fixtureServer(t);
  const get = await request(server, { path: '/fixtures.json' });
  const head = await request(server, { path: '/fixtures.json', method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], get.headers['content-length']);
  assert.equal(head.headers['content-type'], get.headers['content-type']);
  assert.equal(head.body.length, 0);
});

test('rejects raw, encoded, backslash and normalized traversal without disclosing paths', async t => {
  const server = await fixtureServer(t);
  const paths = [
    '/..', '/../private/SESSION_HANDOFF.md', '/./index.html', '//index.html',
    '/%2e%2e/private/SESSION_HANDOFF.md', '/%252e%252e/private/SESSION_HANDOFF.md',
    '/..%5cprivate', '/\\private', '/index%2ehtml', '/%00',
    '/styles.css?extra=1', '/styles.css#fragment',
    'http://127.0.0.1/index.html', `/${'a'.repeat(129)}`,
  ];
  for (const path of paths) {
    const response = await request(server, { path });
    assert.equal(response.status, 400, path);
    assert.equal(response.body.toString(), 'Request not accepted.');
  }
});

test('private, source, runtime, test and unlisted paths are not served', async t => {
  const server = await fixtureServer(t);
  for (const path of ['/README.md', '/BOOTSTRAP.md', '/server.mjs', '/tests/server.test.mjs', '/sources/SOURCE_INDEX.md', '/private/SESSION_HANDOFF.md', '/private/tools/node-v24.20.0/node.exe', '/public/index.html', '/.git/config', '/.env', '/favicon.ico', '/service-worker.js','/mirror/private/SESSION_HANDOFF.md','/mirror/server.mjs','/mirror/.env','/mirror/mirror/index.html']) {
    const response = await request(server, { path });
    assert.equal(response.status, 404, path);
    assert.equal(response.body.toString(), 'Not found.');
  }
});

test('Host must match the actual loopback listener, including its port', async t => {
  const server = await fixtureServer(t);
  const port = server.address().port;
  for (const host of ['example.invalid', '127.0.0.1', `localhost:${port}`, '127.0.0.1:1', '']) {
    const response = await request(server, { headers: { Host: host } });
    assert.equal(response.status, 421, host);
    assert.equal(response.body.toString(), 'Request not accepted.');
  }
  const good = await request(server, { headers: { Host: `127.0.0.1:${port}` } });
  assert.equal(good.status, 200);
});

test('Origin, when supplied, must be the exact local HTTP origin', async t => {
  const server = await fixtureServer(t);
  const port = server.address().port;
  for (const origin of ['https://example.invalid', 'null', `http://localhost:${port}`, `https://127.0.0.1:${port}`, 'http://127.0.0.1:1']) {
    const response = await request(server, { headers: { Origin: origin } });
    assert.equal(response.status, 403, origin);
  }
  const good = await request(server, { headers: { Origin: `http://127.0.0.1:${port}` } });
  assert.equal(good.status, 200);
  const crossSite = await request(server, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.status, 403);
});

test('permits GET and HEAD only and accepts no request body', async t => {
  const server = await fixtureServer(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request(server, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.allow, 'GET, HEAD');
  }
  const getBody = await request(server, { headers: { 'Content-Length': '1' }, body: 'x' });
  assert.equal(getBody.status, 400);
});

test('applies static isolation headers and never advertises cross-origin access', async t => {
  const server = await fixtureServer(t);
  for (const path of ['/', '/no-such-file']) {
    const response = await request(server, { path });
    const headers = response.headers;
    const csp = headers['content-security-policy'];
    for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'self'", "img-src 'self' blob:", "media-src blob:", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'", "object-src 'none'"]) {
      assert.ok(csp.includes(directive), directive);
    }
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'no-referrer');
    assert.equal(headers['cache-control'], 'no-store');
    assert.equal(headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
    assert.ok(headers['permissions-policy'].includes('camera=()'));
    assert.equal(headers['access-control-allow-origin'], undefined);
    assert.equal(headers['service-worker-allowed'], undefined);
    assert.equal(headers['x-powered-by'], undefined);
  }
});

test('sets bounded HTTP connection, header and request controls', async t => {
  const server = await fixtureServer(t);
  assert.equal(server.maxHeadersCount, 33); // 32 accepted; one retained to detect overflow.
  assert.equal(server.maxConnections, 16);
  assert.equal(server.maxRequestsPerSocket, 32);
  assert.equal(server.headersTimeout, 5000);
  assert.equal(server.requestTimeout, 5000);
  assert.equal(server.timeout, 5000);
  assert.equal(server.keepAliveTimeout, 1000);
  assert.equal(server.address().address, '127.0.0.1');
  const response = await request(server, { headers: { 'X-Large-Header': 'x'.repeat(9000) } });
  assert.equal(response.status, 431);
  const tooMany = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`X-Header-${index}`, 'x']));
  const countResponse = await request(server, { headers: tooMany });
  assert.equal(countResponse.status, 431);
});
