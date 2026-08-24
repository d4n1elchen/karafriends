import assert from "node:assert/strict";
import test from "node:test";

import { getYoutubeMediaFormatArgs } from "./youtubeMediaFormat.ts";

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
