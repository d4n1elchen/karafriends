import assert from "node:assert/strict";
import test from "node:test";

import {
  getJoysoundBackgroundFormatArgs,
  getYoutubeMediaFormatArgs,
} from "./youtubeMediaFormat.ts";

test("preferred YouTube formats require H.264 video and M4A audio", () => {
  const args = getYoutubeMediaFormatArgs(false);
  const selector = args[args.indexOf("-f") + 1];

  assert.match(selector, /vcodec\^=avc1/);
  assert.match(selector, /ba\[ext=m4a\]/);
  assert.match(selector, /\/18$/);
});

test("YouTube fallback uses the iPad-compatible progressive format", () => {
  assert.deepEqual(getYoutubeMediaFormatArgs(true), ["-f", "18"]);
});

test("Joysound backgrounds prefer video-only H.264 for fast remuxing", () => {
  const args = getJoysoundBackgroundFormatArgs(false);
  const selector = args[args.indexOf("-f") + 1];

  assert.match(selector, /vcodec\^=avc1/);
  assert.doesNotMatch(selector, /\+/);
});

test("Joysound backgrounds can fall back to any video codec", () => {
  assert.deepEqual(getJoysoundBackgroundFormatArgs(true), [
    "-S",
    "res:720,ext:mp4",
    "-f",
    "bv",
  ]);
});
