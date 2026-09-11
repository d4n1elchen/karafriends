export type JoysoundCookies = Record<string, string>;

export function generateCookieString(cookies: JoysoundCookies): string {
  return Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

// Keep all cookies issued by Joysound, including XSRF-TOKEN and any login
// cookies. A response may update only part of the jar, or none of it.
export function parseCookies(headers: string[], target: JoysoundCookies): void {
  for (const header of headers) {
    const match = header.match(/^\s*([^=;\s]+)=([^;]*)/);
    if (!match || ["__proto__", "constructor", "prototype"].includes(match[1]))
      continue;
    target[match[1]] = match[2];
  }
}
