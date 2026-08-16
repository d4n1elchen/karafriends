import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCookie, isSafeReturnPath, secureEqual } from "./webAuthCore.ts";

describe("secureEqual", () => {
  it("compares credentials without depending on their length", () => {
    assert.equal(secureEqual("correct horse", "correct horse"), true);
    assert.equal(secureEqual("wrong", "correct horse"), false);
    assert.equal(secureEqual(undefined, "correct horse"), false);
  });
});

describe("getCookie", () => {
  it("reads and decodes an individual cookie", () => {
    assert.equal(getCookie("one=1; session=a%2Fb; three=3", "session"), "a/b");
  });

  it("rejects missing and malformed cookies", () => {
    assert.equal(getCookie("one=1", "session"), null);
    assert.equal(getCookie("session=%E0%A4%A", "session"), null);
  });
});

describe("isSafeReturnPath", () => {
  it("accepts local application paths", () => {
    assert.equal(isSafeReturnPath("/renderer/?room=main"), true);
  });

  it("rejects login loops and external-looking paths", () => {
    assert.equal(isSafeReturnPath("//example.com"), false);
    assert.equal(isSafeReturnPath("/login?again=1"), false);
    assert.equal(isSafeReturnPath("https://example.com"), false);
    assert.equal(isSafeReturnPath("/\\example.com"), false);
  });
});
