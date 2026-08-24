import { execFile } from "child_process";
import { promisify } from "util";

import { ensureExternalResources, getResourcePaths } from "./externalResources";
import { readMetadataCache, writeMetadataCache } from "./metadataCache";
import { YOUTUBE_METADATA_CACHE_TTL_MS } from "./metadataCacheCore";
import {
  isYoutubeMetadata,
  parseYtDlpMetadata,
  YoutubeMetadata,
} from "./youtubeMetadataCore";
import { getYoutubeYtDlpArgs } from "./youtubeYtDlpArgs";

const execFileAsync = promisify(execFile);
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_DLP_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 30_000;
const inFlightMetadataRequests = new Map<string, Promise<YoutubeMetadata>>();

export async function getYoutubeMetadataWithYtDlp(
  videoId: string,
): Promise<YoutubeMetadata> {
  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }

  const cached = readMetadataCache(
    "youtube",
    videoId,
    isYoutubeMetadata,
    YOUTUBE_METADATA_CACHE_TTL_MS,
  );
  if (cached?.fresh) return cached.metadata;

  const existingRequest = inFlightMetadataRequests.get(videoId);
  if (existingRequest) return existingRequest;

  const request = refreshYoutubeMetadata(videoId, cached?.metadata);
  inFlightMetadataRequests.set(videoId, request);
  try {
    return await request;
  } finally {
    inFlightMetadataRequests.delete(videoId);
  }
}

async function refreshYoutubeMetadata(
  videoId: string,
  staleMetadata?: YoutubeMetadata,
): Promise<YoutubeMetadata> {
  try {
    await ensureExternalResources();
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const runYtDlp = async (playerClient?: string) =>
      execFileAsync(
        getResourcePaths().ytdlp,
        [
          ...getYoutubeYtDlpArgs(playerClient),
          "--dump-single-json",
          "--skip-download",
          "--no-playlist",
          "--no-warnings",
          "--",
          videoUrl,
        ],
        {
          maxBuffer: YT_DLP_MAX_OUTPUT_BYTES,
          timeout: YT_DLP_TIMEOUT_MS,
          windowsHide: true,
        },
      );

    let stdout: string;
    try {
      ({ stdout } = await runYtDlp());
    } catch (error) {
      console.warn(
        `Default yt-dlp clients failed for ${videoId}; retrying with web_embedded`,
      );
      ({ stdout } = await runYtDlp("web_embedded"));
    }

    const metadata = parseYtDlpMetadata(stdout);
    try {
      writeMetadataCache("youtube", videoId, metadata);
    } catch (error) {
      console.warn(`Failed to cache YouTube metadata for ${videoId}:`, error);
    }
    return metadata;
  } catch (error) {
    if (staleMetadata) {
      console.warn(
        `Using stale cached YouTube metadata for ${videoId} after refresh failed`,
      );
      return staleMetadata;
    }
    throw error;
  }
}
