export type YoutubeKaraokeKeyword = "none" | "jp" | "en" | "zh";

export const YOUTUBE_KARAOKE_KEYWORDS: Record<
  Exclude<YoutubeKaraokeKeyword, "none">,
  string
> = {
  jp: "カラオケ",
  en: "karaoke",
  zh: "卡拉OK",
};

export function parseYoutubeKaraokeKeyword(
  value: string | null,
): YoutubeKaraokeKeyword | null {
  return value === "none" || value === "jp" || value === "en" || value === "zh"
    ? value
    : null;
}

export function buildYoutubeSearchQuery(
  query: string,
  mode: YoutubeKaraokeKeyword,
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || mode === "none") return trimmedQuery;

  const keyword = YOUTUBE_KARAOKE_KEYWORDS[mode];
  if (trimmedQuery.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) {
    return trimmedQuery;
  }

  return `${trimmedQuery} ${keyword}`;
}
