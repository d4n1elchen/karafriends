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
