import assert from "assert";
import path from "path";
import { describe, it } from "node:test";

import {
  buildYoutubeYtDlpArgs,
  resolveYoutubeCookiesFile,
} from "./youtubeYtDlpArgsCore.ts";

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

describe("buildYoutubeYtDlpArgs", () => {
  it("uses cookies and the server Node runtime", () => {
    assert.deepEqual(
      buildYoutubeYtDlpArgs("/data/youtube-cookies.txt", "/usr/bin/node"),
      [
        "--cookies",
        "/data/youtube-cookies.txt",
        "--js-runtimes",
        "node:/usr/bin/node",
      ],
    );
  });

  it("omits optional cookie and runtime arguments", () => {
    assert.deepEqual(buildYoutubeYtDlpArgs(null, null), []);
  });
});
