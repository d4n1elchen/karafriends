import assert from "node:assert/strict";
import fs from "node:fs";
import process from "node:process";

import puppeteer from "puppeteer-core";

const baseUrl = process.env.KARAFRIENDS_SMOKE_URL ?? "http://127.0.0.1:8080";
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) =>
  fs.existsSync(candidate),
);
assert.ok(executablePath, "Set CHROME_PATH to a Chrome or Chromium executable");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  assert.match(await page.title(), /Karafriends/);
  await page.waitForSelector('form[action="/rooms"] button');
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('form[action="/rooms"] button'),
  ]);

  const playerUrl = new URL(page.url());
  const roomId = playerUrl.searchParams.get("room");
  assert.match(roomId, /^[a-f0-9]{32}$/);
  await page.waitForSelector("button.btn-large");
  const startLabel = await page.$eval("button.btn-large", (button) =>
    button.textContent.trim(),
  );
  assert.equal(startLabel, "Start karaoke");
  await page.click("button.btn-large");
  await page.waitForSelector("video.karaVid");
  await page.waitForSelector("canvas.qrcode");

  const remote = await browser.newPage();
  remote.on("pageerror", (error) => pageErrors.push(error));
  await remote.goto(`${baseUrl}/remocon/?room=${encodeURIComponent(roomId)}`, {
    waitUntil: "networkidle0",
  });
  await remote.waitForSelector('input[name="nickname"]');
  await remote.type('input[name="nickname"]', "Smoke Guest");
  await Promise.all([
    remote.click('button[type="submit"]'),
    remote.waitForSelector("header"),
  ]);

  const disconnectedRemote = await browser.newPage();
  await disconnectedRemote.setRequestInterception(true);
  disconnectedRemote.on("request", (request) => {
    if (request.url().endsWith("/graphql") && request.method() === "POST") {
      void request.respond({
        status: 503,
        contentType: "text/html",
        body: "Temporarily unavailable",
      });
    } else {
      void request.continue();
    }
  });
  await disconnectedRemote.goto(
    `${baseUrl}/remocon/?room=${encodeURIComponent(roomId)}`,
    { waitUntil: "domcontentloaded" },
  );
  await disconnectedRemote.waitForSelector("header");
  await disconnectedRemote.waitForSelector('[role="status"]');
  assert.ok(
    await disconnectedRemote.$("header"),
    "remote UI was replaced after a network error",
  );

  const failedPage = await browser.newPage();
  await failedPage.setRequestInterception(true);
  failedPage.on("request", (request) => {
    if (request.url().endsWith("/graphql") && request.method() === "POST") {
      void request.respond({
        status: 503,
        contentType: "text/html",
        body: "Temporarily unavailable",
      });
    } else {
      void request.continue();
    }
  });
  await failedPage.goto(
    `${baseUrl}/remocon/?room=${encodeURIComponent(roomId)}#/song/smoke-song`,
    { waitUntil: "domcontentloaded" },
  );
  await failedPage.waitForSelector('main[role="alert"]');
  const retryLabel = await failedPage.$eval(
    'main[role="alert"] button',
    (button) => button.textContent.trim(),
  );
  assert.equal(retryLabel, "Try again");

  assert.deepEqual(pageErrors, []);
  console.log(
    `Web UI smoke passed: launcher, player, remote room ${roomId}, and recoverable network failures.`,
  );
} finally {
  await browser.close();
}
