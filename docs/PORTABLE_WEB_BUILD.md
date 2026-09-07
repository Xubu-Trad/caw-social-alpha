# Portable alpha build

Run npm run build (or node scripts/build.mjs). dist/ contains twelve allowlisted public assets and SHA256SUMS.txt. All application asset and configuration links are relative. The local server also exposes an exact /mirror/ prefix for relocation testing; it is the same process, not an independent operator.

No installation or network fetch occurs during the static build. No public deployment was performed. A production static host must supply HTTPS, correct HTML/CSS/module/JSON/image MIME types, an isolated origin, no directory listing and the response policies below. Merely copying files does not apply headers:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Resource-Policy: same-origin
Cross-Origin-Opener-Policy: same-origin
Cache-Control: no-store
```

Verify actual response headers and bytes at the intended host before calling it a tested deployment. The loopback Host/Origin checks in server.mjs are for local review, not a production server recipe. Domains, gateways, release hosting and retained copies have separate owners and failure modes. A hash identifies content; it does not preserve it. Native installation, service-worker caching and independent protocol operation are not implemented.
