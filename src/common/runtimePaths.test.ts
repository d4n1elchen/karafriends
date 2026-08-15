import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { getWebDataDirectory, isElectronRuntime } from "./runtimePaths.ts";

describe("runtime paths", () => {
  it("defaults web data beneath the working directory", () => {
    assert.equal(
      getWebDataDirectory(undefined, path.resolve("project")),
      path.resolve("project", "data"),
    );
  });

  it("allows the data root to be overridden", () => {
    assert.equal(
      getWebDataDirectory("persistent", path.resolve("project")),
      path.resolve("project", "persistent"),
    );
  });

  it("detects Electron without importing it", () => {
    assert.equal(
      isElectronRuntime({ electron: "43" } as NodeJS.ProcessVersions),
      true,
    );
    assert.equal(isElectronRuntime({} as NodeJS.ProcessVersions), false);
  });
});
