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
): string[] {
  const args: string[] = [];

  if (cookieFile) {
    args.push("--cookies", cookieFile);
  }

  if (nodeRuntimePath) {
    args.push("--js-runtimes", `node:${nodeRuntimePath}`);
  }

  return args;
}
