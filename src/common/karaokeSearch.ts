export type KaraokeKeyword = "none" | "jp" | "en" | "zh";

export const KARAOKE_KEYWORDS: Record<
  Exclude<KaraokeKeyword, "none">,
  string
> = {
  jp: "カラオケ",
  en: "karaoke",
  zh: "卡拉OK",
};

export function parseKaraokeKeyword(
  value: string | null,
): KaraokeKeyword | null {
  return value === "none" || value === "jp" || value === "en" || value === "zh"
    ? value
    : null;
}

export function buildKaraokeSearchQuery(
  query: string,
  mode: KaraokeKeyword,
): string {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || mode === "none") return trimmedQuery;

  const keyword = KARAOKE_KEYWORDS[mode];
  if (trimmedQuery.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) {
    return trimmedQuery;
  }

  return `${trimmedQuery} ${keyword}`;
}
