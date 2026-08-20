export const DOWNLOADING_TEXT = "Downloading…";

export function downloadingText(progress: number): string {
  if (progress < 0 || !Number.isFinite(progress)) return DOWNLOADING_TEXT;

  const percentage = Math.round(Math.min(progress, 1) * 100);
  return `${DOWNLOADING_TEXT} ${percentage}%`;
}

export function queuedText(etaSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(etaSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const formatted =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`
      : `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return `Queued — starts in ~${formatted}`;
}
