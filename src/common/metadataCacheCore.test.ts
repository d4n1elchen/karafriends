import assert from "node:assert/strict";
import test from "node:test";

import {
  parseMetadataCache,
  serializeMetadataCache,
} from "./metadataCacheCore.ts";

interface TestMetadata {
  title: string;
}

const isTestMetadata = (value: unknown): value is TestMetadata =>
  Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as TestMetadata).title === "string",
  );

test("recognizes fresh and stale successful metadata cache entries", () => {
  const metadata = { title: "Song" };
  const raw = serializeMetadataCache(metadata, 1_000);
  assert.deepEqual(parseMetadataCache(raw, isTestMetadata, 1_500, 1_000), {
    fresh: true,
    metadata,
  });
  assert.deepEqual(parseMetadataCache(raw, isTestMetadata, 2_001, 1_000), {
    fresh: false,
    metadata,
  });
});

test("rejects corrupt, failed, or incomplete cache entries", () => {
  assert.equal(parseMetadataCache("not json", isTestMetadata), null);
  assert.equal(
    parseMetadataCache(
      JSON.stringify({ version: 1, cachedAt: 1, error: "bot check" }),
      isTestMetadata,
    ),
    null,
  );
  assert.equal(
    parseMetadataCache(
      JSON.stringify({ version: 1, cachedAt: 1, metadata: {} }),
      isTestMetadata,
    ),
    null,
  );
});
