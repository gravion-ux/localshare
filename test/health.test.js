import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { checkLocalPort } from "../src/health.js";
function listenServer() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
test("detects an active loopback port", async (t) => {
  const { server, port } = await listenServer(); t.after(() => server.close());
  assert.equal(await checkLocalPort("127.0.0.1", port), true);
});
test("returns false for a closed loopback port", async () => {
  const { server, port } = await listenServer(); await new Promise((resolve) => server.close(resolve));
  assert.equal(await checkLocalPort("127.0.0.1", port, 500), false);
});
