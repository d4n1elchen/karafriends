import path from "path";

export function isElectronRuntime(
  versions: NodeJS.ProcessVersions = process.versions,
): boolean {
  return Boolean(
    (versions as NodeJS.ProcessVersions & { electron?: string }).electron,
  );
}

export function getWebDataDirectory(
  configuredDirectory = process.env.KARAFRIENDS_DATA_DIR,
  workingDirectory = process.cwd(),
): string {
  return configuredDirectory
    ? path.resolve(workingDirectory, configuredDirectory)
    : path.join(workingDirectory, "data");
}
