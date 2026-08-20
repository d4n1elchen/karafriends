import assert from "node:assert/strict";
import test from "node:test";

import { isValidYoutubeCaptionCode } from "./youtubeCaptionCode.ts";

test("accepts YouTube language tags including region and script variants", () => {
  assert.equal(isValidYoutubeCaptionCode("ja"), true);
  assert.equal(isValidYoutubeCaptionCode("zh-TW"), true);
  assert.equal(isValidYoutubeCaptionCode("zh-Hant"), true);
  assert.equal(isValidYoutubeCaptionCode("en-US"), true);
});

test("rejects yt-dlp selector syntax and unsafe path characters", () => {
  assert.equal(isValidYoutubeCaptionCode("all,-live_chat"), false);
  assert.equal(isValidYoutubeCaptionCode("../zh-TW"), false);
  assert.equal(isValidYoutubeCaptionCode("zh/TW"), false);
  assert.equal(isValidYoutubeCaptionCode(""), false);
});
