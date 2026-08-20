import fs from "fs";
import path from "path";
import process from "process";

import { getConfigDirectory } from "./config";
import {
  CachedMetadata,
  parseMetadataCache,
  serializeMetadataCache,
} from "./metadataCacheCore";
import { getWebDataDirectory, isElectronRuntime } from "./runtimePaths";

type MetadataProvider = "niconico" | "youtube";
const safeCacheKey = /^[A-Za-z0-9_-]+$/;

function cacheDirectory(provider: MetadataProvider): string {
  const configuredRoot = process.env.KARAFRIENDS_METADATA_CACHE_DIR;
  const cacheRoot = configuredRoot
    ? path.resolve(configuredRoot)
    : isElectronRuntime()
      ? path.join(getConfigDirectory(), "cache")
      : path.join(getWebDataDirectory(), "cache");
  return path.join(cacheRoot, `${provider}-metadata`);
}

function cacheFilename(provider: MetadataProvider, mediaId: string): string {
  if (!safeCacheKey.test(mediaId))
    throw new Error("Invalid metadata cache key");
  return path.join(cacheDirectory(provider), `${mediaId}.json`);
}

export function readMetadataCache<T>(
  provider: MetadataProvider,
  mediaId: string,
  isMetadata: (value: unknown) => value is T,
): CachedMetadata<T> | null {
  try {
    return parseMetadataCache(
      fs.readFileSync(cacheFilename(provider, mediaId), "utf8"),
      isMetadata,
    );
  } catch {
    return null;
  }
}

export function writeMetadataCache<T>(
  provider: MetadataProvider,
  mediaId: string,
  metadata: T,
): void {
  const directory = cacheDirectory(provider);
  const filename = cacheFilename(provider, mediaId);
  const temporaryFilename = `${filename}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      temporaryFilename,
      serializeMetadataCache(metadata),
      "utf8",
    );
    fs.renameSync(temporaryFilename, filename);
  } catch (error) {
    try {
      fs.rmSync(temporaryFilename, { force: true });
    } catch {
      // Cache cleanup is best-effort and must not break metadata lookup.
    }
    throw error;
  }
}
