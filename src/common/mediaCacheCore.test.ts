import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { getMediaCacheRequirements } from "./mediaCacheCore.ts";

const mediaDirectory = path.join("data", "media");

test("YouTube requires only the downloaded video, not optional captions", () => {
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "YOUTUBE", "abc_123-x", null),
    [path.join(mediaDirectory, "yt-abc_123-x.mp4")],
  );
});

test("Joysound requires its selected video and telop", () => {
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "JOYSOUND", "1234", null),
    [
      path.join(mediaDirectory, "joysound-1234-default.mp4"),
      path.join(mediaDirectory, "joysound-1234.joy_02"),
    ],
  );
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "JOYSOUND", "1234", "ytId"),
    [
      path.join(mediaDirectory, "joysound-1234-ytId.mp4"),
      path.join(mediaDirectory, "joysound-1234.joy_02"),
    ],
  );
});

test("DAM and Niconico use their source-specific MP4 cache keys", () => {
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "DAM", "42", "1"),
    [path.join(mediaDirectory, "42-1.mp4")],
  );
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "NICONICO", "sm9", null),
    [path.join(mediaDirectory, "nico-sm9.mp4")],
  );
});

test("unsafe or incomplete cache keys cannot probe the filesystem", () => {
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "YOUTUBE", "../secret", null),
    [],
  );
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "DAM", "42", null),
    [],
  );
});
