import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseYtDlpMetadata } from "./youtubeMetadataCore.ts";

describe("parseYtDlpMetadata", () => {
  it("maps yt-dlp video metadata to the GraphQL shape", () => {
    const metadata = parseYtDlpMetadata(
      JSON.stringify({
        title: "Test video",
        uploader: "Uploader",
        channel_id: "channel-1",
        duration: 123,
        description: "Description",
        view_count: 456,
        tags: ["music", 12, "karaoke"],
        subtitles: {
          ja: [{ name: "Japanese" }],
          en: [{}],
        },
      }),
    );

    assert.deepEqual(metadata, {
      author: "Uploader",
      captionLanguages: [
        { code: "ja", name: "Japanese" },
        { code: "en", name: "en" },
      ],
      channelId: "channel-1",
      description: "Description",
      keywords: ["music", "karaoke"],
      lengthSeconds: 123,
      title: "Test video",
      viewCount: 456,
      gainValue: 1,
    });
  });

  it("requires a title and safely defaults optional fields", () => {
    assert.throws(() => parseYtDlpMetadata("{}"), /without a title/);

    assert.deepEqual(parseYtDlpMetadata('{"title":"Minimal"}'), {
      author: "",
      captionLanguages: [],
      channelId: "",
      description: "",
      keywords: [],
      lengthSeconds: 0,
      title: "Minimal",
      viewCount: 0,
      gainValue: 1,
    });
  });
});
