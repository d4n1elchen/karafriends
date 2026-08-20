import assert from "node:assert/strict";
import test from "node:test";

import { youtubeSearchResultHasCaptions } from "./youtubeSearchCore.ts";

test("detects YouTube caption indicators without matching unrelated badges", () => {
  assert.equal(youtubeSearchResultHasCaptions({ has_captions: true }), true);
  assert.equal(
    youtubeSearchResultHasCaptions({ badges: [{ label: "CC" }] }),
    true,
  );
  assert.equal(
    youtubeSearchResultHasCaptions({ badges: [{ tooltip: "Subtitles" }] }),
    true,
  );
  assert.equal(
    youtubeSearchResultHasCaptions({ badges: [{ label: "4K" }] }),
    false,
  );
});
