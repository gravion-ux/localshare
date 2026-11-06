# Remediation notes — 2026-11, second pass

This file records the second audit pass over the Localshare repository in November
2026. It is additive: the earlier `docs/REMEDIATION-2026-11.md` keeps the record of
the first pass and is not modified by this one.

## Method

Every source file, test file and document was read again and the previously
recorded fixes were re-verified against the current code. Each new finding was
confirmed with a regression test before the fix was applied.

## Defects fixed

| Severity | Defect | Fix |
| --- | --- | --- |
| Low | The common `--flag=value` spelling was rejected with `Unknown option: --port=3000`, a message that implies the option does not exist | The parser expands the inline form to the spaced form, so both spellings reach the same validation; an inline value on an option that takes none is reported as such |
| Low | `docs/TEST-RESULTS.md` claimed 82/82 tests from the 2026-11-04 run while the suites had grown since | The document now records the verified counts of the current run: 153 tests, 152 passed, 1 skipped, and it marks the old figure as superseded |

## Fixes re-verified, no change needed

The first pass already fixed the following, and this pass confirmed the fixes are
present in the published code: the exit status of a user-requested stop, the
HTTP-level origin pre-flight check, the rejection of `--host` and `--port` in named
mode, the rejection of terminal control characters in echoed values, the
`cloudflared` probe diagnostics, and the one-line listen-error message in the demo
server. The earlier audit report listed these against an older revision.

## Documentation and spelling corrections

- `LICENSE` shipped a truncated MIT text without the warranty and liability
  clauses. The complete canonical MIT text is now in place.
- Spelling was inconsistent (`authorised` against `authorization` and `normalized`).
  The prose now uses one convention: American English.

## Verification

| Check | Before | After |
| --- | --- | --- |
| Localshare tests | 34 (33 passed, 1 skipped) | 40 (39 passed, 1 skipped) |
| Documented test total | 82/82 (stale) | 153 tests, 152 passed, 1 skipped |

## Residual limitations

- The integration test that starts a fake `cloudflared` process is skipped on
  Windows. The Linux CI job runs it.
- The `--flag=value` form is accepted for options that take a value. A value that
  starts with `--` is still refused, so an option value cannot be confused with
  another option.
- Localshare never verifies a live tunnel. Every statement about Cloudflare
  behavior in this repository is based on the published Cloudflare documentation.
