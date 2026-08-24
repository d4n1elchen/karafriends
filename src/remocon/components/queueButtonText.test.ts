import assert from "node:assert/strict";
import test from "node:test";

import {
  DOWNLOADING_TEXT,
  downloadingText,
  polledQueueText,
  queuedText,
} from "./queueButtonText.ts";

test("formats download progress without reporting invalid percentages", () => {
  assert.equal(downloadingText(0.423), "Downloading… 42%");
  assert.equal(downloadingText(2), "Downloading… 100%");
  assert.equal(downloadingText(-1), DOWNLOADING_TEXT);
});

test("formats a queue ETA as an approximate start time", () => {
  assert.equal(queuedText(330), "Queued — starts in ~5:30");
});

test("reports a download that vanished before the song was queued", () => {
  assert.equal(
    polledQueueText(false, -1, "Queued — starts in ~5:30"),
    "Error: download failed",
  );
  assert.equal(
    polledQueueText(false, 0.5, "Queued — starts in ~5:30"),
    "Downloading… 50%",
  );
  assert.equal(
    polledQueueText(true, -1, "Queued — starts in ~5:30"),
    "Queued — starts in ~5:30",
  );
});

test("does not display a negative queue ETA", () => {
  assert.equal(queuedText(-1), "Queued — starts in ~0:00");
});
