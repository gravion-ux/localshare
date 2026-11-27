#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs, helpText, originUrl } from "../src/args.js";
import { checkLocalHttpOrigin } from "../src/health.js";
import { backoffDelayMs, shouldRestart, countFailure, MAX_RECONNECT_ATTEMPTS } from "../src/reconnect.js";

/**
 * How long the --version probe may take before it is reported as a timeout.
 * A cold start of a large binary on a busy machine is slow but not broken, so
 * the budget is generous and a timeout is reported as its own status.
 */
export const PROBE_TIMEOUT_MS = 5000;

/**
 * Probe for the cloudflared binary. A missing binary, a binary that is slow
 * to start and a broken binary are different problems with different fixes,
 * so they are reported differently.
 */
export function inspectCommand(command, { timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  const result = spawnSync(command, ["--version"], {
    stdio: ["ignore", "ignore", "pipe"], windowsHide: true, timeout: timeoutMs, encoding: "utf8",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") return { status: "missing" };
    if (result.error.code === "ETIMEDOUT") return { status: "timeout", detail: `the --version check timed out after ${timeoutMs} ms` };
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

/**
 * Run one cloudflared process until it exits. Output is passed through, except
 * that a trycloudflare hostname is reported via onUrl instead of being echoed
 * raw, so the supervisor can present the current share link (and flag changes).
 */
function waitForTunnelRun(child, onUrl) {
  let spawnError = null;
  const handleOutput = (chunk) => {
    const output = chunk.toString();
    const matches = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g);
    if (matches) {
      onUrl(matches[0]);
      return;
    }
    stdout.write(output);
  };
  child.stdout?.on("data", handleOutput);
  child.stderr?.on("data", handleOutput);
  child.once("error", (error) => { spawnError = error; process.stderr.write(`Failed to start cloudflared: ${error.message}\n`); });

  return new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal, spawnError }));
  });
}

/**
 * While a Quick Tunnel is up, keep an eye on the local app itself. The tunnel
 * can be perfectly healthy while the app behind it has died; say so clearly
 * instead of leaving visitors (and the operator) guessing.
 */
function watchOrigin(options, isStopped) {
  let wasUp = true;
  let checking = false;
  const timer = setInterval(async () => {
    if (checking || isStopped()) return;
    checking = true;
    try {
      const up = await checkLocalHttpOrigin(options.host, options.port);
      if (!up && wasUp) {
        stdout.write(`\n  Warning: your local app at ${originUrl(options.host, options.port)} stopped responding. The tunnel is still up, but visitors will see an error until the app is back.\n`);
      } else if (up && !wasUp) {
        stdout.write(`\n  Your local app at ${originUrl(options.host, options.port)} is responding again.\n`);
      }
      wasUp = up;
    } finally { checking = false; }
  }, 15000);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Supervise the tunnel process for one Localshare session.
 *
 * Quick Tunnel mode: if cloudflared drops unexpectedly, restart it with
 * backoff and print the new share link (the old hostname dies with the old
 * process). Give up after MAX_RECONNECT_ATTEMPTS consecutive failures, or
 * immediately if the local app itself is gone — reconnecting a tunnel to a
 * dead app helps nobody. A user-requested stop (Ctrl+C/SIGTERM) kills the
 * current child, interrupts any backoff wait, and never triggers a restart.
 *
 * Named Tunnel mode keeps the original behaviour: one run, no restarts.
 */
async function superviseTunnel(commandArgs, options) {
  const restartable = options.mode === "quick";
  let child = null;
  let stoppedByUser = false;
  let wakeUp = null;

  const stop = (signal) => {
    if (stoppedByUser) return;
    stoppedByUser = true;
    if (child && !child.killed) child.kill(signal);
    if (wakeUp) wakeUp();
  };
  const onSigint = () => stop("SIGINT");
  const onSigterm = () => stop("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const interruptibleSleep = (ms) => new Promise((resolve) => {
    const timer = setTimeout(() => { wakeUp = null; resolve(); }, ms);
    wakeUp = () => { clearTimeout(timer); wakeUp = null; resolve(); };
  });

  let lastUrl = null;
  const announceUrl = (url) => {
    if (url === lastUrl) return;
    if (lastUrl === null) {
      stdout.write(`\n  SHARE URL: ${url}\n  Powered by Localshare • graviondev\n\n`);
    } else {
      stdout.write(`\n  Your share link changed to: ${url}\n  (the previous link no longer works)\n\n`);
    }
    lastUrl = url;
  };

  let consecutiveFailures = 0;
  try {
    for (;;) {
      const startedAt = Date.now();
      child = spawn("cloudflared", commandArgs, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      const stopWatching = restartable ? watchOrigin(options, () => stoppedByUser) : null;
      const { code, signal, spawnError } = await waitForTunnelRun(child, announceUrl);
      stopWatching?.();
      child = null;

      const exitCode = resolveExitCode(code, signal, { spawnError, stoppedByUser });
      if (stoppedByUser || spawnError || !restartable) return exitCode;

      consecutiveFailures = countFailure(consecutiveFailures, Date.now() - startedAt);
      if (!shouldRestart({ consecutiveFailures })) {
        stdout.write(`\n  The tunnel dropped ${consecutiveFailures} times in a row and could not be kept up. Check your network connection, then run Localshare again.\n`);
        return exitCode !== 0 ? exitCode : 1;
      }
      if (!(await checkLocalHttpOrigin(options.host, options.port))) {
        stdout.write(`\n  Your local app at ${originUrl(options.host, options.port)} is not responding, so the share cannot be restored. Restart your app, then run Localshare again.\n`);
        return 1;
      }
      const delayMs = backoffDelayMs(consecutiveFailures);
      stdout.write(`\n  Tunnel connection lost. Reconnecting in ${delayMs / 1000}s (attempt ${consecutiveFailures} of ${MAX_RECONNECT_ATTEMPTS})...\n`);
      await interruptibleSleep(delayMs);
      if (stoppedByUser) return 0;
    }
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    stdout.write("\n  Localshare session ended.\n");
  }
}

export async function main(argv = process.argv.slice(2), { probe = inspectCommand } = {}) {
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout.write(helpText()); return 0; }
    let cloudflared = probe("cloudflared");
    if (cloudflared.status === "timeout") {
      // A timeout can be a slow cold start rather than a broken binary, so
      // the probe is retried once before it is reported.
      cloudflared = probe("cloudflared");
    }
    if (cloudflared.status !== "ok") {
      if (cloudflared.status === "missing") {
        throw new Error("cloudflared was not found on PATH. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
      }
      if (cloudflared.status === "timeout") {
        throw new Error(`cloudflared is installed but ${cloudflared.detail}. The binary may be healthy and simply slow to start on this machine; retry, and if it keeps timing out check that antivirus software is not blocking it.`);
      }
      if (cloudflared.status === "error") {
        throw new Error(`cloudflared could not be started (${cloudflared.detail}). Check that the file on PATH is readable and executable by this account.`);
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

    return await superviseTunnel(commandArgs, options);
  } catch (error) {
    process.stderr.write(`\nLocalshare: ${error.message}\n\nRun with --help for usage.\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
