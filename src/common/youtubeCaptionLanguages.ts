export interface YoutubeCaptionLanguage {
  code: string;
  name: string;
}

const captionCodeRe = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export function isDownloadableYoutubeCaptionCode(code: string): boolean {
  return captionCodeRe.test(code);
}

export function extractDownloadableYoutubeCaptionLanguages(
  data: any,
): YoutubeCaptionLanguage[] {
  const captionTracks = data?.captions?.caption_tracks;
  if (!Array.isArray(captionTracks)) return [];

  return captionTracks
    .filter(
      (track: any) =>
        typeof track?.vss_id === "string" &&
        !track.vss_id.startsWith("a") &&
        typeof track?.language_code === "string" &&
        isDownloadableYoutubeCaptionCode(track.language_code),
    )
    .map((track: any) => ({
      code: track.language_code,
      name:
        typeof track.name?.text === "string" && track.name.text
          ? track.name.text
          : track.language_code,
    }));
}
