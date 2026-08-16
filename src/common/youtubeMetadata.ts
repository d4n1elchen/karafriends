import { execFile } from "child_process";
import { promisify } from "util";

import { ensureExternalResources, getResourcePaths } from "./externalResources";
import { parseYtDlpMetadata, YoutubeMetadata } from "./youtubeMetadataCore";
import { getYoutubeYtDlpAuthArgs } from "./youtubeYtDlpArgs";

const execFileAsync = promisify(execFile);
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_DLP_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 30_000;

export async function getYoutubeMetadataWithYtDlp(
  videoId: string,
): Promise<YoutubeMetadata> {
  if (!YOUTUBE_VIDEO_ID_RE.test(videoId)) {
    throw new Error("Invalid YouTube video ID.");
  }

  await ensureExternalResources();
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { stdout } = await execFileAsync(
    getResourcePaths().ytdlp,
    [
      ...getYoutubeYtDlpAuthArgs(),
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

  return parseYtDlpMetadata(stdout);
}
