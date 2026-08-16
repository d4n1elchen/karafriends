import fs from "fs";
import path from "path";

import { getConfigDirectory } from "./config";
import { isElectronRuntime } from "./runtimePaths";
import {
  buildYoutubeYtDlpArgs,
  resolveYoutubeCookiesFile,
} from "./youtubeYtDlpArgsCore";
import { prepareYoutubeCookieFile } from "./youtubeCookieFile";

export const YOUTUBE_COOKIES_FILENAME = "youtube-cookies.txt";

export interface PreparedYoutubeYtDlpArgs {
  args: string[];
  cleanup: () => void;
}

export function prepareYoutubeYtDlpArgs(): PreparedYoutubeYtDlpArgs {
  const sourceCookieFile = resolveYoutubeCookiesFile(
    process.env.KARAFRIENDS_YOUTUBE_COOKIES_FILE,
    path.join(getConfigDirectory(), YOUTUBE_COOKIES_FILENAME),
    process.cwd(),
    fs.existsSync,
  );
  const preparedCookieFile = prepareYoutubeCookieFile(sourceCookieFile);

  // The standalone web server is already running under a supported Node
  // executable. Explicitly give it to yt-dlp so current YouTube JavaScript
  // challenges do not silently hide playable formats. An Electron executable
  // is not a drop-in Node CLI, so preserve the desktop behavior there.
  const nodeRuntimePath = isElectronRuntime() ? null : process.execPath;

  return {
    args: buildYoutubeYtDlpArgs(preparedCookieFile.cookieFile, nodeRuntimePath),
    cleanup: preparedCookieFile.cleanup,
  };
}
