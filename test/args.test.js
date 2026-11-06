import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, originUrl } from "../src/args.js";

test("parses an email-restricted Quick Tunnel", () => {
  const result = parseArgs(["--port", "3000", "--allow-email", "A@example.com,b@example.com"]);
  assert.equal(result.port, 3000);
  assert.equal(result.host, "127.0.0.1");
  assert.deepEqual(result.allowEmails, ["a@example.com", "b@example.com"]);
  assert.equal(result.publicMode, false);
});
test("requires explicit public mode or an email allow-list", () => assert.throws(() => parseArgs(["--port", "3000"]), /Email restriction is the default/));
test("rejects non-loopback targets", () => assert.throws(() => parseArgs(["--port", "3000", "--host", "0.0.0.0", "--public"]), /loopback hosts/));
test("rejects invalid ports", () => assert.throws(() => parseArgs(["--port", "70000", "--public"]), /valid TCP port/));
test("rejects mixed Quick Tunnel access modes", () => assert.throws(() => parseArgs(["--port", "3000", "--public", "--allow-email", "a@example.com"]), /either --public or --allow-email/));
test("deduplicates email entries", () => assert.deepEqual(parseArgs(["--port", "3000", "--allow-email", "a@example.com,A@example.com"]).allowEmails, ["a@example.com"]));
test("parses a named tunnel", () => {
  const result = parseArgs(["--mode", "named", "--config", "/tmp/config.yml", "--tunnel", "preview", "--hostname", "preview.example.com"]);
  assert.equal(result.mode, "named"); assert.equal(result.tunnelName, "preview");
});
test("named tunnel requires config and name", () => assert.throws(() => parseArgs(["--mode", "named", "--config", "x"]), /requires both/));
test("named tunnel rejects quick-mode access flags", () => assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "x", "--public"]), /configured through Cloudflare Access/));
test("named tunnel validates hostname", () => assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "x", "--hostname", "https://bad"]), /valid DNS hostname/));

test("formats IPv6 loopback origins with brackets", () => {
  assert.equal(originUrl("::1", 3000), "http://[::1]:3000");
});
test("rejects non-decimal port formats", () => {
  assert.throws(() => parseArgs(["--port", "3e3", "--public"]), /decimal integer/);
});

test("supports explicit wildcard email-domain allow-lists", () => {
  assert.deepEqual(parseArgs(["--port", "3000", "--allow-email", "*@example.com"]).allowEmails, ["*@example.com"]);
});
test("rejects malformed wildcard email domains", () => {
  assert.throws(() => parseArgs(["--port", "3000", "--allow-email", "*@bad_domain"]), /Invalid email/);
});

// --- named mode must not silently swallow quick-mode origin flags ---
test("named tunnel rejects --host", () => {
  assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "x", "--host", "0.0.0.0"]), /only valid with --mode quick/);
});
test("named tunnel rejects --port", () => {
  assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "x", "--port", "22"]), /only valid with --mode quick/);
});

// --- terminal control characters must never reach echoed output ---
test("rejects control characters in an allow-list email", () => {
  assert.throws(() => parseArgs(["--port", "3000", "--allow-email", "\u001b[31m@x.com"]), /control characters/);
});
test("rejects control characters in a tunnel name", () => {
  assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "t\u001b[31m"]), /control characters/);
});
test("rejects control characters in a hostname", () => {
  assert.throws(() => parseArgs(["--mode", "named", "--config", "x", "--tunnel", "x", "--hostname", "a.example.com\u0007"]), /control characters/);
});

// --- the --flag=value form must reach the same parser ---
test("accepts the --flag=value form", () => {
  const result = parseArgs(["--port=3000", "--allow-email=a@example.com"]);
  assert.equal(result.port, 3000);
  assert.deepEqual(result.allowEmails, ["a@example.com"]);
});
test("accepts the --flag=value form for a named tunnel", () => {
  const result = parseArgs(["--mode=named", "--config=/tmp/config.yml", "--tunnel=preview"]);
  assert.equal(result.mode, "named");
  assert.equal(result.configPath, "/tmp/config.yml");
  assert.equal(result.tunnelName, "preview");
});
test("rejects an inline value on an option that takes none", () => {
  assert.throws(() => parseArgs(["--port=3000", "--public=true"]), /does not take a value/);
});
test("rejects an empty inline value", () => {
  assert.throws(() => parseArgs(["--port="]), /requires a value/);
});
test("rejects control characters in an inline value", () => {
  assert.throws(() => parseArgs(["--allow-email=\u001b[31m@x.com"]), /control characters/);
});
test("the inline form is validated like the spaced form", () => {
  assert.throws(() => parseArgs(["--port=70000", "--public"]), /valid TCP port/);
  assert.throws(() => parseArgs(["--port=3000", "--host=0.0.0.0", "--public"]), /loopback hosts/);
});
