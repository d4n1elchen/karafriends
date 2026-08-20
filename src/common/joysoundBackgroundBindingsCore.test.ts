import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidJoysoundSongId,
  isValidYoutubeBackgroundId,
  parseJoysoundBackgroundBindings,
  serializeJoysoundBackgroundBindings,
} from "./joysoundBackgroundBindingsCore.ts";

test("round-trips valid Joysound background bindings", () => {
  const bindings = {
    "123456": {
      youtubeVideoId: "MFwtpM21wWc",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
  };
  assert.deepEqual(
    parseJoysoundBackgroundBindings(
      serializeJoysoundBackgroundBindings(bindings),
    ),
    bindings,
  );
});

test("rejects an invalid envelope and drops unsafe entries", () => {
  assert.throws(
    () => parseJoysoundBackgroundBindings("{}"),
    /Invalid Joysound background binding file/,
  );
  assert.deepEqual(
    parseJoysoundBackgroundBindings(
      JSON.stringify({
        version: 1,
        bindings: {
          "../unsafe": {
            youtubeVideoId: "MFwtpM21wWc",
            updatedAt: "now",
          },
          "123456": { youtubeVideoId: "invalid", updatedAt: "now" },
        },
      }),
    ),
    {},
  );
});

test("validates provider IDs", () => {
  assert.equal(isValidJoysoundSongId("123456"), true);
  assert.equal(isValidJoysoundSongId("../123"), false);
  assert.equal(isValidYoutubeBackgroundId("MFwtpM21wWc"), true);
  assert.equal(isValidYoutubeBackgroundId("short"), false);
});
