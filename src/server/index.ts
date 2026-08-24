import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

import compression from "compression";
import express from "express";

import karafriendsConfig from "../common/config";
import { REMOCON_ADMIN_LOGIN_PATH } from "../common/adminAuthCore";
import { debugLog, isDebugEnabled } from "../common/debug";
import { ensureExternalResources } from "../common/externalResources";
import { isValidRoomId, normalizeRoomId } from "../common/roomIdCore";
import { TEMP_FOLDER } from "../common/videoDownloader";
import {
  applyGraphQLMiddleware,
  getExistingRoom,
  getRoom,
} from "../main/graphql";
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

function hasRemoteAccess(token: unknown, roomId: unknown): boolean {
  const room = getExistingRoom(roomId);
  return room ? secureEqual(token, room.remoteToken) : false;
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
    hasRemoteAccess(
      req.headers[REMOTE_TOKEN_HEADER],
      req.headers["x-karafriends-room"],
    )
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

function createRoom(requestedRoomId?: unknown): string | null {
  const hasRequestedId =
    typeof requestedRoomId === "string" && requestedRoomId.trim() !== "";
  if (hasRequestedId && !isValidRoomId(requestedRoomId.trim())) return null;

  const roomId = hasRequestedId
    ? normalizeRoomId((requestedRoomId as string).trim())
    : randomBytes(16).toString("hex");
  getRoom(roomId);
  return roomId;
}

function remoteUrl(req: express.Request, roomId: string): string {
  const room = getRoom(roomId);
  const origin = publicUrl || `${req.protocol}://${req.get("host")}`;
  const url = new URL("/remocon/", origin);
  url.searchParams.set("room", room.id);
  url.searchParams.set("remoteToken", room.remoteToken);
  return url.toString();
}

app.get("/api/remote-access", (req, res) => {
  const roomId = normalizeRoomId(req.query.room);
  res.setHeader("Cache-Control", "no-store");
  res.json({ remoteUrl: remoteUrl(req, roomId) });
});

app.post("/api/rooms", express.json(), (req, res) => {
  const roomId = createRoom(req.body?.roomId);
  if (!roomId) {
    res.status(400).json({
      error:
        "Room ID must be 1-32 characters using letters, numbers, or hyphens.",
    });
    return;
  }
  const origin = publicUrl || `${req.protocol}://${req.get("host")}`;
  res.status(201).json({
    roomId,
    playerUrl: `${origin}/renderer/?room=${roomId}`,
    remoteUrl: remoteUrl(req, roomId),
  });
});

app.post("/rooms", express.urlencoded({ extended: false }), (req, res) => {
  const roomId = createRoom(req.body.roomId);
  if (!roomId) {
    res
      .status(400)
      .type("text")
      .send(
        "Room ID must be 1-32 characters using letters, numbers, or hyphens.",
      );
    return;
  }
  res.redirect(303, `/renderer/?room=${roomId}`);
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
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #111; color: #fff; }
      main { width: min(34rem, calc(100% - 2rem)); }
      dialog { position: fixed; inset: 0; box-sizing: border-box; width: min(32rem, calc(100% - 2rem)); max-height: calc(100% - 2rem); margin: auto; padding: 0; border: 1px solid #3c3c3c; border-radius: 1rem; overflow: auto; background: #1b1b1b; color: #fff; box-shadow: 0 1.5rem 5rem #000a; }
      .dialog-content { padding: 2rem; }
      h1, h2, p { margin-top: 0; }
      h2 { margin-bottom: .75rem; font-size: 1rem; color: #ccc; }
      form { display: grid; gap: .75rem; }
      label { font-weight: 650; }
      input, button, .recent-room { box-sizing: border-box; width: 100%; padding: .85rem 1rem; border-radius: .5rem; font: inherit; }
      input { border: 1px solid #555; background: #111; color: #fff; }
      input:focus { outline: 2px solid #ef5350; outline-offset: 1px; }
      button { border: 0; color: #fff; background: #e53935; cursor: pointer; }
      .secondary { background: #383838; }
      .hint, .empty { color: #aaa; font-size: .9rem; }
      .recent { margin: 1.75rem 0; }
      .recent-list { display: grid; gap: .5rem; }
      .recent-room { display: flex; justify-content: space-between; text-decoration: none; color: #fff; background: #282828; }
      .recent-room:hover { background: #333; }
      .footer { display: flex; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; }
      .footer a { color: #ff8a80; }
      .logout { width: auto; padding: 0; margin: 0; background: none; color: #ff8a80; }
    </style>
  </head>
  <body>
    <main>
      <dialog open aria-labelledby="room-dialog-title">
        <div class="dialog-content">
          <h1 id="room-dialog-title">Open a karaoke room</h1>
          <p>Create a memorable room ID or return to a recent room.</p>
          <form method="post" action="/rooms" id="room-form">
            <label for="room-id">New room ID</label>
            <input id="room-id" name="roomId" type="text" maxlength="32" pattern="[A-Za-z0-9-]{1,32}" autocomplete="off" placeholder="friday-karaoke">
            <span class="hint">Letters, numbers, and hyphens; up to 32 characters.</span>
            <button type="submit">Create or open room</button>
            <button class="secondary" type="button" data-random>Generate a random ID</button>
          </form>
          <section class="recent" aria-labelledby="recent-title">
            <h2 id="recent-title">Recent rooms</h2>
            <div class="recent-list" id="recent-rooms"><p class="empty">No recent rooms on this device.</p></div>
          </section>
          <div class="footer">
            <a href="/renderer/?room=main">Open main room</a>
            <form method="post" action="/logout"><button class="logout" type="submit">Sign out</button></form>
          </div>
        </div>
      </dialog>
    </main>
    <script>
      (() => {
        const storageKey = "karafriends.recentRooms";
        const roomPattern = /^[a-z0-9-]{1,32}$/;
        const list = document.getElementById("recent-rooms");
        let rooms = [];
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
          if (Array.isArray(stored)) rooms = stored.filter((room) => typeof room === "string" && roomPattern.test(room));
        } catch {}

        if (rooms.length) {
          list.replaceChildren(...rooms.slice(0, 5).map((room) => {
            const link = document.createElement("a");
            link.className = "recent-room";
            link.href = "/renderer/?room=" + encodeURIComponent(room);
            const name = document.createElement("span");
            name.textContent = room;
            const action = document.createElement("span");
            action.textContent = "Open →";
            link.append(name, action);
            return link;
          }));
        }

        const adjectives = [
          "bright", "calm", "cosmic", "crimson", "dancing", "electric",
          "flying", "golden", "happy", "hidden", "lucky", "midnight",
          "neon", "quiet", "rapid", "silver", "singing", "sparkling",
          "sunny", "velvet"
        ];
        const nouns = [
          "bamboo", "comet", "dragon", "echo", "festival", "firefly",
          "fox", "galaxy", "lantern", "lotus", "melody", "moon",
          "panda", "phoenix", "river", "star", "tiger", "wave",
          "willow", "zen"
        ];
        const randomItem = (items) => {
          const value = new Uint32Array(1);
          crypto.getRandomValues(value);
          return items[value[0] % items.length];
        };

        document.querySelector("[data-random]").addEventListener("click", () => {
          const input = document.getElementById("room-id");
          input.value = randomItem(adjectives) + "-" + randomItem(nouns);
          input.focus();
          input.select();
        });
      })();
    </script>
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
    hasRemoteAccess(connectionParams?.remoteToken, connectionParams?.roomId),
  onFatalError: (title, error) => {
    console.error(`${title}:`, error);
    process.exitCode = 1;
  },
});

ensureExternalResources().catch((error) => {
  console.error("Failed to prepare external media tools:", error);
});
