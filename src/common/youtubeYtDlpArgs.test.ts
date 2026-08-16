import assert from "assert";
import path from "path";
import { describe, it } from "node:test";

import { resolveYoutubeCookiesFile } from "./youtubeYtDlpArgsCore.ts";

describe("resolveYoutubeCookiesFile", () => {
  it("resolves an explicitly configured path from the working directory", () => {
    assert.equal(
      resolveYoutubeCookiesFile(
        "secrets/youtube.txt",
        "/unused/default.txt",
        "/srv/karafriends",
        () => false,
      ),
      path.resolve("/srv/karafriends", "secrets/youtube.txt"),
    );
  });

  it("uses the default cookie file when it exists", () => {
    assert.equal(
      resolveYoutubeCookiesFile(
        undefined,
        "/data/youtube-cookies.txt",
        "/",
        (filename) => filename === "/data/youtube-cookies.txt",
      ),
      "/data/youtube-cookies.txt",
    );
  });

  it("does not add cookie arguments when no cookie file is configured", () => {
    assert.equal(
      resolveYoutubeCookiesFile(
        undefined,
        "/data/youtube-cookies.txt",
        "/",
        () => false,
      ),
      null,
    );
  });
});
