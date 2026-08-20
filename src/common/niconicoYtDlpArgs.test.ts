import assert from "node:assert/strict";
import test from "node:test";

import { getNiconicoYtDlpDownloadArgs } from "./niconicoYtDlpArgs.ts";

test("Niconico downloads use the bundled ffmpeg to merge into MP4", () => {
  const args = getNiconicoYtDlpDownloadArgs(
    "sm9",
    "/data/media/nico-sm9.mp4",
    "/data/resources/ffmpeg/ffmpeg",
  );

  assert.deepEqual(args.slice(0, 5), [
    "--ignore-config",
    "--ffmpeg-location",
    "/data/resources/ffmpeg/ffmpeg",
    "--merge-output-format",
    "mp4",
  ]);
  assert.deepEqual(args.slice(-2), [
    "--",
    "https://www.nicovideo.jp/watch/sm9",
  ]);
});
