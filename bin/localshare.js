#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs, helpText, originUrl } from "../src/args.js";
import { checkLocalHttpOrigin } from "../src/health.js";

/**
 * Probe for the cloudflared binary. A missing binary and a broken binary are
 * different problems with different fixes, so they are reported differently.
 */
export function inspectCommand(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: 5000, encoding: "utf8",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") return { status: "missing" };
    if (result.error.code === "ETIMEDOUT") return { status: "timeout", detail: "the --version check timed out" };
    return { status: "error", detail: result.error.message };
  }
  if (result.status !== 0) {
    const firstLine = String(result.stderr || "").trim().split("\n")[0];
    return { status: "failed", detail: `exit code ${result.status}${firstLine ? ` (${firstLine})` : ""}` };
  }
  return { status: "ok" };
}

/**
 * Map the tunnel process outcome onto a CLI exit status. A stop the operator asked
 * for (Ctrl+C) is a successful session, not a failure.
 */
export function resolveExitCode(code, signal, { spawnError = null, stoppedByUser = false } = {}) {
  if (spawnError) return 1;
  if (stoppedByUser) return 0;
  return code ?? (signal ? 1 : 0);
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
  let stoppedByUser = false;
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
    stoppedByUser = true;
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
      resolve(resolveExitCode(code, signal, { spawnError, stoppedByUser }));
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout.write(helpText()); return 0; }
    const cloudflared = inspectCommand("cloudflared");
    if (cloudflared.status !== "ok") {
      if (cloudflared.status === "missing") {
        throw new Error("cloudflared was not found on PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
      }
      throw new Error(`cloudflared is installed but could not run (${cloudflared.detail}). Reinstall or repair the cloudflared binary on PATH.`);
    }

    let commandArgs;
    if (options.mode === "quick") {
      if (!(await checkLocalHttpOrigin(options.host, options.port))) {
        throw new Error(`No HTTP origin is listening at http://${options.host}:${options.port}. Start your local HTTP app first.`);
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
