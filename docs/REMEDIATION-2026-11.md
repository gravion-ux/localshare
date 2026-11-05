# Localshare remediation — 2026-11-05

This file records a defect audit and the fixes applied on top of the published
v0.4.3 tree. The original `README.md`, `CHANGELOG.md`, `docs/AUDIT-REPORT.md`,
`docs/TEST-RESULTS.md` and `docs/SECURITY.md` are left unchanged so the earlier
audit record stays intact; this file is the new evidence.

Audit method: every source file was read in full, then each suspected defect was
reproduced with an executable probe before a fix was written. Every fix below is
covered by a regression test that fails on the pre-fix code.

## Fixes

### 1. A Ctrl+C stop exited with status 1 (medium)

* Where: `bin/localshare.js`, `attachTunnel`.
* Cause: the close handler resolved `code ?? (signal ? 1 : 0)`. When the operator
  pressed Ctrl+C the CLI forwarded SIGINT to `cloudflared`, the child died from
  that signal, so `code` was `null` and `signal` was `SIGINT` — which mapped to 1.
  The session had in fact ended exactly as requested.
* Fix: `resolveExitCode(code, signal, { spawnError, stoppedByUser })` is now
  exported from `bin/localshare.js` and maps a user-requested stop to 0, a spawn
  failure to 1, and any other signal death to 1.
* Test: `test/cli.test.js`.

### 2. The demo server crashed with a raw Node stack trace (medium)

* Where: `demo-web/server.js`, `main`.
* Cause: `server.listen()` had no `error` listener, so `EADDRINUSE` or
  `ENOTFOUND` became an unhandled `error` event and Node printed a full stack
  trace. The `try/catch` in the entry point only covered synchronous throws.
* Fix: `describeListenError(error, { host, port })` turns the Node error into one
  operator-facing line (`demo-web: port 3000 is already in use`), and `main`
  installs a `server.once("error", ...)` handler that prints it and sets exit
  status 1.
* Test: `demo-web/test-server.test.js` — unit coverage for the message plus a
  spawned-server check that asserts exit status 1 and no stack frames.

### 3. The pre-flight check accepted any TCP listener (medium)

* Where: `src/health.js`, `bin/localshare.js`.
* Cause: `checkLocalPort` only completed a TCP connect. A database, SSH or Redis
  socket on the chosen port therefore passed the check and was then published as
  a public tunnel origin, while `README.md` and `docs/SECURITY.md` both say only
  a local HTTP app may be shared and that database ports must not be exposed.
* Fix: the new `checkLocalHttpOrigin(host, port)` sends a `HEAD / HTTP/1.1`
  request and requires an HTTP status line before the origin is accepted. The
  CLI pre-flight now uses it, and its failure message says
  `No HTTP origin is listening at http://host:port.` so a wrong port and a
  non-HTTP service are both reported accurately.
* Test: `test/health.test.js` (HTTP origin accepted, raw TCP listener rejected,
  closed port rejected) and `test/cli.test.js` (the CLI refuses to share a
  non-HTTP origin).

### 4. Named mode silently ignored `--host` and `--port` (low)

* Where: `src/args.js`.
* Cause: the named-mode branch never validated the quick-mode origin flags, so
  `--host 0.0.0.0` or `--port 22` was parsed, dropped, and the command still
  started. The flag looked like it constrained the origin when it did not.
* Fix: named mode now rejects `--host` and `--port` with
  `--host and --port are only valid with --mode quick.`
* Test: `test/args.test.js`.

### 5. Control characters were echoed raw to the terminal (low)

* Where: `src/args.js`.
* Cause: the allow-list pattern excluded only whitespace, `@` and `*`, so ANSI
  escape sequences passed validation and were written straight to the terminal
  by `bin/localshare.js` — in output that also carries the public-exposure
  warning.
* Fix: every option value is rejected when it contains control characters, so
  the value can never reach the terminal.
* Test: `test/args.test.js` (allow-list value, tunnel name, hostname).

### 6. A broken `cloudflared` was reported as missing (low)

* Where: `bin/localshare.js`.
* Cause: `commandExists` mapped every failure — non-zero exit, timeout, spawn
  error — to "not found on PATH", sending the operator to the wrong fix.
* Fix: `inspectCommand(command)` is now exported and distinguishes `missing`,
  `timeout`, `error` and `failed`, and the CLI prints the matching instruction.
* Test: `test/cli.test.js`.

## Test status after the fixes

| Suite | Before | After |
|---|---|---|
| `test/*.test.js` | 17 (1 skipped on Windows) | 34 (1 skipped on Windows) |
| `demo-web/test-server.test.js` | 2 | 5 |
| Repository total | 19 | 39 |

Full local gate on 2026-11-05 (Windows 11, Node v24.14.0): 39/39 tests passed,
`scripts/syntax-checks.py` 8/8 checks passed, `scripts/scan-secrets.py` clean.

## Known limitations that were deliberately not changed

* The `--flag=value` option syntax is still unsupported; only the space-separated
  form is accepted. This is a usability gap, not a safety defect.
* `test/cli.integration.test.js` is still skipped on Windows because it uses a
  POSIX shebang script as the fake `cloudflared`. It runs on the CI Ubuntu
  runners. The Windows-only fake used by the new tests is a hard link to the
  running Node binary, which `child_process.spawn` can execute directly.
* `checkLocalPort` is kept as a TCP-level helper. The CLI no longer uses it for
  the share decision; only `checkLocalHttpOrigin` is used there.
* A live Cloudflare tunnel was not opened during this audit, so end-to-end
  tunnel behaviour, including the exact exit status of the real `cloudflared`
  binary on SIGINT, was not executed.
