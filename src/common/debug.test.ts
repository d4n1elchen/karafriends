import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isDebugEnabled } from "./debug.ts";

describe("isDebugEnabled", () => {
  it("accepts explicit true values", () => {
    assert.equal(isDebugEnabled("1"), true);
    assert.equal(isDebugEnabled("true"), true);
    assert.equal(isDebugEnabled("TRUE"), true);
  });

  it("is disabled by default and for other values", () => {
    assert.equal(isDebugEnabled(undefined), false);
    assert.equal(isDebugEnabled("0"), false);
    assert.equal(isDebugEnabled("false"), false);
  });
});
