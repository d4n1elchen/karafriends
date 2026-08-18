import nodeFetch from "node-fetch";

import {
  NiconicoSearchResult,
  parseNiconicoSearchResponse,
} from "./niconicoSearchCore";

export type { NiconicoSearchResult } from "./niconicoSearchCore";

const NICONICO_SEARCH_ENDPOINT =
  "https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search";
const NICONICO_SEARCH_TIMEOUT_MS = 15_000;

export async function searchNiconico(
  query: string,
): Promise<NiconicoSearchResult[]> {
  const url = new URL(NICONICO_SEARCH_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("targets", "title,description,tags");
  url.searchParams.set(
    "fields",
    "contentId,title,viewCounter,thumbnailUrl,lengthSeconds",
  );
  url.searchParams.set("_sort", "-viewCounter");
  url.searchParams.set("_limit", "20");
  url.searchParams.set("_context", "karafriends");

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    NICONICO_SEARCH_TIMEOUT_MS,
  );
  try {
    const response = await nodeFetch(url, {
      headers: { "User-Agent": "Karafriends/0.1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Niconico search returned HTTP ${response.status}.`);
    }
    return parseNiconicoSearchResponse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
