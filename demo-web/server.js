import http from "node:http";
import { pathToFileURL } from "node:url";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function createServer({ displayAddress = "127.0.0.1:3000" } = {}) {
  return http.createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Localshare Demo</title><style>body{font:16px system-ui;max-width:720px;margin:12vh auto;padding:24px;background:#10151f;color:#e8eef8}code{color:#8ee6c5}</style></head><body><h1>It works. ✨</h1><p>This demo is running locally and can be shared with <code>localshare</code>.</p><p>Configured address: <code>${escapeHtml(displayAddress)}</code></p><footer style="margin-top:48px;color:#8b98aa;font-size:13px">Built with <strong>graviondev</strong> · Shared using Localshare</footer></body></html>`);
  });
}

/** Turn a Node listen error into a single operator-facing line. */
export function describeListenError(error, { host, port } = {}) {
  const code = error?.code;
  if (code === "EADDRINUSE") return `port ${port} is already in use`;
  if (code === "EADDRNOTAVAIL") return `cannot bind to ${host}:${port}`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return `cannot resolve host ${host}`;
  if (code === "EACCES") return `permission denied binding to ${host}:${port}`;
  return error?.message || "unknown listen error";
}

export function main() {
  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);
  const host = process.env.HOST || "127.0.0.1";
  if (!/^\d+$/.test(portRaw) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a decimal integer between 1 and 65535");
  }
  const server = createServer({ displayAddress: `${host}:${port}` });
  server.once("error", (error) => {
    console.error(`demo-web: ${describeListenError(error, { host, port })}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`Demo listening at http://${host.includes(":") ? `[${host}]` : host}:${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error(`demo-web: ${error.message}`); process.exitCode = 1; }
}
