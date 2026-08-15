import * as Sentry from "@sentry/browser";

import { getBrowserTelemetryConfig } from "./telemetryConfig";

export function initializeBrowserTelemetry(): void {
  Sentry.init(getBrowserTelemetryConfig());
}
