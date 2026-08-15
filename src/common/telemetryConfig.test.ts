import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getBrowserTelemetryConfig } from "./telemetryConfig.ts";

describe("getBrowserTelemetryConfig", () => {
  it("disables telemetry when no DSN is configured", () => {
    assert.deepEqual(getBrowserTelemetryConfig(undefined, undefined), {
      dsn: undefined,
      enabled: false,
      debug: false,
    });
  });

  it("enables explicitly configured telemetry", () => {
    assert.deepEqual(
      getBrowserTelemetryConfig(" https://example.test/1 ", "1"),
      {
        dsn: "https://example.test/1",
        enabled: true,
        debug: true,
      },
    );
  });
});
