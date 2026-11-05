# Gravion Localshare - repository manifest

Version: 0.4.3
Repository: https://github.com/gravion-ux/localshare
Published: 2026-11-05

## Contents

- `bin/localshare.js`: Cloudflare Quick and Named Tunnel launcher CLI
- `src/`: argument parsing and local health-check helpers
- `test/`: argument, health-check and fake-`cloudflared` process integration tests
- `package.json`: npm package manifest (no runtime dependencies)
- `demo-web/`: small local web app used to test Localshare; HTML escaping,
  CSP/nosniff headers, container healthcheck and an unprivileged container user
- `deployment/`: Docker Compose + Caddy example and a named-tunnel systemd template
- `docs/`: shared toolkit documentation plus the Localshare deployment guide and ADR-001
- `scripts/`: secret scanner, static syntax gate, smoke commands and a one-command test runner
- `.github/workflows/ci.yml`: Node 20/22 tests, demo tests, static checks and deployment checks

## Security

No user secrets, Cloudflare tunnel credentials, VPN private keys, API keys,
production data, domain registrations or cloud resources are included.

See `docs/PUBLICATION-VERIFICATION.md` for the verified checks and the explicit
environment limitations.
