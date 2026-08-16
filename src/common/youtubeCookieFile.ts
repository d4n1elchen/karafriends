import fs from "fs";
import os from "os";
import path from "path";

export interface PreparedYoutubeCookieFile {
  cookieFile: string | null;
  cleanup: () => void;
}

export function prepareYoutubeCookieFile(
  sourceFile: string | null,
  temporaryRoot = os.tmpdir(),
): PreparedYoutubeCookieFile {
  if (!sourceFile) {
    return { cookieFile: null, cleanup: () => undefined };
  }

  const temporaryDirectory = fs.mkdtempSync(
    path.join(temporaryRoot, "karafriends-youtube-"),
  );
  const cookieFile = path.join(temporaryDirectory, "cookies.txt");

  try {
    fs.copyFileSync(sourceFile, cookieFile);
    fs.chmodSync(cookieFile, 0o600);
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }

  let cleanedUp = false;
  return {
    cookieFile,
    cleanup: () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      } catch (error) {
        console.warn("Unable to remove temporary YouTube cookies", error);
      }
    },
  };
}
