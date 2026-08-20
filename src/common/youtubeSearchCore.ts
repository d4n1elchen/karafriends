function badgeText(badge: any): string {
  const value =
    badge?.label ??
    badge?.text ??
    badge?.tooltip ??
    badge?.icon_type ??
    badge?.icon?.icon_type ??
    "";
  return typeof value === "string" ? value : value?.toString?.() || "";
}

export function youtubeSearchResultHasCaptions(result: any): boolean {
  if (result?.has_captions === true || result?.hasCaptions === true)
    return true;
  if (!Array.isArray(result?.badges)) return false;

  return result.badges.some((badge: any) =>
    /(?:^|\b)(?:cc|captions?|subtitles?)(?:\b|$)/i.test(badgeText(badge)),
  );
}
