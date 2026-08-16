import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

import compression from "compression";
import express from "express";

import karafriendsConfig from "../common/config";
import { REMOCON_ADMIN_LOGIN_PATH } from "../common/adminAuthCore";
import { debugLog, isDebugEnabled } from "../common/debug";
import { ensureExternalResources } from "../common/externalResources";
import { normalizeRoomId } from "../common/roomIdCore";
import { TEMP_FOLDER } from "../common/videoDownloader";
import { applyGraphQLMiddleware, getRoom } from "../main/graphql";
import remoconServiceWorkerAllowed from "../main/middleware/remoconServiceWorkerAllowed";
import {
  ADMIN_SESSION_COOKIE,
  getCookie,
  isSafeReturnPath,
  REMOTE_TOKEN_HEADER,
  secureEqual,
} from "./webAuthCore";

const app = express();
const host = process.env.KARAFRIENDS_HOST || "0.0.0.0";
const port = karafriendsConfig.remoconPort;
const publicUrl = process.env.KARAFRIENDS_PUBLIC_URL?.replace(/\/$/, "");
const webRoot = process.env.KARAFRIENDS_WEB_ROOT
  ? path.resolve(process.env.KARAFRIENDS_WEB_ROOT)
  : path.resolve(process.cwd(), "build", "web");
const adminSessionToken = randomBytes(32).toString("base64url");
const remoteAccessToken = randomBytes(32).toString("base64url");

if (!karafriendsConfig.adminPassword) {
  throw new Error(
    "The web admin password is empty. Set adminPassword in config.yaml or KARAFRIENDS_ADMIN_PASSWORD.",
  );
}

fs.mkdirSync(TEMP_FOLDER, { recursive: true });

app.disable("x-powered-by");
if (process.env.KARAFRIENDS_TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}
app.use(compression());
if (isDebugEnabled()) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestPath = req.path;
    res.on("finish", () => {
      debugLog(
        "http",
        `${req.method} ${requestPath} -> ${res.statusCode} (${Date.now() - startedAt}ms)`,
      );
    });
    next();
  });
}
app.use(remoconServiceWorkerAllowed());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

function hasAdminSession(cookieHeader: unknown): boolean {
  return secureEqual(
    getCookie(cookieHeader, ADMIN_SESSION_COOKIE),
    adminSessionToken,
  );
}

function hasRemoteAccess(token: unknown): boolean {
  return secureEqual(token, remoteAccessToken);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function loginPage(nextPath: string, invalidPassword = false): string {
  const safeNextPath = isSafeReturnPath(nextPath) ? nextPath : "/";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in · Karafriends</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #111; }
      main { width: min(24rem, calc(100% - 3rem)); }
      form { display: grid; gap: 1rem; padding: 2rem; border: 1px solid #333; border-radius: .75rem; background: #1b1b1b; }
      h1 { margin: 0; }
      label { font-weight: 600; }
      input, button { box-sizing: border-box; width: 100%; padding: .8rem; border-radius: .4rem; font: inherit; }
      input { border: 1px solid #555; background: #111; color: white; }
      button { border: 0; color: white; background: #e53935; cursor: pointer; }
      .error { color: #ff8a80; }
    </style>
  </head>
  <body>
    <main>
      <form method="post" action="/login">
        <h1>Karafriends admin</h1>
        ${invalidPassword ? '<p class="error" role="alert">Incorrect password.</p>' : ""}
        <input type="hidden" name="next" value="${escapeHtml(safeNextPath)}">
        <label for="password">Admin password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
        <button type="submit">Open Karafriends</button>
      </form>
    </main>
  </body>
</html>`;
}

app.get("/login", (req, res) => {
  const nextPath = typeof req.query.next === "string" ? req.query.next : "/";
  if (hasAdminSession(req.headers.cookie)) {
    res.redirect(303, isSafeReturnPath(nextPath) ? nextPath : "/");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(loginPage(nextPath));
});

app.post("/login", express.urlencoded({ extended: false }), (req, res) => {
  const nextPath = isSafeReturnPath(req.body.next) ? req.body.next : "/";
  if (!secureEqual(req.body.password, karafriendsConfig.adminPassword)) {
    res.status(401).setHeader("Cache-Control", "no-store");
    res.type("html").send(loginPage(nextPath, true));
    return;
  }

  res.cookie(ADMIN_SESSION_COOKIE, adminSessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: req.secure,
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
  res.redirect(303, nextPath);
});

app.post("/logout", (_req, res) => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
  res.redirect(303, "/login");
});

app.get("/remote", (_req, res) => res.redirect("/remocon/"));

app.use((req, res, next) => {
  if (req.path === "/remocon" || req.path.startsWith("/remocon/")) {
    next();
    return;
  }

  if (
    (req.path === "/graphql" || req.path === REMOCON_ADMIN_LOGIN_PATH) &&
    hasRemoteAccess(req.headers[REMOTE_TOKEN_HEADER])
  ) {
    next();
    return;
  }

  if (hasAdminSession(req.headers.cookie)) {
    next();
    return;
  }

  if (req.method === "GET" && req.accepts("html")) {
    res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }

  res.status(401).json({ error: "Authentication required" });
});

function createRoom(): string {
  const roomId = randomBytes(16).toString("hex");
  getRoom(roomId);
  return roomId;
}

function remoteUrl(req: express.Request, roomId: string): string {
  const origin = publicUrl || `${req.protocol}://${req.get("host")}`;
  const url = new URL("/remocon/", origin);
  url.searchParams.set("room", roomId);
  url.searchParams.set("remoteToken", remoteAccessToken);
  return url.toString();
}

app.get("/api/remote-access", (req, res) => {
  const roomId = normalizeRoomId(req.query.room);
  res.setHeader("Cache-Control", "no-store");
  res.json({ remoteUrl: remoteUrl(req, roomId) });
});

app.post("/api/rooms", (req, res) => {
  const roomId = createRoom();
  const origin = publicUrl || `${req.protocol}://${req.get("host")}`;
  res.status(201).json({
    roomId,
    playerUrl: `${origin}/renderer/?room=${roomId}`,
    remoteUrl: remoteUrl(req, roomId),
  });
});

app.post("/rooms", (_req, res) => {
  res.redirect(303, `/renderer/?room=${createRoom()}`);
});

// Downloads created by the GraphQL queue resolvers are exposed through a
// normal same-origin URL in browsers. express.static contains path traversal
// to this single media directory and does not expose arbitrary host files.
app.use(
  "/media",
  express.static(TEMP_FOLDER, {
    dotfiles: "deny",
    fallthrough: false,
    index: false,
  }),
);

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Karafriends</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #111; }
      main { width: min(30rem, calc(100% - 3rem)); text-align: center; }
      form { margin: 2rem 0; }
      button, a { display: inline-block; padding: .8rem 1.1rem; border-radius: .4rem; }
      button { border: 0; color: white; background: #e53935; font: inherit; cursor: pointer; }
      a { color: #ff8a80; }
    </style>
  </head>
  <body>
    <main>
      <h1>Karafriends</h1>
      <p>Create an isolated karaoke room. The player will show a QR code for guests.</p>
      <form method="post" action="/rooms"><button type="submit">Create room</button></form>
      <p><a href="/renderer/?room=main">Open main player</a> · <a href="${escapeHtml(remoteUrl(req, "main"))}">Open main remote</a></p>
      <form method="post" action="/logout"><button type="submit">Sign out</button></form>
    </main>
  </body>
</html>`);
});
app.use("/renderer", express.static(path.join(webRoot, "renderer")));
app.use("/remocon", express.static(path.join(webRoot, "remocon")));

applyGraphQLMiddleware(app, {
  host,
  port,
  authorizeWebSocket: (request, connectionParams) =>
    hasAdminSession(request.headers.cookie) ||
    hasRemoteAccess(connectionParams?.remoteToken),
  onFatalError: (title, error) => {
    console.error(`${title}:`, error);
    process.exitCode = 1;
  },
});

ensureExternalResources().catch((error) => {
  console.error("Failed to prepare external media tools:", error);
});
