import assert from "node:assert/strict";
import fs from "node:fs";
import process from "node:process";

import puppeteer from "puppeteer-core";

const baseUrl = process.env.KARAFRIENDS_SMOKE_URL ?? "http://127.0.0.1:8080";
const adminPassword = process.env.KARAFRIENDS_ADMIN_PASSWORD;
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
  const telemetryRequests = [];
  const monitorTelemetry = (targetPage) => {
    targetPage.on("request", (request) => {
      const hostname = new URL(request.url()).hostname;
      if (hostname === "sentry.io" || hostname.endsWith(".sentry.io")) {
        telemetryRequests.push(request.url());
      }
    });
  };

  const page = await browser.newPage();
  monitorTelemetry(page);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto(baseUrl, { waitUntil: "networkidle0" });
  if (new URL(page.url()).pathname === "/login") {
    assert.ok(
      adminPassword,
      "Set KARAFRIENDS_ADMIN_PASSWORD when testing an authenticated server",
    );
    await page.type('input[name="password"]', adminPassword);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click('form[action="/login"] button[type="submit"]'),
    ]);
  }
  assert.match(await page.title(), /Karafriends/);
  await page.waitForSelector('form[action="/rooms"] button');
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('form[action="/rooms"] button'),
  ]);

  const playerUrl = new URL(page.url());
  const roomId = playerUrl.searchParams.get("room");
  assert.match(roomId, /^[a-f0-9]{32}$/);
  const remoteUrl = await page.evaluate(async (room) => {
    const response = await fetch(
      `/api/remote-access?room=${encodeURIComponent(room)}`,
    );
    if (!response.ok) throw new Error(`Remote URL failed: ${response.status}`);
    return (await response.json()).remoteUrl;
  }, roomId);
  assert.match(
    new URL(remoteUrl).searchParams.get("remoteToken"),
    /^[A-Za-z0-9_-]{40,}$/,
  );
  await page.waitForSelector("button.btn-large");
  const startLabel = await page.$eval("button.btn-large", (button) =>
    button.textContent.trim(),
  );
  assert.equal(startLabel, "Start karaoke");
  await page.click("button.btn-large");
  await page.waitForSelector("video.karaVid");
  await page.waitForSelector("canvas.qrcode");
  const qrLink = await page.$eval("a.qrcodeLink", (link) => ({
    href: link.href,
    target: link.target,
  }));
  assert.equal(qrLink.target, "_blank");
  assert.equal(new URL(qrLink.href).searchParams.get("room"), roomId);
  assert.match(
    new URL(qrLink.href).searchParams.get("remoteToken"),
    /^[A-Za-z0-9_-]{40,}$/,
  );
  const playerLayout = await page.evaluate(() => ({
    pageWidth: document.body.scrollWidth,
    sidebarWidth: document.querySelector(".appSidebar").clientWidth,
    viewportWidth: window.innerWidth,
  }));
  assert.ok(
    Math.abs(playerLayout.sidebarWidth / playerLayout.viewportWidth - 0.1) <
      0.01,
    "sidebar should use approximately 10% of the viewport",
  );
  assert.equal(
    playerLayout.pageWidth,
    playerLayout.viewportWidth,
    "player layout should not overflow horizontally",
  );
  const settingsToggle = 'button[aria-controls="player-settings"]';
  assert.equal(
    await page.$eval(settingsToggle, (button) => button.ariaExpanded),
    "false",
  );
  assert.equal(await page.$("#player-settings"), null);
  await page.click(settingsToggle);
  await page.waitForSelector("#player-settings");
  const expandedSettings = await page.evaluate(() => {
    const settings = document.querySelector("#player-settings");
    return {
      clientWidth: settings.clientWidth,
      scrollWidth: settings.scrollWidth,
    };
  });
  assert.equal(
    await page.$eval(settingsToggle, (button) => button.ariaExpanded),
    "true",
  );
  assert.ok(
    expandedSettings.scrollWidth <= expandedSettings.clientWidth,
    "expanded settings should not overflow horizontally",
  );

  const noAudioWorkletPage = await browser.newPage();
  monitorTelemetry(noAudioWorkletPage);
  const noAudioWorkletErrors = [];
  noAudioWorkletPage.on("pageerror", (error) =>
    noAudioWorkletErrors.push(error),
  );
  await noAudioWorkletPage.evaluateOnNewDocument(() => {
    Object.defineProperty(AudioContext.prototype, "audioWorklet", {
      configurable: true,
      value: undefined,
    });
  });
  await noAudioWorkletPage.goto(playerUrl.toString(), {
    waitUntil: "networkidle0",
  });
  await noAudioWorkletPage.waitForSelector("button.btn-large");
  assert.deepEqual(
    noAudioWorkletErrors,
    [],
    "player should load when AudioWorklet is unavailable",
  );
  await noAudioWorkletPage.close();

  const remote = await browser.newPage();
  monitorTelemetry(remote);
  remote.on("pageerror", (error) => pageErrors.push(error));
  await remote.goto(remoteUrl, { waitUntil: "networkidle0" });
  await remote.waitForSelector('input[name="nickname"]');
  await remote.type('input[name="nickname"]', "Smoke Guest");
  await Promise.all([
    remote.click('button[type="submit"]'),
    remote.waitForSelector("header"),
  ]);
  await remote.click('button[aria-label^="Change nickname"]');
  await remote.waitForSelector('input[name="nickname"]');
  assert.equal(
    await remote.evaluate(() => localStorage.getItem("nickname")),
    null,
  );
  await remote.type('input[name="nickname"]', "Smoke Guest");
  await Promise.all([
    remote.click('button[type="submit"]'),
    remote.waitForSelector("header"),
  ]);

  const invalidRemoteUrl = new URL(remoteUrl);
  invalidRemoteUrl.searchParams.set("remoteToken", "invalid-smoke-token");

  // Use a separate browser context so the admin cookie from the player login
  // cannot accidentally authorize these deliberately broken remote requests.
  const unauthenticatedContext = await browser.createBrowserContext();
  const disconnectedRemote = await unauthenticatedContext.newPage();
  await disconnectedRemote.evaluateOnNewDocument(() => {
    localStorage.setItem("nickname", "Smoke Guest");
  });
  monitorTelemetry(disconnectedRemote);
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
  await disconnectedRemote.goto(invalidRemoteUrl.toString(), {
    waitUntil: "domcontentloaded",
  });
  await disconnectedRemote.waitForSelector("header");
  await disconnectedRemote.waitForSelector('[role="status"]');
  assert.ok(
    await disconnectedRemote.$("header"),
    "remote UI was replaced after a network error",
  );

  const failedPage = await unauthenticatedContext.newPage();
  await failedPage.evaluateOnNewDocument(() => {
    localStorage.setItem("nickname", "Smoke Guest");
  });
  monitorTelemetry(failedPage);
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
  await failedPage.goto(`${invalidRemoteUrl.toString()}#/song/smoke-song`, {
    waitUntil: "domcontentloaded",
  });
  await failedPage.waitForSelector('main[role="alert"]');
  const retryLabel = await failedPage.$eval(
    'main[role="alert"] button',
    (button) => button.textContent.trim(),
  );
  assert.equal(retryLabel, "Try again");
  await unauthenticatedContext.close();

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(
    telemetryRequests,
    [],
    "browser telemetry should be disabled without an explicit DSN",
  );
  console.log(
    `Web UI smoke passed: launcher, player, remote room ${roomId}, and recoverable network failures.`,
  );
} finally {
  await browser.close();
}
