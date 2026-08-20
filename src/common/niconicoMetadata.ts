import { execFile } from "child_process";
import { promisify } from "util";

import { ensureExternalResources, getResourcePaths } from "./externalResources";
import { readMetadataCache, writeMetadataCache } from "./metadataCache";
import {
  isNiconicoMetadata,
  NiconicoMetadata,
  parseNiconicoYtDlpMetadata,
} from "./niconicoMetadataCore";

const execFileAsync = promisify(execFile);
const NICONICO_VIDEO_ID_RE = /^[A-Za-z]{1,8}\d+$/;
const YT_DLP_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 30_000;
const inFlightMetadataRequests = new Map<string, Promise<NiconicoMetadata>>();

export async function getNiconicoMetadata(
  videoId: string,
): Promise<NiconicoMetadata> {
  if (!NICONICO_VIDEO_ID_RE.test(videoId)) {
    throw new Error("Invalid Niconico video ID.");
  }

  const cached = readMetadataCache("niconico", videoId, isNiconicoMetadata);
  if (cached?.fresh) return cached.metadata;

  const existingRequest = inFlightMetadataRequests.get(videoId);
  if (existingRequest) return existingRequest;

  const request = refreshNiconicoMetadata(videoId, cached?.metadata);
  inFlightMetadataRequests.set(videoId, request);
  try {
    return await request;
  } finally {
    inFlightMetadataRequests.delete(videoId);
  }
}

async function refreshNiconicoMetadata(
  videoId: string,
  staleMetadata?: NiconicoMetadata,
): Promise<NiconicoMetadata> {
  try {
    await ensureExternalResources();
    const { stdout } = await execFileAsync(
      getResourcePaths().ytdlp,
      [
        "--ignore-config",
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
        "--no-warnings",
        "--",
        `https://www.nicovideo.jp/watch/${videoId}`,
      ],
      {
        maxBuffer: YT_DLP_MAX_OUTPUT_BYTES,
        timeout: YT_DLP_TIMEOUT_MS,
        windowsHide: true,
      },
    );
    const metadata = parseNiconicoYtDlpMetadata(stdout);
    try {
      writeMetadataCache("niconico", videoId, metadata);
    } catch (error) {
      console.warn(`Failed to cache Niconico metadata for ${videoId}:`, error);
    }
    return metadata;
  } catch (error) {
    if (staleMetadata) {
      console.warn(
        `Using stale cached Niconico metadata for ${videoId} after refresh failed`,
      );
      return staleMetadata;
    }
    throw error;
  }
}
