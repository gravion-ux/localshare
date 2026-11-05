# Development setup

## Prerequisites
- Node.js 20+ and npm
- `cloudflared` on `PATH` for end-to-end tunnel testing (optional - the unit tests and the fake-`cloudflared` integration test do not need it)

## Run the tests

```bash
npm test
npm start -- --help
```

The demo application has its own suite:

```bash
cd demo-web && npm test
```

## One-command runner

```bash
bash scripts/test-all.sh
```

This runs the Localshare suite, the demo-web suite, the static syntax gate and the credential scan.

## Static checks only

```bash
python scripts/syntax-checks.py .
python scripts/scan-secrets.py .
```

## Run the local demo

Terminal 1:

```bash
cd demo-web
npm start
```

Terminal 2:

```bash
npm start -- --port 3000 --allow-email you@example.com
```

## Code quality expectations
- Keep every network exposure explicit and documented.
- Add tests for argument validation, security policy and failure handling.
- Never commit API keys, tunnel credentials, cookies or user datasets.
- Keep safety-critical operations in narrow modules with dry-run and rollback paths.
- Update `MANIFEST.md`, `docs/` and `CHANGELOG.md` when implementation maturity changes.
