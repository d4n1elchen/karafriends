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
const mainRemoteToken = new URL(remoteAccess.remoteUrl).searchParams.get(
  "remoteToken",
);
assert.match(mainRemoteToken, /^[A-Za-z0-9_-]{40,}$/);

async function graphql(roomId, remoteToken, query) {
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
const roomAToken = new URL(createdRoom.remoteUrl).searchParams.get(
  "remoteToken",
);
assert.match(roomAToken, /^[A-Za-z0-9_-]{40,}$/);
assert.notEqual(roomAToken, mainRemoteToken);

const secondRoomResponse = await fetch(new URL("/api/rooms", baseUrl), {
  method: "POST",
  headers: { cookie: adminCookie },
});
assert.equal(secondRoomResponse.status, 201);
const secondRoom = await secondRoomResponse.json();
const roomBToken = new URL(secondRoom.remoteUrl).searchParams.get(
  "remoteToken",
);
assert.match(roomBToken, /^[A-Za-z0-9_-]{40,}$/);
assert.notEqual(roomBToken, roomAToken);

const roomA = createdRoom.roomId;
const roomB = secondRoom.roomId;
await graphql(
  roomA,
  roomAToken,
  "mutation { setPlaybackState(playbackState: PAUSED) }",
);
const roomAState = await graphql(roomA, roomAToken, "query { playbackState }");
const roomBState = await graphql(roomB, roomBToken, "query { playbackState }");
assert.equal(roomAState.playbackState, "PAUSED");
assert.equal(roomBState.playbackState, "WAITING");

const crossRoomResponse = await fetch(graphqlUrl, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-karafriends-room": roomB,
    "x-karafriends-remote-token": roomAToken,
  },
  body: JSON.stringify({ query: "query { playbackState }" }),
});
assert.equal(crossRoomResponse.status, 401);

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
  connectionParams: { roomId: roomA, remoteToken: roomAToken },
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
await graphql(
  roomB,
  roomBToken,
  "mutation { setPlaybackState(playbackState: PLAYING) }",
);
await new Promise((resolve) => setTimeout(resolve, 250));
assert.deepEqual(received, [], "room B event leaked into room A subscription");

await graphql(
  roomA,
  roomAToken,
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
