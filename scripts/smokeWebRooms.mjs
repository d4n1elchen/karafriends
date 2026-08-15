import assert from "node:assert/strict";
import { createClient } from "graphql-ws";
import WebSocket from "ws";

const baseUrl = process.env.KARAFRIENDS_SMOKE_URL ?? "http://127.0.0.1:8183";
const graphqlUrl = new URL("/graphql", baseUrl);
const websocketUrl = new URL(graphqlUrl);
websocketUrl.protocol = websocketUrl.protocol === "https:" ? "wss:" : "ws:";

async function graphql(roomId, query) {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-karafriends-room": roomId,
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
  connectionParams: { roomId: roomA },
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
