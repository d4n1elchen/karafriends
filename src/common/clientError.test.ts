import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toUserErrorMessage } from "./clientError.ts";

describe("toUserErrorMessage", () => {
  it("makes fetch failures understandable", () => {
    assert.match(
      toUserErrorMessage(new TypeError("Failed to fetch")),
      /cannot be reached/,
    );
  });

  it("preserves useful server errors", () => {
    assert.equal(
      toUserErrorMessage(new Error("Server returned HTTP 503")),
      "Server returned HTTP 503",
    );
  });

  it("does not expose useless object formatting", () => {
    assert.match(toUserErrorMessage({ code: 1006 }), /Something went wrong/);
  });
});
