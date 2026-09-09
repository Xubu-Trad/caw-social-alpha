// This alpha supports synthetic operation only. Real transport requires reviewed code.
const FIELDS = ['schema', 'release', 'mode', 'chainId', 'contracts', 'rpcUrls', 'walletEnabled', 'mediaUploadEnabled', 'scenario'];
export function validateEnvironment(value) {
  const fail = () => { throw new Error('This alpha supports simulation only. No wallet or chain connection was started.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  if (Object.keys(value).length !== FIELDS.length || !FIELDS.every(key => Object.hasOwn(value, key))) fail();
  if (value.schema !== 'caw-alpha-environment/1' || value.release !== '0.1.0-alpha.16' ||
      value.mode !== 'simulation' || value.chainId !== null || value.walletEnabled !== false ||
      value.mediaUploadEnabled !== false || value.scenario !== 'recommended-appendix-provisional') fail();
  if (!value.contracts || typeof value.contracts !== 'object' || Array.isArray(value.contracts) || Object.keys(value.contracts).length) fail();
  if (!Array.isArray(value.rpcUrls) || value.rpcUrls.length) fail();
  return Object.freeze({ ...value, contracts: Object.freeze({}), rpcUrls: Object.freeze([]) });
}

export async function loadEnvironment(fetcher = fetch) {
  const response = await fetcher(new URL('./deployment.json', import.meta.url), {
    credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  if (!response.ok || !response.body) {
    try { await response.body?.cancel(); } catch { /* Preserve the configuration error. */ }
    throw new Error('Alpha configuration is unavailable.');
  }
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) throw new Error('Alpha configuration exceeds its size limit.');
      chunks.push(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* Cleanup must not replace a read/size failure. */ }
    finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return validateEnvironment(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
