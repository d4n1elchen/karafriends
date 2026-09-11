const COOKIE_IDS = ["AWSALB", "AWSALBCORS", "JSESSIONID"] as const;

export type JoysoundCookies = Partial<
  Record<(typeof COOKIE_IDS)[number], string>
>;

export function generateCookieString(cookies: JoysoundCookies): string {
  return COOKIE_IDS.filter((id) => cookies[id])
    .map((id) => `${id}=${cookies[id]}`)
    .join("; ");
}

// Each response may update only part of the cookie jar, or none of it.
export function parseCookies(headers: string[], target: JoysoundCookies): void {
  for (const header of headers) {
    const match = header.match(/^\s*([^=;\s]+)=([^;]*)/);
    if (!match) continue;
    const id = COOKIE_IDS.find((name) => name === match[1]);
    if (id) target[id] = match[2];
  }
}

export function requireJoysoundSession(cookies: JoysoundCookies): void {
  if (!cookies.JSESSIONID) {
    throw new Error("Joysound login: missing required JSESSIONID cookie");
  }
}
