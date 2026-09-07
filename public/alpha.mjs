import { loadEnvironment } from './deployment.mjs';
const status = document.getElementById('alpha-environment');
const entries = document.querySelectorAll('[data-alpha-entry]');
try {
  const environment = await loadEnvironment();
  status.textContent = `Alpha ${environment.release} · simulation only. No connected wallet, chain or upload service.`;
  for (const entry of entries) entry.removeAttribute('aria-disabled');
} catch {
  status.textContent = 'Alpha configuration could not be verified. App entry is disabled; source review remains available.';
  for (const entry of entries) { entry.removeAttribute('href'); entry.setAttribute('aria-disabled', 'true'); }
}
