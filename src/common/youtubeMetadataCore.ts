interface YtDlpSubtitleTrack {
  name?: string;
}

interface YtDlpMetadataJson {
  title?: string;
  uploader?: string;
  channel?: string;
  channel_id?: string;
  duration?: number;
  description?: string;
  view_count?: number;
  tags?: unknown[];
  subtitles?: Record<string, YtDlpSubtitleTrack[]>;
}

export interface YoutubeMetadata {
  author: string;
  captionLanguages: Array<{ code: string; name: string }>;
  channelId: string;
  description: string;
  keywords: string[];
  lengthSeconds: number;
  title: string;
  viewCount: number;
  gainValue: number;
}

export function parseYtDlpMetadata(raw: string): YoutubeMetadata {
  const data = JSON.parse(raw) as YtDlpMetadataJson;
  if (!data.title || typeof data.title !== "string") {
    throw new Error("yt-dlp returned video metadata without a title.");
  }

  return {
    author: data.uploader || data.channel || "",
    captionLanguages: Object.entries(data.subtitles || {}).map(
      ([code, tracks]) => ({
        code,
        name: tracks[0]?.name || code,
      }),
    ),
    channelId: data.channel_id || "",
    description: data.description || "",
    keywords: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    lengthSeconds:
      typeof data.duration === "number" && Number.isFinite(data.duration)
        ? data.duration
        : 0,
    title: data.title,
    viewCount:
      typeof data.view_count === "number" && Number.isFinite(data.view_count)
        ? data.view_count
        : 0,
    // yt-dlp does not expose the same player loudness value as YouTube.js.
    gainValue: 1.0,
  };
}
