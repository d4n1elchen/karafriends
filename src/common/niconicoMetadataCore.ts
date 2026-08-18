interface YtDlpNiconicoMetadataJson {
  title?: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  channel_id?: string;
  duration?: number;
  description?: string;
  view_count?: number;
  thumbnail?: string;
}

export interface NiconicoMetadata {
  author: string;
  channelId: string;
  description: string;
  lengthSeconds: number;
  thumbnailUrl: string;
  title: string;
  viewCount: number;
}

export function parseNiconicoYtDlpMetadata(raw: string): NiconicoMetadata {
  const data = JSON.parse(raw) as YtDlpNiconicoMetadataJson;
  if (!data.title || typeof data.title !== "string") {
    throw new Error("yt-dlp returned Niconico metadata without a title.");
  }

  return {
    author: data.uploader || data.channel || "",
    channelId: data.uploader_id || data.channel_id || "",
    description: data.description || "",
    lengthSeconds:
      typeof data.duration === "number" && Number.isFinite(data.duration)
        ? Math.round(data.duration)
        : 0,
    thumbnailUrl: data.thumbnail || "",
    title: data.title,
    viewCount:
      typeof data.view_count === "number" && Number.isFinite(data.view_count)
        ? data.view_count
        : 0,
  };
}
