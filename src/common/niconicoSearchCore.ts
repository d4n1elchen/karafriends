interface NiconicoSnapshotItem {
  contentId?: unknown;
  title?: unknown;
  thumbnailUrl?: unknown;
  lengthSeconds?: unknown;
  viewCounter?: unknown;
}

interface NiconicoSnapshotResponse {
  meta?: {
    status?: unknown;
  };
  data?: unknown;
}

export interface NiconicoSearchResult {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  lengthSeconds: number;
  viewCount: number;
}

export function parseNiconicoSearchResponse(
  value: unknown,
): NiconicoSearchResult[] {
  const response = value as NiconicoSnapshotResponse;
  if (response.meta?.status !== 200 || !Array.isArray(response.data)) {
    throw new Error("Niconico returned an invalid search response.");
  }

  return (response.data as NiconicoSnapshotItem[])
    .filter(
      (item) =>
        typeof item.contentId === "string" && typeof item.title === "string",
    )
    .map((item) => ({
      videoId: item.contentId as string,
      title: item.title as string,
      thumbnailUrl:
        typeof item.thumbnailUrl === "string" ? item.thumbnailUrl : null,
      lengthSeconds:
        typeof item.lengthSeconds === "number" &&
        Number.isFinite(item.lengthSeconds)
          ? Math.round(item.lengthSeconds)
          : 0,
      viewCount:
        typeof item.viewCounter === "number" &&
        Number.isFinite(item.viewCounter)
          ? item.viewCounter
          : 0,
    }));
}
