import path from "path";

export function resolveYoutubeCookiesFile(
  configuredPath: string | undefined,
  defaultPath: string,
  workingDirectory = process.cwd(),
  fileExists: (filename: string) => boolean,
): string | null {
  if (configuredPath) {
    return path.resolve(workingDirectory, configuredPath);
  }

  return fileExists(defaultPath) ? defaultPath : null;
}

export function buildYoutubeYtDlpArgs(
  cookieFile: string | null,
  nodeRuntimePath: string | null,
  playerClient?: string,
): string[] {
  const args = ["--ignore-config"];

  if (cookieFile) {
    args.push("--cookies", cookieFile);
  }

  if (nodeRuntimePath) {
    args.push("--js-runtimes", `node:${nodeRuntimePath}`);
  }

  if (playerClient) {
    args.push("--extractor-args", `youtube:player_client=${playerClient}`);
  }

  return args;
}
