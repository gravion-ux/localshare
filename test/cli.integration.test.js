import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";

 test("CLI launches cloudflared with protected Quick Tunnel arguments", { skip: process.platform === "win32" }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "localshare-test-"));
  const server = http.createServer((_req, res) => { res.writeHead(200); res.end("ok"); });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const port = server.address().port;
  const capturePath = join(directory, "args.json");
  const fakeCloudflared = join(directory, "cloudflared");
  const cliPath = join(dirname(fileURLToPath(import.meta.url)), "../bin/localshare.js");
  await writeFile(fakeCloudflared, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs';\nif (process.argv[2] === '--version') { console.log('cloudflared fake 1.0'); process.exit(0); }\nwriteFileSync(process.env.CAPTURE_ARGS, JSON.stringify(process.argv.slice(2)));\nconsole.log('temporary tunnel https://unit-test.trycloudflare.com');\nsetInterval(() => {}, 1000);\n`);
  await chmod(fakeCloudflared, 0o755);

  const child = spawn(process.execPath, [cliPath, "--port", String(port), "--allow-email", "friend@example.com"], {
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH || ""}`,
      CAPTURE_ARGS: capturePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 5000;
  while (!output.includes("SHARE URL:")) {
    if (Date.now() > deadline) {
      child.kill("SIGTERM");
      throw new Error(`Localshare did not print a tunnel URL. Output: ${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /https:\/\/unit-test\.trycloudflare\.com/);
  child.kill("SIGTERM");
  await once(child, "close");

  const args = JSON.parse(await readFile(capturePath, "utf8"));
  assert.deepEqual(args, [
    "tunnel", "--url", `http://127.0.0.1:${port}`, "--allowed-mail", "friend@example.com",
  ]);
});
