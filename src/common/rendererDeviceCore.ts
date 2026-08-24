export function isIPadRendererDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    /Macintosh.*Mobile/.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  );
}
