export function isDebugEnabled(value = process.env.KARAFRIENDS_DEBUG): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export function debugLog(scope: string, message: string): void {
  if (!isDebugEnabled()) return;
  console.log(`[${scope}:debug] ${message}`);
}

export function debugError(
  scope: string,
  message: string,
  reason: unknown,
): void {
  if (!isDebugEnabled()) return;
  const detail =
    reason instanceof Error ? reason.stack || reason.message : String(reason);
  console.error(`[${scope}:debug] ${message}\n${detail}`);
}
