import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import { checkLocalPort, checkLocalHttpOrigin } from "../src/health.js";
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

// --- HTTP origin pre-flight (a non-HTTP listener must never become a public tunnel) ---
function listenHttpServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((_req, res) => { res.writeHead(200); res.end("ok"); });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
function listenRawServer(payload) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => { socket.on("data", () => socket.write(payload)); });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("accepts a loopback HTTP origin", async (t) => {
  const { server, port } = await listenHttpServer(); t.after(() => server.close());
  assert.equal(await checkLocalHttpOrigin("127.0.0.1", port), true);
});
test("rejects a non-HTTP TCP listener", async (t) => {
  const { server, port } = await listenRawServer("+PONG\r\n"); t.after(() => server.close());
  assert.equal(await checkLocalHttpOrigin("127.0.0.1", port, 800), false);
});
test("rejects a closed port during the HTTP origin check", async () => {
  const { server, port } = await listenHttpServer(); await new Promise((resolve) => server.close(resolve));
  assert.equal(await checkLocalHttpOrigin("127.0.0.1", port, 500), false);
});
