export function getNiconicoYtDlpDownloadArgs(
  videoId: string,
  outputFilename: string,
  ffmpegPath: string,
): string[] {
  return [
    "--ignore-config",
    "--ffmpeg-location",
    ffmpegPath,
    "--merge-output-format",
    "mp4",
    "-N",
    "4",
    "-o",
    outputFilename,
    "--",
    `https://www.nicovideo.jp/watch/${videoId}`,
  ];
}
