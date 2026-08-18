import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNiconicoYtDlpMetadata } from "./niconicoMetadataCore.ts";

describe("parseNiconicoYtDlpMetadata", () => {
  it("maps yt-dlp Niconico metadata to the GraphQL shape", () => {
    assert.deepEqual(
      parseNiconicoYtDlpMetadata(
        JSON.stringify({
          title: "Test song",
          uploader: "Singer",
          uploader_id: "123",
          duration: 91.4,
          description: "Description",
          view_count: 456,
          thumbnail: "https://example.com/thumb.jpg",
        }),
      ),
      {
        author: "Singer",
        channelId: "123",
        description: "Description",
        lengthSeconds: 91,
        thumbnailUrl: "https://example.com/thumb.jpg",
        title: "Test song",
        viewCount: 456,
      },
    );
  });

  it("requires a title and safely defaults optional fields", () => {
    assert.throws(() => parseNiconicoYtDlpMetadata("{}"), /without a title/);
    assert.deepEqual(parseNiconicoYtDlpMetadata('{"title":"Song"}'), {
      author: "",
      channelId: "",
      description: "",
      lengthSeconds: 0,
      thumbnailUrl: "",
      title: "Song",
      viewCount: 0,
    });
  });
});
