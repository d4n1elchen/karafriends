import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKaraokeSearchQuery,
  parseKaraokeKeyword,
} from "./karaokeSearch.ts";

test("adds the selected localized karaoke keyword", () => {
  assert.equal(
    buildKaraokeSearchQuery("夜に駆ける", "jp"),
    "夜に駆ける カラオケ",
  );
  assert.equal(buildKaraokeSearchQuery("My Way", "en"), "My Way karaoke");
  assert.equal(buildKaraokeSearchQuery("小幸運", "zh"), "小幸運 卡拉OK");
});

test("keeps none unchanged and does not duplicate an existing keyword", () => {
  assert.equal(buildKaraokeSearchQuery(" My Way ", "none"), "My Way");
  assert.equal(
    buildKaraokeSearchQuery("My Way KARAOKE", "en"),
    "My Way KARAOKE",
  );
  assert.equal(
    buildKaraokeSearchQuery("夜に駆ける カラオケ", "jp"),
    "夜に駆ける カラオケ",
  );
});

test("accepts only supported URL keyword modes", () => {
  assert.equal(parseKaraokeKeyword("jp"), "jp");
  assert.equal(parseKaraokeKeyword("zh"), "zh");
  assert.equal(parseKaraokeKeyword("other"), null);
  assert.equal(parseKaraokeKeyword(null), null);
});
