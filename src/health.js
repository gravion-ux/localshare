import net from "node:net";

export function checkLocalPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

const HTTP_STATUS_LINE = /^HTTP\/\d(?:\.\d)?\s+\d{3}/i;

/**
 * Confirm that the loopback origin actually speaks HTTP before it is handed to a
 * public tunnel. A plain TCP listener (database, SSH, Redis) answers a connect but
 * never an HTTP status line, so it must not be shareable.
 */
export function checkLocalHttpOrigin(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let received = "";
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    const httpStatusSeen = () => HTTP_STATUS_LINE.test(received);
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.write(
        `HEAD / HTTP/1.1\r\nHost: ${host}:${port}\r\nUser-Agent: localshare-preflight\r\nConnection: close\r\n\r\n`,
      );
    });
    socket.on("data", (chunk) => {
      received += chunk.toString("latin1");
      if (httpStatusSeen()) { finish(true); return; }
      // Five bytes are enough to rule out an HTTP status line for good.
      if (received.length >= 5 && !received.startsWith("HTTP/")) finish(false);
    });
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("end", () => finish(httpStatusSeen()));
    socket.once("close", () => finish(httpStatusSeen()));
  });
}
