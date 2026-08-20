import fs from "fs";
import path from "path";

import { getConfigDirectory } from "./config";
import {
  isValidJoysoundSongId,
  isValidYoutubeBackgroundId,
  JoysoundBackgroundBindings,
  parseJoysoundBackgroundBindings,
  serializeJoysoundBackgroundBindings,
} from "./joysoundBackgroundBindingsCore";
import { getWebDataDirectory, isElectronRuntime } from "./runtimePaths";

const stateDirectory = isElectronRuntime()
  ? path.join(getConfigDirectory(), "state")
  : path.join(getWebDataDirectory(), "state");
const bindingsFilename = path.join(stateDirectory, "joysound-backgrounds.json");

let loadedBindings: JoysoundBackgroundBindings | null = null;

function loadBindings(): JoysoundBackgroundBindings {
  if (loadedBindings) return loadedBindings;
  if (!fs.existsSync(bindingsFilename)) {
    loadedBindings = {};
    return loadedBindings;
  }

  try {
    loadedBindings = parseJoysoundBackgroundBindings(
      fs.readFileSync(bindingsFilename, "utf8"),
    );
  } catch (error) {
    console.error(
      `Failed to load ${bindingsFilename}; preserving the corrupt file:`,
      error,
    );
    try {
      fs.renameSync(
        bindingsFilename,
        `${bindingsFilename}.${Date.now()}.corrupt`,
      );
    } catch (renameError) {
      console.error(
        "Failed to preserve corrupt Joysound bindings:",
        renameError,
      );
    }
    loadedBindings = {};
  }
  return loadedBindings;
}

function persistBindings(bindings: JoysoundBackgroundBindings): void {
  fs.mkdirSync(stateDirectory, { recursive: true });
  const temporaryFilename = `${bindingsFilename}.tmp`;
  fs.writeFileSync(
    temporaryFilename,
    serializeJoysoundBackgroundBindings(bindings),
    "utf8",
  );
  fs.renameSync(temporaryFilename, bindingsFilename);
}

export function getJoysoundBackground(songId: string): string | null {
  if (!isValidJoysoundSongId(songId)) return null;
  return loadBindings()[songId]?.youtubeVideoId || null;
}

export function setJoysoundBackground(
  songId: string,
  youtubeVideoId: string | null,
): boolean {
  if (!isValidJoysoundSongId(songId)) {
    throw new Error("Invalid Joysound song ID");
  }
  if (youtubeVideoId !== null && !isValidYoutubeBackgroundId(youtubeVideoId)) {
    throw new Error("Invalid YouTube video ID");
  }

  const next = { ...loadBindings() };
  if (youtubeVideoId === null) {
    delete next[songId];
  } else {
    next[songId] = {
      youtubeVideoId,
      updatedAt: new Date().toISOString(),
    };
  }
  persistBindings(next);
  loadedBindings = next;
  return true;
}
