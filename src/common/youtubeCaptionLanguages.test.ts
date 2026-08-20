import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDownloadableYoutubeCaptionLanguages,
  isDownloadableYoutubeCaptionCode,
} from "./youtubeCaptionLanguages.ts";

test("accepts safe YouTube language codes used by yt-dlp", () => {
  assert.equal(isDownloadableYoutubeCaptionCode("ja"), true);
  assert.equal(isDownloadableYoutubeCaptionCode("zh-Hant"), true);
  assert.equal(isDownloadableYoutubeCaptionCode("en-US"), true);
  assert.equal(isDownloadableYoutubeCaptionCode("all,-live_chat"), false);
  assert.equal(isDownloadableYoutubeCaptionCode("../ja"), false);
});

test("extracts manual downloadable caption languages", () => {
  assert.deepEqual(
    extractDownloadableYoutubeCaptionLanguages({
      captions: {
        caption_tracks: [
          { vss_id: ".ja", language_code: "ja", name: { text: "Japanese" } },
          {
            vss_id: ".zh-Hant",
            language_code: "zh-Hant",
            name: { text: "Chinese (Traditional)" },
          },
          {
            vss_id: "a.en",
            language_code: "en",
            name: { text: "English (auto-generated)" },
          },
          { vss_id: ".unsafe", language_code: "all,-live_chat" },
        ],
      },
    }),
    [
      { code: "ja", name: "Japanese" },
      { code: "zh-Hant", name: "Chinese (Traditional)" },
    ],
  );
});
