import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeRoomId } from "./roomIdCore.ts";

describe("normalizeRoomId", () => {
  it("normalizes valid room ids", () => {
    assert.equal(normalizeRoomId("Party-42"), "party-42");
  });

  it("uses main for missing or unsafe ids", () => {
    assert.equal(normalizeRoomId(undefined), "main");
    assert.equal(normalizeRoomId("../other-room"), "main");
    assert.equal(normalizeRoomId("with spaces"), "main");
    assert.equal(normalizeRoomId("a".repeat(33)), "main");
  });
});
