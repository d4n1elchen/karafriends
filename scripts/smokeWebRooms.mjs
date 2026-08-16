import assert from "node:assert/strict";
import { createClient } from "graphql-ws";
import WebSocket from "ws";

const baseUrl = process.env.KARAFRIENDS_SMOKE_URL ?? "http://127.0.0.1:8183";
const adminPassword = process.env.KARAFRIENDS_ADMIN_PASSWORD;
assert.ok(adminPassword, "Set KARAFRIENDS_ADMIN_PASSWORD for the smoke server");
const graphqlUrl = new URL("/graphql", baseUrl);
const websocketUrl = new URL(graphqlUrl);
websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";

const unauthenticatedGraphql = await fetch(graphqlUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: "query { playbackState }" }),
});
assert.equal(unauthenticatedGraphql.status, 401);

const loginResponse = await fetch(new URL("/login", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ password: adminPassword, next: "/" }),
  redirect: "manual",
});
assert.equal(loginResponse.status, 303);
const adminCookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
assert.ok(adminCookie, "admin login did not set a session cookie");

const remoteAccessResponse = await fetch(
  new URL("/api/remote-access?room=main", baseUrl),
  { headers: { cookie: adminCookie } },
);
assert.equal(remoteAccessResponse.status, 200);
const remoteAccess = await remoteAccessResponse.json();
const remoteToken = new URL(remoteAccess.remoteUrl).searchParams.get(
  "remoteToken",
);
assert.match(remoteToken, /^[A-Za-z0-9_-]{40,}$/);

async function graphql(roomId, query) {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karafriends-room": roomId,
      "x-karafriends-remote-token": remoteToken,
    },
    body: JSON.stringify({ query }),
  });

  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result.data;
}

const roomResponse = await fetch(new URL("/api/rooms", baseUrl), {
  method: "POST",
  headers: { cookie: adminCookie },
});
assert.equal(roomResponse.status, 201);
const createdRoom = await roomResponse.json();
assert.match(createdRoom.roomId, /^[a-f0-9]{32}$/);
assert.equal(
  new URL(createdRoom.playerUrl).searchParams.get("room"),
  createdRoom.roomId,
);
assert.equal(
  new URL(createdRoom.remoteUrl).searchParams.get("room"),
  createdRoom.roomId,
);
assert.equal(
  new URL(createdRoom.remoteUrl).searchParams.get("remoteToken"),
  remoteToken,
);

const roomA = `smoke-a-${Date.now()}`;
const roomB = `smoke-b-${Date.now()}`;
await graphql(roomA, "mutation { setPlaybackState(playbackState: PAUSED) }");
const roomAState = await graphql(roomA, "query { playbackState }");
const roomBState = await graphql(roomB, "query { playbackState }");
assert.equal(roomAState.playbackState, "PAUSED");
assert.equal(roomBState.playbackState, "WAITING");

const received = [];
let resolveEvent;
let rejectEvent;
const eventReceived = new Promise((resolve, reject) => {
  resolveEvent = resolve;
  rejectEvent = reject;
});
const client = createClient({
  url: websocketUrl.toString(),
  webSocketImpl: WebSocket,
  connectionParams: { roomId: roomA, remoteToken },
});
const disposeSubscription = client.subscribe(
  { query: "subscription { playbackStateChanged }" },
  {
    next(value) {
      received.push(value.data?.playbackStateChanged);
      resolveEvent(value.data?.playbackStateChanged);
    },
    error: rejectEvent,
    complete() {},
  },
);

await new Promise((resolve) => setTimeout(resolve, 250));
await graphql(roomB, "mutation { setPlaybackState(playbackState: PLAYING) }");
await new Promise((resolve) => setTimeout(resolve, 250));
assert.deepEqual(received, [], "room B event leaked into room A subscription");

await graphql(
  roomA,
  "mutation { setPlaybackState(playbackState: RESTARTING) }",
);
const event = await Promise.race([
  eventReceived,
  new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error("timed out waiting for room event")),
      3000,
    ),
  ),
]);
assert.equal(event, "RESTARTING");

disposeSubscription();
await client.dispose();
console.log(
  `Web smoke passed: room ${createdRoom.roomId}; HTTP and WebSocket isolation verified.`,
);
