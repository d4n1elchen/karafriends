import assert from "node:assert/strict";
import test from "node:test";

import { isIPadUserAgent } from "./rendererDeviceCore.ts";

test("detects regular and desktop-mode iPad user agents", () => {
  assert.equal(
    isIPadUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    ),
    true,
  );
  assert.equal(
    isIPadUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    ),
    true,
  );
});

test("does not classify desktop Safari as iPad", () => {
  assert.equal(
    isIPadUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
    ),
    false,
  );
});
