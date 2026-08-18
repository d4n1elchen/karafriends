import { execFile } from "child_process";
import { promisify } from "util";

import { ensureExternalResources, getResourcePaths } from "./externalResources";
import {
  NiconicoMetadata,
  parseNiconicoYtDlpMetadata,
} from "./niconicoMetadataCore";

const execFileAsync = promisify(execFile);
const NICONICO_VIDEO_ID_RE = /^[A-Za-z]{1,8}\d+$/;
const YT_DLP_MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const YT_DLP_TIMEOUT_MS = 30_000;

export async function getNiconicoMetadata(
  videoId: string,
): Promise<NiconicoMetadata> {
  if (!NICONICO_VIDEO_ID_RE.test(videoId)) {
    throw new Error("Invalid Niconico video ID.");
  }

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

  return parseNiconicoYtDlpMetadata(stdout);
}
