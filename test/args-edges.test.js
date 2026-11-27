import test from "node:test";
import assert from "node:assert/strict";
import { originUrl } from "../src/args.js";

test("originUrl rejects out-of-range ports", () => {
  assert.throws(() => originUrl("127.0.0.1", 0), /between 1 and 65535/);
  assert.equal(originUrl("::1", 3000), "http://[::1]:3000");
});
