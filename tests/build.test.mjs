import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ASSETS, collectStatic } from '../scripts/build.mjs';

test('portable static build is deterministic and excludes non-public source, research and runtime', async () => {
  const first = await collectStatic(), second = await collectStatic();
  assert.deepEqual(first, second);
  assert.equal(first.length, 20);
  assert.equal(new Set(first.map(entry => entry.name)).size, first.length);
  for (const entry of first) assert.ok(!/[\\/]/.test(entry.name));
  for (const forbidden of ['server.mjs', 'package.json', 'README.md', '.env', 'node.exe']) assert.ok(!ASSETS.includes(forbidden));
  for (const entry of first.slice(0, -1)) assert.deepEqual(entry.bytes, await readFile(new URL(`../public/${entry.name}`, import.meta.url)));
});
test('public entrypoints include the alpha boundary and only packaged relative assets', async () => {
  const entries = await collectStatic(), names = new Set(entries.map(entry => entry.name));
  for (const name of ['index.html', 'website.html']) {
    const html = entries.find(entry => entry.name === name).bytes.toString('utf8');
    assert.match(html, /ALPHA \/ SIMULATION/);
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)(?:#[^"]*)?"/g)) assert.ok(names.has(match[1]), match[1]);
  }
  const app = entries.find(entry => entry.name === 'app.mjs').bytes.toString('utf8');
  const configuration = app.indexOf('await loadEnvironment()');
  const fixtures = app.indexOf("new URL('./fixtures.json'");
  assert.ok(configuration >= 0 && fixtures >= 0 && configuration < fixtures);
});
