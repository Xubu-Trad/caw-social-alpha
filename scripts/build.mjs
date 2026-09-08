import { lstat, readFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ASSETS = Object.freeze(['index.html', 'website.html', 'styles.css', 'website.css',
  'app.mjs', 'model.mjs', 'history.mjs', 'economics.mjs', 'signatures.mjs', 'signed-ledger.mjs', 'signed-record.mjs', 'delegation.mjs', 'owner-grant.mjs', 'media.mjs', 'deployment.mjs', 'deployment.json', 'alpha.mjs',
  'fixtures.json', 'caw-symbol.png']);
const PUBLIC = new URL('../public/', import.meta.url);
const OUTPUT = new URL('../dist/', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function collectStatic() {
  const directory = await lstat(PUBLIC);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Public directory must be a real directory.');
  const entries = [];
  for (const name of ASSETS) {
    const path = new URL(name, PUBLIC), info = await lstat(path);
    const limit = (name === 'caw-symbol.png' ? 2 : 1) * 1024 * 1024;
    if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error('Static asset rejected.');
    const bytes = await readFile(path);
    if (bytes.length > limit) throw new Error('Static asset exceeds size limit.');
    entries.push({ name, bytes, sha256: digest(bytes) });
  }
  const manifest = Buffer.from(entries.map(entry => `${entry.sha256}  ${entry.name}`).join('\n') + '\n');
  return [...entries, { name: 'SHA256SUMS.txt', bytes: manifest, sha256: digest(manifest) }];
}

export async function buildStatic() {
  const entries = await collectStatic();
  await mkdir(OUTPUT, { recursive: true });
  const directory = await lstat(OUTPUT);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Output directory must be a real directory.');
  const permitted = new Set(entries.map(entry => entry.name));
  for (const name of await readdir(OUTPUT)) {
    const info = await lstat(new URL(name, OUTPUT));
    if (!permitted.has(name) || !info.isFile() || info.isSymbolicLink()) throw new Error('Unexpected output entry; review it manually.');
  }
  for (const entry of entries) {
    await writeFile(new URL(entry.name, OUTPUT), entry.bytes);
    if (digest(await readFile(new URL(entry.name, OUTPUT))) !== entry.sha256) throw new Error('Built asset hash mismatch.');
  }
  return { files: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.bytes.length, 0), manifestSha256: digest(entries.at(-1).bytes) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await buildStatic()));
}
