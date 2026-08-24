import assert from "node:assert/strict";
import test from "node:test";

import { isIPadRendererDevice } from "./rendererDeviceCore.ts";

test("detects regular and desktop-mode iPad user agents", () => {
  assert.equal(
    isIPadRendererDevice(
      "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "iPad",
      5,
    ),
    true,
  );
  assert.equal(
    isIPadRendererDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "MacIntel",
      5,
    ),
    true,
  );
});

test("does not classify desktop Safari as iPad", () => {
  assert.equal(
    isIPadRendererDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      "MacIntel",
      0,
    ),
    false,
  );
});

test("detects iPad desktop mode from its touch capability", () => {
  assert.equal(
    isIPadRendererDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
      "MacIntel",
      5,
    ),
    true,
  );
});
