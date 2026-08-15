import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getJoysoundOggPlaytime,
  getJoysoundTelopDuration,
} from "./joysoundMediaMetadata.ts";

describe("Joysound media metadata", () => {
  it("reads telop duration from a sliced Node buffer", () => {
    const allocation = Buffer.alloc(96, 0xff);
    const telop = allocation.subarray(13, 13 + 48);
    telop.fill(0);
    telop.writeUInt32LE(20, 6);
    telop.writeUInt16LE(237, 20 + 18);

    assert.equal(getJoysoundTelopDuration(telop), 237);
  });

  it("rejects an out-of-bounds telop offset", () => {
    const telop = Buffer.alloc(32);
    telop.writeUInt32LE(578_501_154, 6);

    assert.throws(() => getJoysoundTelopDuration(telop), /metadata offset/);
  });

  it("reads OGG playtime from a sliced Node buffer", () => {
    const allocation = Buffer.alloc(80, 0xff);
    const ogg = allocation.subarray(11, 11 + 32);
    ogg.fill(0);
    ogg.writeUInt32LE(13, 4);
    ogg.write("playtime=1234", 8, "ascii");

    assert.equal(getJoysoundOggPlaytime(ogg), 1234);
  });

  it("rejects truncated and nonnumeric OGG metadata", () => {
    const truncated = Buffer.alloc(20);
    truncated.writeUInt32LE(100, 0);
    truncated.write("playtime=1", 4, "ascii");
    assert.throws(() => getJoysoundOggPlaytime(truncated), /field length/);

    const nonnumeric = Buffer.alloc(20);
    nonnumeric.writeUInt32LE(12, 0);
    nonnumeric.write("playtime=abc", 4, "ascii");
    assert.throws(() => getJoysoundOggPlaytime(nonnumeric), /not numeric/);
  });
});
