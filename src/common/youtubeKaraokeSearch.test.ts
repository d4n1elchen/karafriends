import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeSearchQuery,
  parseYoutubeKaraokeKeyword,
} from "./youtubeKaraokeSearch.ts";

test("adds the selected localized karaoke keyword", () => {
  assert.equal(
    buildYoutubeSearchQuery("夜に駆ける", "jp"),
    "夜に駆ける カラオケ",
  );
  assert.equal(buildYoutubeSearchQuery("My Way", "en"), "My Way karaoke");
  assert.equal(buildYoutubeSearchQuery("小幸運", "zh"), "小幸運 卡拉OK");
});

test("keeps none unchanged and does not duplicate an existing keyword", () => {
  assert.equal(buildYoutubeSearchQuery(" My Way ", "none"), "My Way");
  assert.equal(
    buildYoutubeSearchQuery("My Way KARAOKE", "en"),
    "My Way KARAOKE",
  );
  assert.equal(
    buildYoutubeSearchQuery("夜に駆ける カラオケ", "jp"),
    "夜に駆ける カラオケ",
  );
});

test("accepts only supported URL keyword modes", () => {
  assert.equal(parseYoutubeKaraokeKeyword("jp"), "jp");
  assert.equal(parseYoutubeKaraokeKeyword("zh"), "zh");
  assert.equal(parseYoutubeKaraokeKeyword("other"), null);
  assert.equal(parseYoutubeKaraokeKeyword(null), null);
});
