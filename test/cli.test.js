import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm, link, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveExitCode, inspectCommand, main } from "../bin/localshare.js";

// --- a user-requested stop is not a failure ---
test("a user-requested Ctrl+C stop exits 0", () => {
  assert.equal(resolveExitCode(null, "SIGINT", { stoppedByUser: true }), 0);
});
test("a user-requested SIGTERM stop exits 0", () => {
  assert.equal(resolveExitCode(null, "SIGTERM", { stoppedByUser: true }), 0);
});
test("an unexpected signal still exits non-zero", () => {
  assert.equal(resolveExitCode(null, "SIGSEGV", { stoppedByUser: false }), 1);
});
test("a clean tunnel exit keeps its own status", () => {
  assert.equal(resolveExitCode(0, null, { stoppedByUser: false }), 0);
  assert.equal(resolveExitCode(3, null, { stoppedByUser: false }), 3);
});
test("a failed tunnel start exits 1", () => {
  assert.equal(resolveExitCode(null, null, { spawnError: new Error("boom") }), 1);
});

// --- a missing binary and a broken binary are different problems ---
test("reports a missing binary as missing", () => {
  assert.equal(inspectCommand("localshare-does-not-exist-9f3a").status, "missing");
});

test("reports a working binary as ok", () => {
  assert.equal(inspectCommand(process.execPath).status, "ok");
});

test("reports a broken binary as failed, not missing", () => {
  const saved = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = "--definitely-not-a-node-option";
  try {
    const report = inspectCommand(process.execPath);
    assert.equal(report.status, "failed");
    assert.match(report.detail, /9/);
  } finally {
    if (saved === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = saved;
  }
});

// --- a probe that runs past its budget is a timeout, not a working binary ---
test("reports a probe that runs past its budget as a timeout", () => {
  // node --version needs far more than 1 ms to start, so the budget is spent.
  const report = inspectCommand(process.execPath, { timeoutMs: 1 });
  assert.equal(report.status, "timeout");
});

// --- a timeout is not a broken binary, and the advice must say so -----------
async function captureStderr(run) {
  const originalWrite = process.stderr.write.bind(process.stderr);
  let stderr = "";
  process.stderr.write = (chunk, ...rest) => { stderr += String(chunk); return true; };
  try {
    await run();
  } finally {
    process.stderr.write = originalWrite;
  }
  return stderr;
}

test("a timed-out probe is reported as a timeout, not as a broken binary", async () => {
  const stderr = await captureStderr(() => main(["--port", "3000", "--allow-email", "friend@example.com"], {
    probe: () => ({ status: "timeout", detail: "the --version check timed out" }),
  }));
  assert.match(stderr, /timed out/i);
  assert.doesNotMatch(stderr, /Reinstall or repair/i);
});

test("a probe that times out once is retried before the CLI gives up", async () => {
  let calls = 0;
  const stderr = await captureStderr(() => main(["--port", "3000", "--allow-email", "friend@example.com"], {
    probe: () => {
      calls += 1;
      return calls === 1
        ? { status: "timeout", detail: "the --version check timed out after 5000 ms" }
        : { status: "ok" };
    },
  }));
  assert.equal(calls, 2);
  assert.doesNotMatch(stderr, /timed out/i);
});

test("a probe that keeps timing out is reported as a timeout", async () => {
  let calls = 0;
  const stderr = await captureStderr(() => main(["--port", "3000", "--allow-email", "friend@example.com"], {
    probe: () => {
      calls += 1;
      return { status: "timeout", detail: "the --version check timed out after 5000 ms" };
    },
  }));
  assert.equal(calls, 2);
  assert.match(stderr, /timed out/i);
  assert.doesNotMatch(stderr, /Reinstall or repair/i);
});

// --- a non-HTTP listener must never be published through a public tunnel ---
async function withFakeCloudflaredOnPath(run) {
  const directory = await mkdtemp(join(tmpdir(), "localshare-cmd-"));
  const target = join(directory, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  try {
    await link(process.execPath, target);
  } catch {
    await copyFile(process.execPath, target);
  }
  // Warm the freshly written binary.  A hard link is not permitted on this
  // platform, so the fallback copies an 87 MB node.exe; the FIRST spawn of
  // that copy pays the page-in and antivirus cost (measured 0.9-2.9 s under
  // load), which can outlast the CLI's probe budget and turn a healthy binary
  // into a spurious timeout.  Warming it keeps the probe deterministic.
  spawnSync(target, ["--version"], { stdio: "ignore", timeout: 60000, windowsHide: true });
  const savedPath = process.env.PATH;
  process.env.PATH = `${directory}${delimiter}${savedPath || ""}`;
  try {
    return await run();
  } finally {
    process.env.PATH = savedPath;
    await rm(directory, { recursive: true, force: true });
  }
}

test("the CLI refuses to share a non-HTTP origin", async () => {
  const server = net.createServer((socket) => { socket.on("data", () => socket.write("+PONG\r\n")); });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const port = server.address().port;
  const originalWrite = process.stderr.write.bind(process.stderr);
  let stderr = "";
  process.stderr.write = (chunk, ...rest) => { stderr += String(chunk); return true; };
  try {
    await withFakeCloudflaredOnPath(async () => {
      const code = await main(["--port", String(port), "--allow-email", "friend@example.com"]);
      assert.equal(code, 1);
    });
  } finally {
    process.stderr.write = originalWrite;
    await new Promise((resolve) => server.close(resolve));
  }
  assert.match(stderr, /No HTTP origin is listening/);
});
