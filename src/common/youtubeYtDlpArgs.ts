import fs from "fs";
import path from "path";

import { getConfigDirectory } from "./config";
import { resolveYoutubeCookiesFile } from "./youtubeYtDlpArgsCore";

export const YOUTUBE_COOKIES_FILENAME = "youtube-cookies.txt";

export function getYoutubeYtDlpAuthArgs(): string[] {
  const cookieFile = resolveYoutubeCookiesFile(
    process.env.KARAFRIENDS_YOUTUBE_COOKIES_FILE,
    path.join(getConfigDirectory(), YOUTUBE_COOKIES_FILENAME),
    process.cwd(),
    fs.existsSync,
  );

  return cookieFile ? ["--cookies", cookieFile] : [];
}
