import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "karafriends_admin";
export const REMOTE_TOKEN_HEADER = "x-karafriends-remote-token";

export function secureEqual(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || !actual || !expected) return false;

  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function getCookie(cookieHeader: unknown, name: string): string | null {
  if (typeof cookieHeader !== "string") return null;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function isSafeReturnPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/login") &&
    !value.includes("\\")
  );
}
