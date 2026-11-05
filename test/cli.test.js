import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm, link, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
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

// --- a non-HTTP listener must never be published through a public tunnel ---
async function withFakeCloudflaredOnPath(run) {
  const directory = await mkdtemp(join(tmpdir(), "localshare-cmd-"));
  const target = join(directory, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  try {
    await link(process.execPath, target);
  } catch {
    await copyFile(process.execPath, target);
  }
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
