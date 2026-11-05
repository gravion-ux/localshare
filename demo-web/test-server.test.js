import test from "node:test";
import assert from "node:assert/strict";
import { createServer, escapeHtml } from "./server.js";

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
