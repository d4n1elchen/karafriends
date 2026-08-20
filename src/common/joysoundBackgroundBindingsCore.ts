export interface JoysoundBackgroundBinding {
  updatedAt: string;
  youtubeVideoId: string;
}

export type JoysoundBackgroundBindings = Record<
  string,
  JoysoundBackgroundBinding
>;

const JOYSOUND_SONG_ID_RE = /^[A-Za-z0-9_-]+$/;
const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidJoysoundSongId(songId: string): boolean {
  return JOYSOUND_SONG_ID_RE.test(songId);
}

export function isValidYoutubeBackgroundId(videoId: string): boolean {
  return YOUTUBE_VIDEO_ID_RE.test(videoId);
}

export function parseJoysoundBackgroundBindings(
  raw: string,
): JoysoundBackgroundBindings {
  const parsed = JSON.parse(raw) as {
    bindings?: unknown;
    version?: unknown;
  };
  if (
    parsed.version !== 1 ||
    !parsed.bindings ||
    typeof parsed.bindings !== "object" ||
    Array.isArray(parsed.bindings)
  ) {
    throw new Error("Invalid Joysound background binding file");
  }

  return Object.fromEntries(
    Object.entries(parsed.bindings).filter(([songId, value]) => {
      if (
        !isValidJoysoundSongId(songId) ||
        !value ||
        typeof value !== "object"
      ) {
        return false;
      }
      const binding = value as Partial<JoysoundBackgroundBinding>;
      return (
        isValidYoutubeBackgroundId(binding.youtubeVideoId || "") &&
        typeof binding.updatedAt === "string"
      );
    }),
  ) as JoysoundBackgroundBindings;
}

export function serializeJoysoundBackgroundBindings(
  bindings: JoysoundBackgroundBindings,
): string {
  return JSON.stringify({ version: 1, bindings }, null, 2);
}
