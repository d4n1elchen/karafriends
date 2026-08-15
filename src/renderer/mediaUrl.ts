export default function mediaUrl(filename: string): string {
  const encodedFilename = encodeURIComponent(filename);
  return window.karafriends?.isDesktop
    ? `karafriends://local/${encodedFilename}`
    : `/media/${encodedFilename}`;
}
