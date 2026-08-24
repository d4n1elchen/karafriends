export function isIPadUserAgent(userAgent: string): boolean {
  return (
    /iPad|iPhone|iPod/.test(userAgent) || /Macintosh.*Mobile/.test(userAgent)
  );
}
