const IPAD_SAFE_YOUTUBE_FORMAT =
  "bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[vcodec^=avc1][height<=720][ext=mp4]/18";

export function getYoutubeMediaFormatArgs(
  useProgressiveFallback: boolean,
): string[] {
  return useProgressiveFallback
    ? ["-f", "18"]
    : ["-f", IPAD_SAFE_YOUTUBE_FORMAT, "-N", "4"];
}

export function getJoysoundBackgroundFormatArgs(
  allowIncompatibleVideo: boolean,
): string[] {
  return allowIncompatibleVideo
    ? ["-S", "res:720,ext:mp4", "-f", "bv"]
    : [
        "-f",
        "bv[vcodec^=avc1][height<=720][ext=mp4]/bv[vcodec^=avc1][ext=mp4]",
      ];
}
