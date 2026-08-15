export interface BrowserTelemetryConfig {
  dsn: string | undefined;
  enabled: boolean;
  debug: boolean;
}

export function getBrowserTelemetryConfig(
  dsnValue = process.env.KARAFRIENDS_SENTRY_DSN,
  debugValue = process.env.KARAFRIENDS_SENTRY_DEBUG,
): BrowserTelemetryConfig {
  const dsn = dsnValue?.trim() || undefined;
  return {
    dsn,
    enabled: dsn !== undefined,
    debug: debugValue === "1" || debugValue?.toLowerCase() === "true",
  };
}
