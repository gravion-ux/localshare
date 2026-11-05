#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs, helpText, originUrl } from "../src/args.js";
import { checkLocalPort } from "../src/health.js";

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore", windowsHide: true, timeout: 5000,
  });
  return !result.error && result.status === 0;
}

async function confirmPublicExposure() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Public mode needs an interactive terminal. Use --allow-email for restricted sharing.");
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write("\nWARNING: anyone who obtains this URL may access your local development app.\n");
    stdout.write("Do not expose admin panels, databases, secrets or production services.\n");
    const answer = await rl.question('Type EXPOSE to continue: ');
    if (answer.trim() !== "EXPOSE") throw new Error("Public tunnel cancelled.");
  } finally { rl.close(); }
}

function attachTunnel(child, options) {
  let printedUrl = false;
  let spawnError = null;
  let shuttingDown = false;
  const handleOutput = (chunk) => {
    const output = chunk.toString();
    const matches = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
    if (matches && !printedUrl) {
      printedUrl = true;
      stdout.write(`\n  SHARE URL: ${matches[0]}\n  Powered by Localshare • graviondev\n\n`);
      return;
    }
    stdout.write(output);
  };
  child.stdout?.on("data", handleOutput);
  child.stderr?.on("data", handleOutput);
  child.once("error", (error) => { spawnError = error; process.stderr.write(`Failed to start cloudflared: ${error.message}\n`); });

  const stop = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (!child.killed) child.kill(signal);
  };
  const onSigint = () => stop("SIGINT");
  const onSigterm = () => stop("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  return new Promise((resolve) => {
    child.once("close", (code, signal) => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      stdout.write("\n  Localshare session ended.\n");
      resolve(spawnError ? 1 : (code ?? (signal ? 1 : 0)));
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout.write(helpText()); return 0; }
    if (!commandExists("cloudflared")) {
      throw new Error("cloudflared was not found on PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
    }

    let commandArgs;
    if (options.mode === "quick") {
      if (!(await checkLocalPort(options.host, options.port))) {
        throw new Error(`Nothing is listening at http://${options.host}:${options.port}. Start your local project first.`);
      }
      if (options.publicMode) await confirmPublicExposure();
      commandArgs = ["tunnel", "--url", originUrl(options.host, options.port)];
      for (const email of options.allowEmails) commandArgs.push("--allowed-mail", email);
      stdout.write("\n  LOCALSHARE — Quick Tunnel\n");
      stdout.write(`  Origin: ${originUrl(options.host, options.port)}\n`);
      stdout.write(`  Access: ${options.publicMode ? "PUBLIC — anyone with the URL" : `EMAIL PIN — ${options.allowEmails.join(", ")}`}\n`);
      stdout.write("  Starting temporary tunnel. Keep this terminal open; Ctrl+C stops sharing.\n\n");
    } else {
      await access(options.configPath, fsConstants.R_OK).catch(() => { throw new Error(`Cannot read cloudflared config: ${options.configPath}`); });
      const configStat = await stat(options.configPath);
      if (!configStat.isFile()) throw new Error(`cloudflared config must be a regular file: ${options.configPath}`);
      commandArgs = ["tunnel", "--config", options.configPath, "run", options.tunnelName];
      stdout.write("\n  LOCALSHARE — Named Tunnel\n");
      stdout.write(`  Tunnel: ${options.tunnelName}\n`);
      if (options.hostname) stdout.write(`  Hostname (must match your ingress rule): https://${options.hostname}\n`);
      stdout.write("  Access policy and DNS must already be configured in Cloudflare.\n");
      stdout.write("  Starting persistent tunnel connector. Keep this process running.\n\n");
    }

    const child = spawn("cloudflared", commandArgs, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    return await attachTunnel(child, options);
  } catch (error) {
    process.stderr.write(`\nLocalshare: ${error.message}\n\nRun with --help for usage.\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
