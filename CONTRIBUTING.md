# Contributing to Localshare

Thanks for helping! Localshare is a CLI to share a local development
service via a Cloudflare Quick Tunnel, or run a preconfigured Named
Tunnel with a stable hostname. Access is gated by Cloudflare's
email one-time-PIN flow — a share link alone is never enough to
reach the service.

The most valuable contributions are option-parsing hardening, tunnel
lifecycle fixes, and tests.

## Ground rules

- **Access control is the product.** The `--allow-email` gate must
  never be weakened silently: no default-allow, no treating a
  missing allow-list as "open". An explicitly allowed email domain
  (`--allow-email '*@example.com'`) is a deliberate, visible choice
  by the operator — keep it that way.
- **Argument values are never flags.** The parser refuses any value
  that starts with `--`, so a value can never be mistaken for
  another option. Preserve that property in parsing changes.
- **Zero runtime dependencies.** Node.js built-ins only; the
  external tool is `cloudflared`, supplied by the operator.

## Development setup

Requires Node.js 20 or newer. (`cloudflared` on PATH is only needed
to run a real tunnel, not for the tests.)

```bash
git clone https://github.com/gravion-ux/localshare.git
cd localshare
npm test
```

## Running the tests

```bash
npm test                 # root suite: node --test ./test/*.test.js
npm start -- --help      # CLI smoke check
cd demo-web && npm test  # the demo app has its own suite
```

CI runs all of the above on Node 20 and 22, plus a secret scan
(`python scripts/scan-secrets.py .`), static syntax/manifest checks
(`python scripts/syntax-checks.py .`), and deployment checks that
validate the Compose file and Caddyfile and build the demo
container.

## Code style

- Plain Node.js, no build step; tests use the built-in `node --test`
  runner and live in `test/`.
- Comments explain *why* an access rule or parsing refusal exists.

## Pull request workflow

1. Fork and branch from `main`: `feat/<short-name>`,
   `fix/<short-name>`, `docs/<short-name>`.
2. Run both test suites and the CLI smoke check locally.
3. Open the PR against `main` with: what changed, why, how you
   tested it. For access-control changes, state explicitly how the
   gate behaves before and after.
4. CI must be green. One logical change per PR.
