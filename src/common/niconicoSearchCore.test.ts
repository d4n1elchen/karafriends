import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNiconicoSearchResponse } from "./niconicoSearchCore.ts";

describe("parseNiconicoSearchResponse", () => {
  it("maps valid snapshot search results", () => {
    assert.deepEqual(
      parseNiconicoSearchResponse({
        meta: { status: 200 },
        data: [
          {
            contentId: "sm9",
            title: "Test video",
            thumbnailUrl: "https://example.com/thumbnail.jpg",
            lengthSeconds: 91,
            viewCounter: 1234,
          },
        ],
      }),
      [
        {
          videoId: "sm9",
          title: "Test video",
          thumbnailUrl: "https://example.com/thumbnail.jpg",
          lengthSeconds: 91,
          viewCount: 1234,
        },
      ],
    );
  });

  it("rejects malformed responses and skips malformed items", () => {
    assert.throws(
      () => parseNiconicoSearchResponse({ meta: { status: 500 } }),
      /invalid search response/,
    );
    assert.deepEqual(
      parseNiconicoSearchResponse({
        meta: { status: 200 },
        data: [{ contentId: "sm9" }],
      }),
      [],
    );
  });
});
