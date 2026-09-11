import assert from "node:assert/strict";
import { it } from "node:test";
import {
  generateCookieString,
  parseCookies,
  type JoysoundCookies,
} from "./joysoundCookies.ts";

it("preserves session cookies across partial and empty login responses", () => {
  const jar: JoysoundCookies = {};
  parseCookies(["JSESSIONID=session; Path=/; HttpOnly"], jar);
  parseCookies(["AWSALB=balancer; Path=/"], jar);
  parseCookies([], jar);
  assert.equal(
    generateCookieString(jar),
    "JSESSIONID=session; AWSALB=balancer",
  );
});

it("accepts cookies without trailing semicolons and replaces rotated sessions", () => {
  const jar: JoysoundCookies = { JSESSIONID: "old" };
  parseCookies(["JSESSIONID=new=value"], jar);
  assert.equal(generateCookieString(jar), "JSESSIONID=new=value");
});

it("handles Expires commas and preserves cookie names but ignores attributes", () => {
  const jar: JoysoundCookies = {};
  parseCookies(
    [
      "AWSALB=abc; Expires=Wed, 09 Jun 2027 10:18:14 GMT; Path=/",
      "OTHERJSESSIONID=wrong; JSESSIONID=also-wrong",
      "JSESSIONID=right; HttpOnly",
    ],
    jar,
  );
  assert.deepEqual(jar, {
    AWSALB: "abc",
    OTHERJSESSIONID: "wrong",
    JSESSIONID: "right",
  });
});

it("omits cleared cookies from subsequent requests", () => {
  const jar: JoysoundCookies = { AWSALB: "balancer", JSESSIONID: "old" };
  parseCookies(["JSESSIONID=; Max-Age=0"], jar);
  assert.equal(generateCookieString(jar), "AWSALB=balancer");
});

it("supports the current login response without JSESSIONID", () => {
  const jar: JoysoundCookies = {};
  parseCookies(
    ["AWSALB=a; Path=/", "AWSALBCORS=b; Path=/", "XSRF-TOKEN=csrf; Path=/"],
    jar,
  );
  parseCookies([], jar);
  assert.equal(
    generateCookieString(jar),
    "AWSALB=a; AWSALBCORS=b; XSRF-TOKEN=csrf",
  );
  parseCookies(["SESSION=authenticated; HttpOnly"], jar);
  assert.equal(jar.SESSION, "authenticated");
});
