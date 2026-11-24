/**
 * Reconnect policy for Quick Tunnel mode. Pure functions and constants, so the
 * restart/backoff decisions can be unit-tested without spawning processes.
 *
 * A Quick Tunnel hostname is random and dies with the cloudflared process.
 * When the process drops unexpectedly, Localshare restarts it with backoff and
 * prints the new hostname. A stop the operator asked for (Ctrl+C/SIGTERM) and
 * a cloudflared that cannot even start are never retried.
 */

// Wait between reconnect attempts, in milliseconds. The last value is the cap,
// so later attempts keep waiting 30s rather than growing without bound.
export const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

// Give up after this many consecutive failed runs.
export const MAX_RECONNECT_ATTEMPTS = 10;

// A run that survives this long was healthy, so the consecutive-failure
// counter resets: one drop hours into a session restarts with a fresh budget
// instead of inheriting failures from long ago.
export const HEALTHY_RUN_MS = 60_000;

export function backoffDelayMs(consecutiveFailures) {
  const index = Math.min(Math.max(consecutiveFailures, 1) - 1, RECONNECT_DELAYS_MS.length - 1);
  return RECONNECT_DELAYS_MS[index];
}

export function shouldRestart({ stoppedByUser = false, spawnError = null, consecutiveFailures = 0, maxAttempts = MAX_RECONNECT_ATTEMPTS } = {}) {
  if (stoppedByUser || spawnError) return false;
  return consecutiveFailures <= maxAttempts;
}

export function countFailure(consecutiveFailures, ranForMs) {
  return (ranForMs >= HEALTHY_RUN_MS ? 0 : consecutiveFailures) + 1;
}
