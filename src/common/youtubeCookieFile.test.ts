import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { after, describe, it } from "node:test";

import { prepareYoutubeCookieFile } from "./youtubeCookieFile.ts";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "karafriends-test-"));
after(() => fs.rmSync(testRoot, { recursive: true, force: true }));

describe("prepareYoutubeCookieFile", () => {
  it("gives yt-dlp a disposable copy and preserves the source", () => {
    const sourceFile = path.join(testRoot, "source.txt");
    fs.writeFileSync(sourceFile, "stable-cookie");

    const prepared = prepareYoutubeCookieFile(sourceFile, testRoot);
    assert.notEqual(prepared.cookieFile, sourceFile);
    assert.equal(
      fs.readFileSync(prepared.cookieFile!, "utf8"),
      "stable-cookie",
    );

    fs.writeFileSync(prepared.cookieFile!, "rotated-cookie");
    assert.equal(fs.readFileSync(sourceFile, "utf8"), "stable-cookie");

    const temporaryDirectory = path.dirname(prepared.cookieFile!);
    prepared.cleanup();
    prepared.cleanup();
    assert.equal(fs.existsSync(temporaryDirectory), false);
  });

  it("does nothing when cookies are not configured", () => {
    const prepared = prepareYoutubeCookieFile(null, testRoot);
    assert.equal(prepared.cookieFile, null);
    prepared.cleanup();
  });
});
