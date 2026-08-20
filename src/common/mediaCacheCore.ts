import path from "path";

export type MediaSource = "DAM" | "JOYSOUND" | "YOUTUBE" | "NICONICO";

const safeCacheKey = /^[A-Za-z0-9_-]+$/;

export function hasAnyMediaCache(
  filenames: string[],
  source: MediaSource,
  songId: string,
): boolean {
  if (!safeCacheKey.test(songId)) return false;

  switch (source) {
    case "DAM":
      return filenames.some(
        (filename) =>
          filename.startsWith(`${songId}-`) && filename.endsWith(".mp4"),
      );
    case "JOYSOUND":
      return (
        filenames.includes(`joysound-${songId}.joy_02`) &&
        filenames.some(
          (filename) =>
            filename.startsWith(`joysound-${songId}-`) &&
            filename.endsWith(".mp4"),
        )
      );
    case "YOUTUBE":
      return filenames.includes(`yt-${songId}.mp4`);
    case "NICONICO":
      return filenames.includes(`nico-${songId}.mp4`);
  }
}

export function getMediaCacheRequirements(
  mediaDirectory: string,
  source: MediaSource,
  songId: string,
  suffix: string | null,
): string[] {
  if (!safeCacheKey.test(songId)) {
    return [];
  }

  if (suffix !== null && !safeCacheKey.test(suffix)) {
    return [];
  }

  switch (source) {
    case "DAM":
      return suffix === null
        ? []
        : [path.join(mediaDirectory, `${songId}-${suffix}.mp4`)];
    case "JOYSOUND":
      return [
        path.join(
          mediaDirectory,
          `joysound-${songId}-${suffix || "default"}.mp4`,
        ),
        path.join(mediaDirectory, `joysound-${songId}.joy_02`),
      ];
    case "YOUTUBE":
      // Captions are optional and must not affect the downloaded indicator.
      return [path.join(mediaDirectory, `yt-${songId}.mp4`)];
    case "NICONICO":
      return [path.join(mediaDirectory, `nico-${songId}.mp4`)];
  }
}
