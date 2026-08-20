import assert from "node:assert/strict";
import test from "node:test";

import { SharedDownloadCoordinator } from "./sharedDownloadCore.ts";

type Identity = { deviceId: string };

const itemData = (deviceId: string) => ({
  downloadType: 1,
  userIdentity: { deviceId },
  songId: "video",
  suffix: null,
});

test("joins one job while retaining per-room progress entries and callbacks", () => {
  const coordinator = new SharedDownloadCoordinator<Identity>();
  const roomA: ReturnType<typeof coordinator.begin>["item"][] = [];
  const roomB: ReturnType<typeof coordinator.begin>["item"][] = [];
  const completed: string[] = [];

  const first = coordinator.begin("youtube:video", roomA, itemData("a"), () =>
    completed.push("a"),
  );
  const second = coordinator.begin("youtube:video", roomB, itemData("b"), () =>
    completed.push("b"),
  );

  assert.equal(first.isOwner, true);
  assert.equal(second.isOwner, false);
  first.item.progress = 0.75;
  assert.equal(second.item.progress, 0.75);
  assert.equal(roomA[0].userIdentity.deviceId, "a");
  assert.equal(roomB[0].userIdentity.deviceId, "b");

  coordinator.complete(first.item);
  assert.deepEqual(completed, ["a", "b"]);
  assert.equal(roomA.length, 0);
  assert.equal(roomB.length, 0);
});

test("failure clears every waiter without reporting completion", () => {
  const coordinator = new SharedDownloadCoordinator<Identity>();
  const roomA: ReturnType<typeof coordinator.begin>["item"][] = [];
  const roomB: ReturnType<typeof coordinator.begin>["item"][] = [];
  let completions = 0;

  const first = coordinator.begin(
    "nico:video",
    roomA,
    itemData("a"),
    () => completions++,
  );
  coordinator.begin("nico:video", roomB, itemData("b"), () => completions++);
  coordinator.fail(first.item);

  assert.equal(completions, 0);
  assert.equal(roomA.length, 0);
  assert.equal(roomB.length, 0);
});
