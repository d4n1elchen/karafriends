import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  getMediaCacheRequirements,
  hasAnyMediaCache,
  normalizeMediaCacheSuffix,
  verifyMediaCacheRequirements,
} from "./mediaCacheCore.ts";

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
    getMediaCacheRequirements(mediaDirectory, "JOYSOUND", "1234", ""),
    getMediaCacheRequirements(mediaDirectory, "JOYSOUND", "1234", null),
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
  assert.equal(normalizeMediaCacheSuffix(1), "1");
  assert.deepEqual(
    getMediaCacheRequirements(mediaDirectory, "DAM", "42", "1"),
    [path.join(mediaDirectory, "42-1.mp4")],
  );
  assert.deepEqual(getMediaCacheRequirements(mediaDirectory, "DAM", "42", 1), [
    path.join(mediaDirectory, "42-1.mp4"),
  ]);
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

test("search-result cache status finds any usable source variant", () => {
  assert.equal(hasAnyMediaCache(["42-1.mp4"], "DAM", "42"), true);
  assert.equal(
    hasAnyMediaCache(
      ["joysound-1234-custom.mp4", "joysound-1234.joy_02"],
      "JOYSOUND",
      "1234",
    ),
    true,
  );
  assert.equal(
    hasAnyMediaCache(["joysound-1234-custom.mp4"], "JOYSOUND", "1234"),
    false,
  );
  assert.equal(
    hasAnyMediaCache(["yt-video.mp4", "yt-video.vtt"], "YOUTUBE", "video"),
    true,
  );
  assert.equal(hasAnyMediaCache(["yt-video.vtt"], "YOUTUBE", "video"), false);
  assert.equal(hasAnyMediaCache(["nico-sm9.mp4"], "NICONICO", "sm9"), true);
});

test("completion verification rejects missing final output files", () => {
  const existing = new Set([
    path.join(mediaDirectory, "joysound-1234-default.mp4"),
    path.join(mediaDirectory, "joysound-1234.joy_02"),
    path.join(mediaDirectory, "yt-video.mp4"),
  ]);
  const exists = (filename: string) => existing.has(filename);

  assert.equal(
    verifyMediaCacheRequirements(
      mediaDirectory,
      "JOYSOUND",
      "1234",
      null,
      exists,
    ).complete,
    true,
  );
  assert.equal(
    verifyMediaCacheRequirements(
      mediaDirectory,
      "YOUTUBE",
      "video",
      null,
      exists,
    ).complete,
    true,
  );
  assert.deepEqual(
    verifyMediaCacheRequirements(
      mediaDirectory,
      "NICONICO",
      "sm9",
      null,
      exists,
    ).missingFiles,
    [path.join(mediaDirectory, "nico-sm9.mp4")],
  );
  assert.deepEqual(
    verifyMediaCacheRequirements(mediaDirectory, "DAM", "42", 1, exists)
      .missingFiles,
    [path.join(mediaDirectory, "42-1.mp4")],
  );
});
