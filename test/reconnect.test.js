import test from "node:test";
import assert from "node:assert/strict";
import {
  backoffDelayMs, shouldRestart, countFailure,
  RECONNECT_DELAYS_MS, MAX_RECONNECT_ATTEMPTS, HEALTHY_RUN_MS,
} from "../src/reconnect.js";

// --- backoff grows through the schedule, then stays at the cap ---
test("backoff follows the delay schedule", () => {
  assert.equal(backoffDelayMs(1), 1000);
  assert.equal(backoffDelayMs(2), 2000);
  assert.equal(backoffDelayMs(3), 5000);
  assert.equal(backoffDelayMs(4), 10000);
  assert.equal(backoffDelayMs(5), 30000);
});

test("backoff never exceeds the final (cap) delay", () => {
  const cap = RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1];
  assert.equal(backoffDelayMs(6), cap);
  assert.equal(backoffDelayMs(50), cap);
});

test("backoff clamps a zero or negative failure count to the first delay", () => {
  assert.equal(backoffDelayMs(0), RECONNECT_DELAYS_MS[0]);
});

// --- a user stop and a spawn failure are never retried ---
test("never restarts after a user-requested stop", () => {
  assert.equal(shouldRestart({ stoppedByUser: true, consecutiveFailures: 1 }), false);
});

test("never restarts when cloudflared could not start at all", () => {
  assert.equal(shouldRestart({ spawnError: new Error("boom"), consecutiveFailures: 1 }), false);
});

// --- the attempt budget ---
test("restarts while consecutive failures are within the budget", () => {
  assert.equal(shouldRestart({ consecutiveFailures: 1 }), true);
  assert.equal(shouldRestart({ consecutiveFailures: MAX_RECONNECT_ATTEMPTS }), true);
});

test("gives up once consecutive failures exceed the budget", () => {
  assert.equal(shouldRestart({ consecutiveFailures: MAX_RECONNECT_ATTEMPTS + 1 }), false);
});

test("honours a custom attempt budget", () => {
  assert.equal(shouldRestart({ consecutiveFailures: 2, maxAttempts: 2 }), true);
  assert.equal(shouldRestart({ consecutiveFailures: 3, maxAttempts: 2 }), false);
});

// --- a healthy run resets the consecutive-failure counter ---
test("a short-lived run increments the failure counter", () => {
  assert.equal(countFailure(0, 500), 1);
  assert.equal(countFailure(3, HEALTHY_RUN_MS - 1), 4);
});

test("a run that survived the healthy threshold resets the counter", () => {
  assert.equal(countFailure(3, HEALTHY_RUN_MS), 1);
  assert.equal(countFailure(9, HEALTHY_RUN_MS * 10), 1);
});
