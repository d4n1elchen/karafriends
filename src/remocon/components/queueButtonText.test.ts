import assert from "node:assert/strict";
import test from "node:test";

import { queuedText } from "./queueButtonText.ts";

test("formats a queue ETA as an approximate start time", () => {
  assert.equal(queuedText(330), "Queued — starts in ~5:30");
});

test("does not display a negative queue ETA", () => {
  assert.equal(queuedText(-1), "Queued — starts in ~0:00");
});
