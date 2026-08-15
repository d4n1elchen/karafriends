import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

import compression from "compression";
import express from "express";

import karafriendsConfig from "../common/config";
import { debugLog, isDebugEnabled } from "../common/debug";
import { ensureExternalResources } from "../common/externalResources";
import { TEMP_FOLDER } from "../common/videoDownloader";
import { applyGraphQLMiddleware, getRoom } from "../main/graphql";
import remoconServiceWorkerAllowed from "../main/middleware/remoconServiceWorkerAllowed";

const app = express();
const host = process.env.KARAFRIENDS_HOST || "0.0.0.0";
const port = karafriendsConfig.remoconPort;
const publicUrl = process.env.KARAFRIENDS_PUBLIC_URL?.replace(/\/$/, "");
const webRoot = process.env.KARAFRIENDS_WEB_ROOT
  ? path.resolve(process.env.KARAFRIENDS_WEB_ROOT)
  : path.resolve(process.cwd(), "build", "web");

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

function createRoom(): string {
  const roomId = randomBytes(16).toString("hex");
  getRoom(roomId);
  return roomId;
}

app.post("/api/rooms", (req, res) => {
  const roomId = createRoom();
  const origin = publicUrl || `${req.protocol}://${req.get("host")}`;
  res.status(201).json({
    roomId,
    playerUrl: `${origin}/renderer/?room=${roomId}`,
    remoteUrl: `${origin}/remocon/?room=${roomId}`,
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

app.get("/", (_req, res) => {
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
      <p><a href="/renderer/?room=main">Open main player</a> · <a href="/remocon/?room=main">Open main remote</a></p>
    </main>
  </body>
</html>`);
});
app.get("/remote", (_req, res) => res.redirect("/remocon/"));
app.use("/renderer", express.static(path.join(webRoot, "renderer")));
app.use("/remocon", express.static(path.join(webRoot, "remocon")));

applyGraphQLMiddleware(app, {
  host,
  port,
  onFatalError: (title, error) => {
    console.error(`${title}:`, error);
    process.exitCode = 1;
  },
});

ensureExternalResources().catch((error) => {
  console.error("Failed to prepare external media tools:", error);
});
