import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer, escapeHtml, describeListenError } from "./server.js";

 test("HTML escapes displayed configuration values", () => {
  assert.equal(escapeHtml('<script a="x">&\''), "&lt;script a=&quot;x&quot;&gt;&amp;&#39;");
});

test("demo endpoint returns hardened HTML headers and content", async (t) => {
  const server = createServer({ displayAddress: "127.0.0.1:4321" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(html, /127\.0\.0\.1:4321/);
});

// --- a listen failure must be a clean one-line message, not a Node stack trace ---
test("describes a busy port in one line", () => {
  const error = Object.assign(new Error("listen EADDRINUSE: address already in use 127.0.0.1:3000"), { code: "EADDRINUSE" });
  const message = describeListenError(error, { host: "127.0.0.1", port: 3000 });
  assert.match(message, /port 3000 is already in use/);
  assert.doesNotMatch(message, /\n/);
});

test("describes an unresolvable host in one line", () => {
  const error = Object.assign(new Error("getaddrinfo ENOTFOUND nope.invalid"), { code: "ENOTFOUND" });
  const message = describeListenError(error, { host: "nope.invalid", port: 3000 });
  assert.match(message, /cannot resolve host nope\.invalid/);
});

test("demo server exits cleanly when the port is already in use", async () => {
  const blocker = http.createServer(() => {});
  await new Promise((resolve, reject) => blocker.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const port = blocker.address().port;
  const serverPath = join(dirname(fileURLToPath(import.meta.url)), "server.js");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.once("close", resolve));
  await new Promise((resolve) => blocker.close(resolve));

  assert.equal(code, 1);
  assert.match(stderr, /demo-web: port \d+ is already in use/);
  assert.doesNotMatch(stderr, /\n\s+at\s/, "expected no Node stack frames");
});
