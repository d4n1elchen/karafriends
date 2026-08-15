import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectPitch } from "./pitchDetection.ts";

const SAMPLE_RATE = 48000;
const SAMPLE_COUNT = 4096;

function sineWave(frequency: number, amplitude = 0.8): Float32Array {
  return Float32Array.from(
    { length: SAMPLE_COUNT },
    (_, index) =>
      amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE),
  );
}

describe("detectPitch", () => {
  it("detects concert A", () => {
    const result = detectPitch(sineWave(440), SAMPLE_RATE);
    assert.ok(Math.abs(result.midiNumber - 69) < 0.1);
    assert.ok(result.confidence > 0.95);
  });

  it("detects a lower singing-range note", () => {
    const result = detectPitch(sineWave(220), SAMPLE_RATE);
    assert.ok(Math.abs(result.midiNumber - 57) < 0.1);
    assert.ok(result.confidence > 0.95);
  });

  it("rejects silence", () => {
    assert.deepEqual(detectPitch(new Float32Array(SAMPLE_COUNT), SAMPLE_RATE), {
      midiNumber: 0,
      confidence: 0,
    });
  });
});
