import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseWebVtt, parseYouTubeJson3 } from "./youtubeCaptions.ts";

describe("parseWebVtt", () => {
  it("parses multiline cues and approximates character timing", () => {
    const [cue] = parseWebVtt(`WEBVTT

00:00:01.000 --> 00:00:03.000 align:center
Hi &amp;
you`);

    assert.equal(cue.startMs, 1000);
    assert.equal(cue.endMs, 3000);
    assert.deepEqual(
      cue.lines.map((line) =>
        line.segments.map((segment) => segment.text).join(""),
      ),
      ["Hi &", "you"],
    );
    assert.equal(cue.lines[0].segments[0].startMs, 1000);
    assert.equal(cue.lines[1].segments.at(-1)?.endMs, 3000);
  });

  it("uses inline WebVTT timestamps when they are available", () => {
    const [cue] = parseWebVtt(`WEBVTT

00:00:10.000 --> 00:00:14.000
<00:00:10.000><c.yellow>Hello </c><00:00:12.500>world`);

    assert.deepEqual(cue.lines[0].segments, [
      { text: "Hello ", startMs: 10000, endMs: 12500 },
      { text: "world", startMs: 12500, endMs: 14000 },
    ]);
  });

  it("does not spend fallback timing on punctuation or whitespace", () => {
    const [cue] = parseWebVtt(`WEBVTT

00:00:01.000 --> 00:00:06.000
Hi, you!`);
    const segments = cue.lines[0].segments;
    const comma = segments.find(({ text }) => text === ",");
    const space = segments.find(({ text }) => text === " ");
    const exclamation = segments.find(({ text }) => text === "!");

    assert.deepEqual(comma, { text: ",", startMs: 3000, endMs: 3000 });
    assert.deepEqual(space, { text: " ", startMs: 3000, endMs: 3000 });
    assert.deepEqual(exclamation, {
      text: "!",
      startMs: 6000,
      endMs: 6000,
    });
  });

  it("keeps punctuation-only cues visible for their full interval", () => {
    const [cue] = parseWebVtt(`WEBVTT

00:00:02.000 --> 00:00:03.000
...`);

    assert.ok(
      cue.lines[0].segments.every(
        ({ startMs, endMs }) => startMs === 2000 && endMs === 3000,
      ),
    );
  });

  it("ignores headers, identifiers, notes, and invalid cues", () => {
    const cues = parseWebVtt(`WEBVTT - generated

NOTE metadata
not a cue

cue-one
00:01.000 --> 00:02.000
Valid

00:03.000 --> 00:02.000
Invalid`);

    assert.equal(cues.length, 1);
    assert.equal(
      cues[0].lines[0].segments.map(({ text }) => text).join(""),
      "Valid",
    );
  });
});

describe("parseYouTubeJson3", () => {
  it("parses cue timing and uses the weighted fallback without offsets", () => {
    const [cue] = parseYouTubeJson3(
      JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 3000,
            segs: [{ utf8: "Hi!" }],
          },
        ],
      }),
    );

    assert.equal(cue.startMs, 1000);
    assert.equal(cue.endMs, 4000);
    assert.deepEqual(cue.lines[0].segments.at(-1), {
      text: "!",
      startMs: 4000,
      endMs: 4000,
    });
  });

  it("honors per-segment offsets when present", () => {
    const [cue] = parseYouTubeJson3(
      JSON.stringify({
        events: [
          {
            tStartMs: 1000,
            dDurationMs: 4000,
            segs: [
              { utf8: "Hello ", tOffsetMs: 0 },
              { utf8: "world", tOffsetMs: 2500 },
            ],
          },
        ],
      }),
    );
    const world = cue.lines[0].segments.slice(-5);

    assert.equal(world[0].startMs, 3500);
    assert.equal(world.at(-1)?.endMs, 5000);
    assert.equal(world.map(({ text }) => text).join(""), "world");
  });

  it("ignores metadata events and infers a missing duration", () => {
    const cues = parseYouTubeJson3(
      JSON.stringify({
        events: [
          { tStartMs: 0, dDurationMs: 100, wpWinPosId: 1 },
          { tStartMs: 2000, segs: [{ utf8: "First" }] },
          { tStartMs: 4500, dDurationMs: 1000, segs: [{ utf8: "Second" }] },
        ],
      }),
    );

    assert.equal(cues.length, 2);
    assert.equal(cues[0].endMs, 4500);
  });
});
