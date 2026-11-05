# Gravion Localshare — publication verification record

Verification date: **2026-11-05**
Verification host: Windows 11 (10.0.26300, x64)
Toolchain: Node.js **v24.14.0**, npm **11.9.0**, Python **3.15.0**
Project version: **0.4.3**
Repository: https://github.com/gravion-ux/localshare
Scope: the Localshare CLI, its demo application and the VPS deployment examples.

> **Maturity statement.** This project is a **development foundation and MVP
> scaffold**. Nothing in this record is a production-readiness certification, a
> security sign-off or an anonymity guarantee.

## 1. Executive result

Every test suite in this repository was executed on the verification host and
passes.

| Suite | Discovered | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| `npm test (.)` | 17 | 16 | 0 | 1 |
| `npm test (demo-web)` | 2 | 2 | 0 | 0 |
| **Total** | **19** | **18** | **0** | **1** |

The Localshare suite carried the only author-written platform guard in the toolkit: the fake-`cloudflared` process integration test is skipped on Windows (`{ skip: process.platform === "win32" }`) because a shebang script is not directly executable there. It executes on the CI Ubuntu runners.

## 2. Static syntax, manifest and CLI gate

`scripts/syntax-checks.py` is an offline, layout-agnostic gate that reproduces
the static portion of `scripts/test-all.sh`. It is executed by the CI
`syntax-checks` job. It needs no network access, no credentials and no external
services.

| Check | Result | Detail |
|---|---|---|
| `javascript-syntax` | PASS | 8 file(s) parsed by node --check |
| `python-compile` | PASS | compiled 1 director(ies) |
| `json-manifests` | PASS | 3 file(s) parsed |
| `jsonl-datasets` | PASS | 0 dataset(s) parsed line by line |
| `toml-manifests` | PASS | 0 file(s) parsed |
| `yaml-manifests` | PASS | 2 file(s) parsed |
| `shell-syntax` | PASS | 1 script(s) passed bash -n |
| `cli-smoke` | PASS | 1 entry point(s) ran successfully |

The CLI smoke check exercises the entry points declared in
`scripts/smoke-commands.json`; all of them exit `0`.

## 3. Secret and credential scan

`scripts/scan-secrets.py` fails the build on high-confidence credential
patterns and on files that must never be committed (`.env*`, `*.pem`, `*.key`,
`*.p12`, `*.pfx`, `id_rsa`, `id_ed25519`, `*.npmrc`, `*.netrc`,
`*credentials*`, `cloudflared*.json`, `profiles/*.conf`).

**Result on this repository: CLEAN.** 42 files inspected, 0 hard
matches, 0 forbidden filenames.

- no soft matches

The scanner was validated with a negative test: 8 planted secrets (AWS access
key, GitHub token, PEM private key block, OpenAI-style key, `.env`, `.pem`,
`.npmrc`, WireGuard profile) were **all detected** with exit code `1`, and a
clean directory passed with exit code `0`.

The repository `.gitignore` excludes `.env`, `.env.*`, `cloudflared/*.json`,
`cloudflared/*.pem`, `profiles/*.conf`, `reports/*.json`, `node_modules/` and
the common cache directories.

## 4. CI configuration

| Job | Runs | Purpose |
|---|---:|---|
| `secret-scan` | 1 | Fails the build on committed credentials or secret-bearing files |
| `syntax-checks` | 1 | Static syntax, manifest parsing and CLI smoke gate |
| `node-tests` | 2 | Localshare and demo-web suites on Node 20 and 22 |
| `deployment-checks` | 1 | Compose config, Caddyfile validation, demo container build |

The workflow is named `CI` and stored at `.github/workflows/ci.yml`. It uses a
`concurrency` group that cancels superseded runs, reduces `permissions` to
`contents: read`, bounds every job with `timeout-minutes` and uses
`fail-fast: false` on matrices so one failing leg does not hide the others.

The Actions tab on the repository is the authoritative per-commit result.

## 5. Still not verifiable in this environment

These items are **not** counted as passes anywhere in this document.

| Item | Status | Why |
|---|---|---|
| Live Cloudflare Quick/Named tunnel | Unverified locally | `cloudflared` is not installed on the verification host |
| Playwright/Chromium runtime | Unverified locally | not required by this project and not installed on the verification host |
| Docker image build, Compose runtime and Caddy runtime | Unverified locally | no Docker or Caddy on the verification host; CI covers config validation and the demo build |
| WireGuard connect/disconnect and leak tests | Unverified locally | not part of this project |
| Independent third-party security review | Unverified locally | **not performed** |

## 6. Relationship to the original Gravion Toolkit bundle

This repository was split out of the `gravion-toolkit-v0.4.3` bundle (archive
sha256 `5e711fd37fdf2953a4645d26187828f83e796f18243a330bc2721bb3290e5db1`,
77,597 bytes).

**Project files carried over byte-identical from the bundle: 6.**

Changed project files:

- `README.md`
- `package.json`

Files present in this repository that were not inside the bundle's
`apps/localshare/` folder - the shared bundle-level files (`LICENSE`,
`.gitignore`, `CHANGELOG.md`) moved to the repository root, the shared
documentation, plus the per-repository CI workflow, scripts and verification
record:

- `.gitattributes`
- `.github/workflows/ci.yml`
- `.gitignore`
- `CHANGELOG.md`
- `LICENSE`
- `MANIFEST.md`
- `VERSION`
- `demo-web/Dockerfile`
- `demo-web/README.md`
- `demo-web/package.json`
- `demo-web/server.js`
- `demo-web/test-server.test.js`
- `deployment/Caddyfile`
- `deployment/README.md`
- `deployment/cloudflared-named-tunnel.service.example`
- `deployment/compose.yml`
- `docs/API-CONTRACTS.md`
- `docs/ARCHITECTURE.md`
- `docs/AUDIT-REPORT.md`
- `docs/BRANDING.md`
- `docs/DEPENDENCIES.md`
- `docs/DEVELOPMENT.md`
- `docs/PRODUCTS.md`
- `docs/PUBLICATION-VERIFICATION.md`
- `docs/REFERENCES.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
- `docs/SHARE-DEPLOYMENT.md`
- `docs/TEST-RESULTS.md`
- `docs/THREAT-MODEL.md`
- `docs/adr/ADR-001-share-tunnel.md`
- `scripts/scan-secrets.py`
- `scripts/smoke-commands.json`
- `scripts/syntax-checks.py`
- `scripts/test-all.sh`

The shared toolkit documentation (`docs/PRODUCTS.md`, `docs/ARCHITECTURE.md`,
`docs/SECURITY.md`, `docs/THREAT-MODEL.md`, `docs/ROADMAP.md`,
`docs/TEST-RESULTS.md`, `docs/AUDIT-REPORT.md`, `docs/DEPENDENCIES.md`,
`docs/API-CONTRACTS.md`, `docs/BRANDING.md`, `docs/REFERENCES.md`,
`docs/BUNDLE-STATUS.md`), the MIT `LICENSE` and the toolkit `CHANGELOG.md` are
included so the project keeps its engineering history and its sibling-project
context. Path references inside those documents were rewritten so every link
resolves inside this repository; references to the other three projects now
point at their own repositories.

The project code moved from `apps/localshare/` to the repository root, so the
package is installed and tested directly from a checkout:

```bash
git clone https://github.com/gravion-ux/localshare.git
cd localshare
```

## 7. Release recommendation

**Suitable for developer preview, code review and continued implementation.**

**Not** suitable for production use, and not to be advertised as production
ready. Before any production deployment, the outstanding items in section 5
must be exercised and an independent security review must be completed.

The sibling projects in the Gravion Toolkit are published separately as
[`privacyflow`, `agent-browser`, `gravion-trainner`].
