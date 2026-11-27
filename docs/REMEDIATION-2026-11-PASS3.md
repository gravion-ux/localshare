# Remediation notes - 2026-11, third pass

This file records the third audit pass over the Localshare repository in
November 2026. It is additive: the earlier `docs/REMEDIATION-2026-11.md` and
`docs/REMEDIATION-2026-11-PASS2.md` keep the record of the first two passes
and are not modified by this one.

## Method

The defect was found by the account-wide test measurement, which recorded one
failing test in the Localshare suite. Eight clean runs did not reproduce it,
so the reproduction was made load-controlled: the suite was run with CPU
burners active. That reproduced the failure in six of six rounds, and the
complete failing output was captured before any fix was written.

Each fix below is covered by a regression test that fails on the pre-fix code.

## Defect fixed

| Severity | Defect | Fix |
| --- | --- | --- |
| Medium | A `cloudflared` probe that timed out was reported as "installed but could not run ... Reinstall or repair the cloudflared binary on PATH", and the CLI stopped before it checked the origin | A timeout is now reported as a timeout, with the instruction that matches it, and the probe is retried once before it is reported |

### The cause

The `cloudflared` probe spawns the binary with `--version` under a 5000 ms
budget. Two separate facts combined:

1. `bin/localshare.js` collapsed every non-`ok` status into the
   broken-binary branch, so a timeout produced the reinstall instruction.
   That contradicted the first pass's own record, which states that
   `inspectCommand(command)` "distinguishes `missing`, `timeout`, `error` and
   `failed`, and the CLI prints the matching instruction".

2. The budget was marginal for a cold start. The Windows test fixture cannot
   hard-link the running Node binary, so it copies it, and the first spawn of
   that 87 MB copy pays the page-in and antivirus cost. Measured cold-spawn
   time for that copy was 1158 ms idle, 3749 ms under six CPU burners and
   5606 ms under twelve. The worst case was 112% of the 5000 ms budget, so a
   healthy binary could be reported as broken on a busy machine.

### The fix

- `inspectCommand(command, { timeoutMs })` takes an explicit budget, so the
  timeout is a deliberate, testable value instead of a buried constant.
- The CLI retries a timed-out probe once. A slow cold start is not a broken
  binary. A missing binary, a non-zero exit and a spawn error are
  deterministic answers and are not retried.
- A timeout now prints its own instruction, and a spawn error prints its own.
  The reinstall instruction is kept only for a binary that actually fails.
- The test fixture warms the copied binary before the CLI probes it, so the
  probe measures the CLI rather than the page-in cost of the fixture.

## Verification

| Check | Before | After |
| --- | --- | --- |
| Localshare suite, idle | 51 tests, 49 passed, 2 skipped | 55 tests, 53 passed, 2 skipped, 0 failed |
| Localshare suite, six CPU burners | failed in 6 of 6 rounds | passed in 6 of 6 rounds |
| Localshare suite, twelve CPU burners | cold spawn measured above the probe budget | passed in 6 of 6 rounds |
| `scripts/syntax-checks.py` | 8 passed | 8 passed |
| `scripts/scan-secrets.py` | clean | clean |

The idle "before" row was measured by stashing the fix and running the suite
again. The failure that motivated this pass did not appear in that run: it
needs the machine to be loaded, which is why the reproduction was made
load-controlled rather than run repeatedly on an idle box.

The two skipped tests are the POSIX fake-`cloudflared` process integration
tests, which are skipped on Windows by design and run in the Linux CI job.
