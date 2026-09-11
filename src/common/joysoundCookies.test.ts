import assert from "node:assert/strict";
import { it } from "node:test";
import {
  generateCookieString,
  parseCookies,
  requireJoysoundSession,
  type JoysoundCookies,
} from "./joysoundCookies.ts";

it("preserves session cookies across partial and empty login responses", () => {
  const jar: JoysoundCookies = {};
  parseCookies(["JSESSIONID=session; Path=/; HttpOnly"], jar);
  parseCookies(["AWSALB=balancer; Path=/"], jar);
  parseCookies([], jar);
  requireJoysoundSession(jar);
  assert.equal(
    generateCookieString(jar),
    "AWSALB=balancer; JSESSIONID=session",
  );
});

it("accepts cookies without trailing semicolons and replaces rotated sessions", () => {
  const jar: JoysoundCookies = { JSESSIONID: "old" };
  parseCookies(["JSESSIONID=new=value"], jar);
  assert.equal(generateCookieString(jar), "JSESSIONID=new=value");
});

it("handles Expires commas and ignores unrelated cookies and attributes", () => {
  const jar: JoysoundCookies = {};
  parseCookies(
    [
      "AWSALB=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/",
      "OTHERJSESSIONID=wrong; JSESSIONID=also-wrong",
      "JSESSIONID=right; HttpOnly",
    ],
    jar,
  );
  assert.deepEqual(jar, { AWSALB: "abc", JSESSIONID: "right" });
});

it("reports missing or cleared sessions without exposing cookie values", () => {
  const jar: JoysoundCookies = { AWSALB: "secret", JSESSIONID: "old" };
  parseCookies(["JSESSIONID=; Max-Age=0"], jar);
  assert.throws(() => requireJoysoundSession(jar), {
    message: "Joysound login: missing required JSESSIONID cookie",
  });
  assert.equal(generateCookieString(jar), "AWSALB=secret");
});
