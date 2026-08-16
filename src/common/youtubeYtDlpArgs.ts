import fs from "fs";
import path from "path";

import { getConfigDirectory } from "./config";
import { isElectronRuntime } from "./runtimePaths";
import {
  buildYoutubeYtDlpArgs,
  resolveYoutubeCookiesFile,
} from "./youtubeYtDlpArgsCore";

export const YOUTUBE_COOKIES_FILENAME = "youtube-cookies.txt";

export function getYoutubeYtDlpArgs(): string[] {
  const cookieFile = resolveYoutubeCookiesFile(
    process.env.KARAFRIENDS_YOUTUBE_COOKIES_FILE,
    path.join(getConfigDirectory(), YOUTUBE_COOKIES_FILENAME),
    process.cwd(),
    fs.existsSync,
  );

  // The standalone web server is already running under a supported Node
  // executable. Explicitly give it to yt-dlp so current YouTube JavaScript
  // challenges do not silently hide playable formats. An Electron executable
  // is not a drop-in Node CLI, so preserve the desktop behavior there.
  const nodeRuntimePath = isElectronRuntime() ? null : process.execPath;

  return buildYoutubeYtDlpArgs(cookieFile, nodeRuntimePath);
}
