import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidRoomId, normalizeRoomId } from "./roomIdCore.ts";

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

describe("isValidRoomId", () => {
  it("accepts human-readable room ids case-insensitively", () => {
    assert.equal(isValidRoomId("Friday-Karaoke"), true);
    assert.equal(isValidRoomId("room7"), true);
  });

  it("rejects empty, long, or unsafe room ids", () => {
    assert.equal(isValidRoomId(""), false);
    assert.equal(isValidRoomId("with spaces"), false);
    assert.equal(isValidRoomId("../room"), false);
    assert.equal(isValidRoomId("a".repeat(33)), false);
  });
});
