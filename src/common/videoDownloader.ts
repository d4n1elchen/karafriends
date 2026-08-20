import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";

import invariant from "ts-invariant";

import {
  DownloadQueueItem,
  JoysoundQueueItem,
  QueueSongResult,
  UserIdentity,
} from "../main/graphql";
import { JoysoundAPI, JoysoundSongRawData } from "../main/joysoundApi";

import { ensureExternalResources, getResourcePaths } from "./externalResources";
import {
  getJoysoundOggPlaytime,
  getJoysoundTelopDuration,
} from "./joysoundMediaMetadata";
import { getWebDataDirectory, isElectronRuntime } from "./runtimePaths";
import { SharedDownloadCoordinator } from "./sharedDownloadCore";
import { getNiconicoYtDlpDownloadArgs } from "./niconicoYtDlpArgs";
import { getYoutubeYtDlpArgs } from "./youtubeYtDlpArgs";
import { isValidYoutubeCaptionCode } from "./youtubeCaptionCode";
import {
  getMediaCacheRequirements,
  hasAnyMediaCache,
  MediaSource,
  verifyMediaCacheRequirements,
} from "./mediaCacheCore";

export const TEMP_FOLDER: string =
  process.env.KARAFRIENDS_MEDIA_DIR ||
  (isElectronRuntime()
    ? path.join(os.tmpdir(), "karafriends_tmp")
    : path.join(getWebDataDirectory(), "media"));

let mediaCacheSnapshot: { expiresAt: number; filenames: string[] } | null =
  null;

function getMediaCacheSnapshot(): string[] {
  const now = Date.now();
  if (mediaCacheSnapshot && mediaCacheSnapshot.expiresAt > now) {
    return mediaCacheSnapshot.filenames;
  }

  let filenames: string[] = [];
  try {
    filenames = fs.readdirSync(TEMP_FOLDER);
  } catch {
    // A fresh installation may not have created the media directory yet.
  }

  mediaCacheSnapshot = { expiresAt: now + 1000, filenames };
  return filenames;
}

export function isMediaDownloaded(
  source: MediaSource,
  songId: string,
  suffix: string | null,
): boolean {
  const requirements = getMediaCacheRequirements(
    TEMP_FOLDER,
    source,
    songId,
    suffix,
  );
  return (
    requirements.length > 0 &&
    requirements.every((filename) => fs.existsSync(filename))
  );
}

export function isAnyMediaDownloaded(
  source: MediaSource,
  songId: string,
): boolean {
  return hasAnyMediaCache(getMediaCacheSnapshot(), source, songId);
}

interface JoysoundVideoData {
  songId: string;
  songDuration: number;
  songPlaytime: number;
  videoPlaytime: number;
  oggBuffer: Buffer;
}

const resourcePaths = getResourcePaths();

// Filesystem cleanup helpers. These run inside async spawn/exit callbacks where
// an uncaught throw would crash the whole app, so they must never throw: a
// missing or already-removed file during cleanup is not fatal.
function safeUnlink(filename: string): void {
  try {
    fs.rmSync(filename, { force: true });
  } catch (err) {
    console.error(`Failed to remove ${filename}:`, err);
  }
}

function safeRename(from: string, to: string): boolean {
  try {
    fs.renameSync(from, to);
    return true;
  } catch (err) {
    console.error(`Failed to rename ${from} -> ${to}:`, err);
    return false;
  }
}

// A spawned binary (ffmpeg / yt-dlp) emits an "error" event if it can't be
// launched (missing, not executable, etc). Unhandled, an EventEmitter "error"
// throws and crashes the app -- a real risk now that these binaries are
// downloaded at runtime. Log it and run the caller's cleanup instead of letting
// one failed download take everything down.
function handleProcessError(
  proc: ChildProcess,
  label: string,
  cleanup: () => void,
): void {
  proc.on("error", (err) => {
    console.error(`${label} failed to run:`, err);
    try {
      cleanup();
    } catch (cleanupErr) {
      console.error(`${label} cleanup failed:`, cleanupErr);
    }
  });
}

// A log write stream can emit "error" (bad path, disk full); unhandled, it
// crashes the app. Logging is best-effort, so swallow it.
function attachLogStreamErrorHandler(
  stream: fs.WriteStream,
  label: string,
): void {
  stream.on("error", (err) => {
    console.error(`${label} log stream error:`, err);
  });
}

function deleteTempFiles(prefix: string): void {
  let filenames: string[];
  try {
    filenames = fs.readdirSync(TEMP_FOLDER);
  } catch (err) {
    console.error(`Failed to list ${TEMP_FOLDER} for cleanup:`, err);
    return;
  }
  for (const filename of filenames) {
    if (
      filename &&
      (filename === prefix ||
        filename.startsWith(`${prefix}.`) ||
        filename.startsWith(`${prefix}-`))
    ) {
      // NB: readdirSync returns bare names; they must be joined with
      // TEMP_FOLDER or the unlink targets the wrong (cwd-relative) path.
      safeUnlink(path.join(TEMP_FOLDER, filename));
    }
  }
}

function handleFFmpegDownloadLog(
  log: string,
  songFrames: number,
  downloadQueueItem: DownloadQueueItem,
): void {
  const frameMatchData = log.match(/frame=\s*(\d+)\s*/);

  if (frameMatchData) {
    const rawProgress = parseInt(frameMatchData[1], 10) / songFrames;
    const progress = Math.min(rawProgress, 1.0);

    downloadQueueItem.progress = Math.max(downloadQueueItem.progress, progress);
  }
}

function handleYoutubeDownloadLog(
  log: string,
  downloadQueueItem: DownloadQueueItem,
): void {
  const matchData = log.match(/\[download\]\s*(\d+\.\d)%/);

  if (matchData) {
    const progress = Math.min(parseFloat(matchData[1]) / 100.0, 1.0);

    downloadQueueItem.progress = Math.max(downloadQueueItem.progress, progress);
  }
}

export function getVideoDownloadProgress(
  downloadQueue: DownloadQueueItem[],
  downloadType: number,
  songId: string,
  suffix: string | null = null,
): number {
  const downloadQueueItem = downloadQueue.find(
    (item) =>
      item.downloadType === downloadType &&
      item.songId === songId &&
      item.suffix === suffix,
  );

  if (downloadQueueItem) {
    return downloadQueueItem.progress;
  }

  return -1.0;
}

function removeVideoDownloadFromQueue(
  downloadQueue: DownloadQueueItem[],
  downloadQueueItem: DownloadQueueItem,
): void {
  if (sharedDownloads.has(downloadQueueItem)) return;

  const index = downloadQueue.indexOf(downloadQueueItem);
  if (index >= 0) downloadQueue.splice(index, 1);
}

const sharedDownloads = new SharedDownloadCoordinator<UserIdentity>();

function beginSharedDownload(
  key: string,
  downloadQueue: DownloadQueueItem[],
  downloadType: number,
  userIdentity: UserIdentity,
  songId: string,
  suffix: string | null,
  onComplete: (result: unknown) => void,
): { isOwner: boolean; item: DownloadQueueItem } {
  return sharedDownloads.begin(
    key,
    downloadQueue,
    { downloadType, userIdentity, songId, suffix },
    onComplete,
  ) as { isOwner: boolean; item: DownloadQueueItem };
}

function completeSharedDownload(
  item: DownloadQueueItem,
  result?: unknown,
): void {
  sharedDownloads.complete(item, result);
}

function failSharedDownload(item: DownloadQueueItem): void {
  sharedDownloads.fail(item);
}

function completeVerifiedDownload(
  source: MediaSource,
  songId: string,
  suffix: string | null,
  item: DownloadQueueItem,
  result?: unknown,
): boolean {
  const verification = verifyMediaCacheRequirements(
    TEMP_FOLDER,
    source,
    songId,
    suffix,
    fs.existsSync,
  );
  if (!verification.complete) {
    console.error(
      `Refusing to queue ${source} song ${songId}: required media output is missing${
        verification.missingFiles.length > 0
          ? ` (${verification.missingFiles.join(", ")})`
          : ""
      }`,
    );
    failSharedDownload(item);
    return false;
  }

  completeSharedDownload(item, result);
  return true;
}

export function downloadDamVideo(
  downloadQueue: DownloadQueueItem[],
  userIdentity: UserIdentity,
  m3u8Url: string | Promise<string>,
  songId: string,
  suffix: string,
  onComplete: () => void,
): void {
  const { isOwner, item: downloadQueueItem } = beginSharedDownload(
    `dam:${songId}:${suffix}`,
    downloadQueue,
    3,
    userIdentity,
    songId,
    suffix,
    () => onComplete(),
  );
  if (!isOwner) return;

  Promise.all([ensureExternalResources(), Promise.resolve(m3u8Url)])
    .then(([, resolvedM3u8Url]) =>
      downloadDamVideoImpl(resolvedM3u8Url, songId, suffix, downloadQueueItem),
    )
    .catch((err) => {
      failSharedDownload(downloadQueueItem);
      console.error(`Error preparing external resources: ${err}`);
    });
}

function downloadDamVideoImpl(
  m3u8Url: string,
  songId: string,
  suffix: string,
  downloadQueueItem: DownloadQueueItem,
): void {
  if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER);
  }

  const filename = `${TEMP_FOLDER}/${songId}-${suffix}.mp4`;
  const tempFilename = `${filename}.tmp`;

  if (fs.existsSync(filename)) {
    console.info(`${filename} already exists, not redownloading`);
    completeVerifiedDownload("DAM", songId, suffix, downloadQueueItem);
    return;
  }

  console.info(`Downloading DAM video to ${filename}`);

  const ffmpegLogFilename = `${TEMP_FOLDER}/dam-${songId}.log`;
  const ffmpegLogStream = fs.createWriteStream(ffmpegLogFilename);
  attachLogStreamErrorHandler(ffmpegLogStream, "ffmpeg (DAM)");

  const ffmpeg = spawn(
    resourcePaths.ffmpeg,
    [
      "-y",
      "-i",
      m3u8Url,
      "-c",
      "copy",
      "-movflags",
      "faststart",
      "-f",
      "mp4",
      tempFilename,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  invariant(ffmpeg.stdout);
  invariant(ffmpeg.stderr);
  ffmpeg.stdout.pipe(process.stdout);
  ffmpeg.stdout.pipe(ffmpegLogStream);
  ffmpeg.stderr.pipe(process.stderr);
  ffmpeg.stderr.pipe(ffmpegLogStream);

  handleProcessError(ffmpeg, "ffmpeg (DAM)", () => {
    safeUnlink(tempFilename);
    failSharedDownload(downloadQueueItem);
  });

  ffmpeg.on("exit", (code, signal) => {
    if (code === 0) {
      if (!safeRename(tempFilename, filename)) {
        failSharedDownload(downloadQueueItem);
        return;
      }
      completeVerifiedDownload("DAM", songId, suffix, downloadQueueItem);
    } else {
      failSharedDownload(downloadQueueItem);
      console.error(
        `Error downloading DAM video with ID ${songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
      );
    }
  });
}

function makeJoysoundFFmpegCall(
  songId: string,
  ffmpegArgs: string[],
  ffmpegLogFilename: string,
  onStderrData: null | ((data: Buffer) => any),
  onExit: null | ((code: number, signal: number) => any),
  stdinBuffer: Buffer | string | null,
): void {
  const ffmpegLogStream = fs.createWriteStream(ffmpegLogFilename, {
    flags: "a",
  });
  attachLogStreamErrorHandler(ffmpegLogStream, "ffmpeg (Joysound)");

  const ffmpeg = spawn(resourcePaths.ffmpeg, ffmpegArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  invariant(ffmpeg.stdin);
  invariant(ffmpeg.stdout);
  invariant(ffmpeg.stderr);

  ffmpeg.stdout.pipe(process.stdout);
  ffmpeg.stdout.pipe(ffmpegLogStream);
  ffmpeg.stderr.pipe(process.stderr);
  ffmpeg.stderr.pipe(ffmpegLogStream);

  if (onStderrData) {
    ffmpeg.stderr.on("data", onStderrData);
  }

  if (onExit) {
    ffmpeg.on("exit", onExit);
  }

  // If ffmpeg can't be launched at all, drive the same exit path (non-zero
  // code) so the wrapping promise rejects instead of hanging or crashing.
  handleProcessError(ffmpeg, "ffmpeg (Joysound)", () => {
    if (onExit) {
      onExit(-1, 0);
    }
  });

  if (stdinBuffer) {
    ffmpeg.stdin.write(stdinBuffer);
    ffmpeg.stdin.end();
  }
}

function downloadJoysoundVideoPromise(
  songId: string,
  videoUrl: string,
  downloadQueue: DownloadQueueItem[],
  downloadQueueItem: DownloadQueueItem,
  tempFilename: string,
  ffmpegLogFilename: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let songFrames = 0;

    const ffmpegArgs = [
      "-i",
      videoUrl,
      "-c",
      "copy",
      "-movflags",
      "faststart",
      "-f",
      "mp4",
      "-y",
      tempFilename,
    ];

    const onStderrData = (ffmpegData: Buffer) => {
      const ffmpegLog = ffmpegData.toString();

      const durationMatchData = ffmpegLog.match(
        /Duration:\s*(\d+):(\d+):(\d+)/,
      );

      if (durationMatchData) {
        let songDuration = 0;

        songDuration += parseInt(durationMatchData[1], 10) * 3600;
        songDuration += parseInt(durationMatchData[2], 10) * 60;
        songDuration += parseInt(durationMatchData[3], 10);

        songFrames = songDuration * 30;
      }

      handleFFmpegDownloadLog(ffmpegLog, songFrames, downloadQueueItem);
    };

    const onExit = (code: number, signal: number) => {
      if (code === 0) {
        removeVideoDownloadFromQueue(downloadQueue, downloadQueueItem);

        resolve(code);
      } else {
        console.error(
          `Error downloading Joysound video with ID ${songId}: url=${videoUrl}, code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
        );

        reject(code);
      }
    };

    makeJoysoundFFmpegCall(
      songId,
      ffmpegArgs,
      ffmpegLogFilename,
      onStderrData,
      onExit,
      null,
    );
  });
}

function downloadJoysoundYoutubeVideoPromise(
  songId: string,
  youtubeVideoId: string,
  downloadQueue: DownloadQueueItem[],
  downloadQueueItem: DownloadQueueItem,
  tempFilename: string,
  useEmbeddedFallback = false,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const ytdlpLogFilename = `${TEMP_FOLDER}/yt-${youtubeVideoId}.log`;
    const ytdlpLogStream = fs.createWriteStream(ytdlpLogFilename);
    attachLogStreamErrorHandler(ytdlpLogStream, "yt-dlp");

    const env = { ...process.env };
    // Don't need a proxy to download from YouTube
    delete env.http_proxy;
    delete env.HTTP_PROXY;
    delete env.https_proxy;
    delete env.HTTPS_PROXY;

    const ytdlp = spawn(
      resourcePaths.ytdlp,
      [
        ...getYoutubeYtDlpArgs(
          useEmbeddedFallback ? "web_embedded" : undefined,
        ),
        "-S",
        "res:720,ext:mp4",
        "-f",
        "bv",
        "--recode",
        "mp4",
        "-N",
        "4",
        "--ffmpeg-location",
        resourcePaths.ffmpeg,
        "-o",
        tempFilename + ".mp4",
        "--",
        youtubeVideoId!,
      ],
      {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    invariant(ytdlp.stdout);
    invariant(ytdlp.stderr);

    ytdlp.stdout.pipe(process.stdout);
    ytdlp.stdout.pipe(ytdlpLogStream);
    ytdlp.stderr.pipe(process.stderr);
    ytdlp.stderr.pipe(ytdlpLogStream);

    ytdlp.stdout.on("data", (data) => {
      handleYoutubeDownloadLog(data.toString(), downloadQueueItem);
    });

    handleProcessError(ytdlp, "yt-dlp (Joysound/YouTube)", () => {
      removeVideoDownloadFromQueue(downloadQueue, downloadQueueItem);
      reject(-1);
    });

    ytdlp.on("exit", (code, signal) => {
      if (code === 0) {
        safeUnlink(tempFilename);
        if (!safeRename(tempFilename + ".mp4", tempFilename)) {
          removeVideoDownloadFromQueue(downloadQueue, downloadQueueItem);
          reject(new Error(`Unable to finalize Joysound video ${songId}`));
          return;
        }

        removeVideoDownloadFromQueue(downloadQueue, downloadQueueItem);

        resolve(code);
      } else if (!useEmbeddedFallback) {
        console.warn(
          `Default yt-dlp clients failed for ${youtubeVideoId}; retrying with web_embedded`,
        );
        resolve(
          downloadJoysoundYoutubeVideoPromise(
            songId,
            youtubeVideoId,
            downloadQueue,
            downloadQueueItem,
            tempFilename,
            true,
          ),
        );
      } else {
        removeVideoDownloadFromQueue(downloadQueue, downloadQueueItem);
        console.error(
          `Error downloading Youtube Video with ID ${youtubeVideoId}: code=${code}, signal=${signal}, log=${ytdlpLogFilename}`,
        );
        reject(code);
      }
    });
  });
}

function composeJoysoundVideoPromise(
  songId: string,
  telopBuffer: Buffer,
  oggBuffer: Buffer,
  tempFilename: string,
  videoFilename: string,
  ffmpegLogFilename: string,
): Promise<JoysoundVideoData> {
  return new Promise((resolve, reject) => {
    let videoPlaytime = 0;

    const ffmpegArgs = [
      "-stream_loop",
      "-1",
      "-i",
      tempFilename,
      "-i",
      "-",
      "-c",
      "copy",
      "-shortest",
      "-movflags",
      "faststart",
      "-f",
      "mp4",
      videoFilename,
    ];

    const onStderrData = (ffmpegData: Buffer) => {
      const ffmpegLog = ffmpegData.toString();

      const durationMatchData = ffmpegLog.match(
        /Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/,
      );

      // XXX: We assume that the video duration always comes first
      if (durationMatchData && videoPlaytime === 0) {
        videoPlaytime += parseInt(durationMatchData[1], 10) * 3600;
        videoPlaytime += parseInt(durationMatchData[2], 10) * 60;
        videoPlaytime += parseInt(durationMatchData[3], 10);
        videoPlaytime =
          videoPlaytime * 1000 + parseInt(durationMatchData[4], 10) * 10;
      }
    };

    const onExit = (code: number, signal: number) => {
      safeUnlink(tempFilename);

      if (code === 0) {
        try {
          const metadata: JoysoundVideoData = {
            songDuration: getJoysoundTelopDuration(telopBuffer) * 1000,
            songPlaytime: getJoysoundOggPlaytime(oggBuffer),
            songId,
            oggBuffer,
            videoPlaytime,
          };

          resolve(metadata);
        } catch (error) {
          safeUnlink(videoFilename);
          reject(
            new Error(
              `Invalid Joysound media metadata for song ${songId}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            ),
          );
        }
      } else {
        console.error(
          `Error downloading Joysound video with ID ${songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
        );

        reject(code);
      }
    };

    makeJoysoundFFmpegCall(
      songId,
      ffmpegArgs,
      ffmpegLogFilename,
      onStderrData,
      onExit,
      oggBuffer,
    );
  });
}

function padJoysoundVideoPromise(
  data: JoysoundVideoData,
  videoFilename: string,
  ffmpegLogFilename: string,
  onComplete: () => void,
): Promise<number> {
  const videoBaseFilename = videoFilename.substr(0, videoFilename.length - 4);

  const videoNoSoundFilename = videoBaseFilename + "-no-sound.mp4";
  const videoPadFrameFilename = videoBaseFilename + "-pad-1f.mp4";
  const videoPadFilename = videoBaseFilename + "-pad.mp4";
  const videoConcatFilename = videoBaseFilename + "-concat.mp4";
  const videoTempFilename = videoBaseFilename + "-temp.mp4";
  const videoOutFilename = videoBaseFilename + "-out.mp4";
  const videoListFilename = videoBaseFilename + "-list.txt";

  return new Promise<number>((resolve, reject) => {
    const ffmpegArgs = [
      "-i",
      videoFilename,
      "-c",
      "copy",
      "-an",
      "-y",
      videoNoSoundFilename,
    ];

    const onExit = (code: number, signal: number) => {
      if (code === 0) {
        resolve(code);
      } else {
        console.error(
          `Error downloading Joysound video with ID ${data.songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
        );

        reject(code);
      }
    };

    makeJoysoundFFmpegCall(
      data.songId,
      ffmpegArgs,
      ffmpegLogFilename,
      null,
      onExit,
      null,
    );
  })
    .then(() => {
      return new Promise<number>((resolve, reject) => {
        const ffmpegArgs = [
          "-i",
          videoNoSoundFilename,
          "-frames:v",
          "1",
          "-c:v",
          "copy",
          "-an",
          "-y",
          videoPadFrameFilename,
        ];

        const onExit = (code: number, signal: number) => {
          if (code === 0) {
            resolve(code);
          } else {
            console.error(
              `Error downloading Joysound video with ID ${data.songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
            );

            reject(code);
          }
        };

        makeJoysoundFFmpegCall(
          data.songId,
          ffmpegArgs,
          ffmpegLogFilename,
          null,
          onExit,
          null,
        );
      });
    })
    .then(() => {
      return new Promise<number>((resolve, reject) => {
        const offset = Math.max(data.songPlaytime - data.videoPlaytime, 0);

        const ffmpegArgs = [
          "-stream_loop",
          "-1",
          "-i",
          videoPadFrameFilename,
          "-c",
          "copy",
          "-t",
          `${offset}ms`,
          "-y",
          videoPadFilename,
        ];

        const onExit = (code: number, signal: number) => {
          if (code === 0) {
            resolve(code);
          } else {
            console.error(
              `Error downloading Joysound video with ID ${data.songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
            );

            reject(code);
          }
        };

        makeJoysoundFFmpegCall(
          data.songId,
          ffmpegArgs,
          ffmpegLogFilename,
          null,
          onExit,
          null,
        );
      });
    })
    .then(() => {
      return new Promise<number>((resolve, reject) => {
        let listFile = "";

        listFile += `file '${videoPadFilename.replace(/\\/g, "/")}'`;
        listFile += "\n";
        listFile += `file '${videoNoSoundFilename.replace(/\\/g, "/")}'`;

        fs.writeFileSync(videoListFilename, listFile);

        const ffmpegArgs = [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          videoListFilename,
          "-c",
          "copy",
          "-y",
          videoConcatFilename,
        ];

        const onExit = (code: number, signal: number) => {
          if (code === 0) {
            resolve(code);
          } else {
            console.error(
              `Error downloading Joysound video with ID ${data.songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
            );

            reject(code);
          }
        };

        makeJoysoundFFmpegCall(
          data.songId,
          ffmpegArgs,
          ffmpegLogFilename,
          null,
          onExit,
          null,
        );
      });
    })
    .then(() => {
      return new Promise<number>((resolve, reject) => {
        const ffmpegArgs = [
          "-i",
          videoFilename,
          "-i",
          videoConcatFilename,
          "-map",
          "0:a",
          "-map",
          "1:v",
          "-c",
          "copy",
          "-shortest",
          "-y",
          videoOutFilename,
        ];

        const onExit = (code: number, signal: number) => {
          if (code === 0) {
            const backedUpOriginal = safeRename(
              videoFilename,
              videoTempFilename,
            );
            const installedOutput =
              backedUpOriginal && safeRename(videoOutFilename, videoFilename);
            if (!installedOutput) {
              if (backedUpOriginal && !fs.existsSync(videoFilename)) {
                safeRename(videoTempFilename, videoFilename);
              }
              reject(
                new Error(
                  `Unable to finalize padded Joysound video ${data.songId}`,
                ),
              );
              return;
            }

            safeUnlink(videoNoSoundFilename);
            safeUnlink(videoPadFrameFilename);
            safeUnlink(videoPadFilename);
            safeUnlink(videoTempFilename);
            safeUnlink(videoConcatFilename);

            onComplete();

            resolve(code);
          } else {
            console.error(
              `Error downloading Joysound video with ID ${data.songId}: code=${code}, signal=${signal}, log=${ffmpegLogFilename}`,
            );

            reject(code);
          }
        };

        makeJoysoundFFmpegCall(
          data.songId,
          ffmpegArgs,
          ffmpegLogFilename,
          null,
          onExit,
          null,
        );
      });
    });
}

export function downloadJoysoundData(
  downloadQueue: DownloadQueueItem[],
  userIdentity: UserIdentity,
  joysoundApi: JoysoundAPI,
  queueItem: JoysoundQueueItem,
  pushToHead: boolean,
  pushSongToQueue: (
    queueItem: JoysoundQueueItem,
    pushToHead: boolean,
  ) => QueueSongResult,
): void {
  const videoFilenameSuffix = queueItem.youtubeVideoId || "default";
  const { isOwner, item: downloadQueueItem } = beginSharedDownload(
    `joysound:${queueItem.songId}:${videoFilenameSuffix}`,
    downloadQueue,
    0,
    userIdentity,
    queueItem.songId,
    queueItem.youtubeVideoId,
    (playtime) =>
      pushSongToQueue(
        {
          ...queueItem,
          playtime:
            typeof playtime === "number" ? playtime : queueItem.playtime,
        },
        pushToHead,
      ),
  );
  if (!isOwner) return;

  ensureExternalResources()
    .then(() =>
      downloadJoysoundDataImpl(joysoundApi, queueItem, downloadQueueItem),
    )
    .catch((err) => {
      console.error(`Error preparing external resources: ${err}`);
      failSharedDownload(downloadQueueItem);
    });
}

function downloadJoysoundDataImpl(
  joysoundApi: JoysoundAPI,
  queueItem: JoysoundQueueItem,
  downloadQueueItem: DownloadQueueItem,
): void {
  if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER);
  }

  const songId = queueItem.songId;

  const videoFilenameSuffix = queueItem.youtubeVideoId
    ? queueItem.youtubeVideoId
    : "default";

  const filenamePrefix = `joysound-${songId}`;
  const writeBasePath = `${TEMP_FOLDER}/${filenamePrefix}`;

  const telopFilename = `${writeBasePath}.joy_02`;
  const videoFilename = `${writeBasePath}-${videoFilenameSuffix}.mp4`;
  const ffmpegLogFilename = `${writeBasePath}.log`;

  const tempFilename = `${videoFilename}.tmp`;

  if (fs.existsSync(videoFilename)) {
    console.info(`${videoFilename} already exists, not redownloading`);

    if (fs.existsSync(telopFilename)) {
      try {
        const telopBuffer = fs.readFileSync(telopFilename);
        completeVerifiedDownload(
          "JOYSOUND",
          songId,
          queueItem.youtubeVideoId,
          downloadQueueItem,
          getJoysoundTelopDuration(telopBuffer),
        );
        return;
      } catch (error) {
        console.error(
          `Cached Joysound metadata for song ${songId} is invalid; redownloading:`,
          error,
        );
        safeUnlink(telopFilename);
        safeUnlink(videoFilename);
      }
    } else {
      console.error(
        `${videoFilename} already exists, but ${telopFilename} does not.`,
      );

      safeUnlink(videoFilename);
    }
  }

  if (fs.existsSync(tempFilename)) {
    console.error(`${tempFilename} exists but was not in the download queue.`);

    deleteTempFiles(path.basename(videoFilename, ".mp4"));
  }

  fs.closeSync(fs.openSync(tempFilename, "w"));

  const songDataPromise = joysoundApi.getSongRawData(songId);
  let videoDataPromise;

  if (queueItem.youtubeVideoId) {
    videoDataPromise = downloadJoysoundYoutubeVideoPromise(
      songId,
      queueItem.youtubeVideoId,
      [],
      downloadQueueItem,
      tempFilename,
    );
  } else {
    videoDataPromise = joysoundApi.getMovieUrls(songId).then((data) => {
      const videoUrl = data.movie.mov1;

      return downloadJoysoundVideoPromise(
        songId,
        videoUrl,
        [],
        downloadQueueItem,
        tempFilename,
        ffmpegLogFilename,
      );
    });
  }

  console.info(`Downloading Joysound video to ${videoFilename}`);

  Promise.all([videoDataPromise, songDataPromise])
    .then((values) => {
      const joysoundSongRawData = values[1];

      const telopBase64 = joysoundSongRawData.telop;
      const oggBase64 = joysoundSongRawData.ogg;

      const telopBuffer = Buffer.from(
        telopBase64.slice(30) + telopBase64.slice(0, 30),
        "base64",
      );

      const oggBuffer = Buffer.from(
        oggBase64.slice(30) + oggBase64.slice(0, 30),
        "base64",
      );

      // Reject corrupt/truncated upstream payloads before launching another
      // child process. Both parsers provide bounded, stage-specific errors.
      getJoysoundTelopDuration(telopBuffer);
      getJoysoundOggPlaytime(oggBuffer);

      if (!fs.existsSync(telopFilename)) {
        fs.writeFileSync(telopFilename, telopBuffer);
      }

      return composeJoysoundVideoPromise(
        songId,
        telopBuffer,
        oggBuffer,
        tempFilename,
        videoFilename,
        ffmpegLogFilename,
      );
    })
    .then((data) => {
      const playtime = Math.floor(data.songPlaytime / 1000);

      if (
        queueItem.youtubeVideoId &&
        Math.abs(data.songDuration - data.videoPlaytime) < 10000
      ) {
        return padJoysoundVideoPromise(
          data,
          videoFilename,
          ffmpegLogFilename,
          () =>
            completeVerifiedDownload(
              "JOYSOUND",
              songId,
              queueItem.youtubeVideoId,
              downloadQueueItem,
              playtime,
            ),
        );
      } else {
        completeVerifiedDownload(
          "JOYSOUND",
          songId,
          queueItem.youtubeVideoId,
          downloadQueueItem,
          playtime,
        );
      }
    })
    .catch((err) => {
      // This chain is fire-and-forget (not awaited by the caller), so an
      // unhandled rejection here — a Joysound API failure, an ffmpeg/yt-dlp
      // launch failure, bad telop/ogg data, etc. — would otherwise reach the
      // process-level handler and crash the app. Fail just this download.
      console.error(`Error downloading Joysound video with ID ${songId}:`, err);
      failSharedDownload(downloadQueueItem);
      deleteTempFiles(path.basename(videoFilename, ".mp4"));
    });
}

const youtubeCaptionRequests = new Map<string, Set<string>>();

export function downloadYoutubeVideo(
  downloadQueue: DownloadQueueItem[],
  userIdentity: UserIdentity,
  videoId: string,
  captionCode: string | null,
  onComplete: () => any,
): void {
  if (captionCode !== null && !isValidYoutubeCaptionCode(captionCode)) {
    console.error(
      `Error downloading Youtube Video. ${captionCode} is not a valid caption code`,
    );
    return;
  }
  if (captionCode) {
    const requests = youtubeCaptionRequests.get(videoId) || new Set<string>();
    requests.add(captionCode);
    youtubeCaptionRequests.set(videoId, requests);
  }

  const { isOwner, item: downloadQueueItem } = beginSharedDownload(
    `youtube:${videoId}`,
    downloadQueue,
    1,
    userIdentity,
    videoId,
    null,
    () => onComplete(),
  );
  if (!isOwner) return;

  ensureExternalResources()
    .then(() =>
      downloadYoutubeVideoImpl(videoId, captionCode, downloadQueueItem),
    )
    .catch((err) => {
      console.error(`Error preparing external resources: ${err}`);
      youtubeCaptionRequests.delete(videoId);
      failSharedDownload(downloadQueueItem);
    });
}

function downloadYoutubeVideoImpl(
  videoId: string,
  captionCode: string | null,
  downloadQueueItem: DownloadQueueItem,
): void {
  if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER);
  }

  const filenamePrefix = `yt-${videoId}`;
  const writeBasePath = `${TEMP_FOLDER}/${filenamePrefix}`;

  const videoFilename = `${writeBasePath}.mp4`;
  const ytdlpLogFilename = `${writeBasePath}.log`;

  const tempFilename = `${videoFilename}.tmp`;

  if (fs.existsSync(tempFilename)) {
    console.error(`${tempFilename} exists but was not in the download queue.`);

    deleteTempFiles(filenamePrefix);
  }

  fs.closeSync(fs.openSync(tempFilename, "w"));

  console.info(`Downloading YouTube video to ${videoFilename}`);

  const ytdlpLogStream = fs.createWriteStream(ytdlpLogFilename);

  attachLogStreamErrorHandler(ytdlpLogStream, "yt-dlp");

  const captionArgs = captionCode
    ? ["--write-subs", "--sub-langs", captionCode, "--sub-format", "vtt"]
    : [];

  const failDownload = (code: number | null, signal: NodeJS.Signals | null) => {
    youtubeCaptionRequests.delete(videoId);
    failSharedDownload(downloadQueueItem);
    safeUnlink(tempFilename);
    console.error(
      `Error downloading Youtube Video with ID ${videoId}: code=${code}, signal=${signal}, log=${ytdlpLogFilename}`,
    );
  };

  const finishDownload = () => {
    safeUnlink(tempFilename);
    youtubeCaptionRequests.delete(videoId);
    completeVerifiedDownload("YOUTUBE", videoId, null, downloadQueueItem);
  };

  const downloadJson3Captions = (
    playerClient: string | undefined,
    onFinished: () => void,
  ) => {
    if (!captionCode) {
      onFinished();
      return;
    }

    const json3Filename = `${writeBasePath}.${captionCode}.json3`;
    console.info(`Downloading JSON3 YouTube captions to ${json3Filename}`);
    let finished = false;
    const finishOnce = (code: number | null, signal: NodeJS.Signals | null) => {
      if (finished) return;
      finished = true;

      if (code === 0) {
        safeRename(`${videoFilename}.${captionCode}.json3`, json3Filename);
      } else {
        console.warn(
          `Unable to download optional JSON3 captions for ${videoId}: code=${code}, signal=${signal}; keeping VTT captions`,
        );
      }

      onFinished();
    };

    const ytdlp = spawn(
      resourcePaths.ytdlp,
      [
        ...getYoutubeYtDlpArgs(playerClient),
        "--write-subs",
        "--sub-langs",
        captionCode,
        "--sub-format",
        "json3",
        "--skip-download",
        "-o",
        videoFilename,
        "--",
        videoId,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    invariant(ytdlp.stdout);
    invariant(ytdlp.stderr);

    ytdlp.stdout.pipe(process.stdout);
    ytdlp.stdout.pipe(ytdlpLogStream, { end: false });
    ytdlp.stderr.pipe(process.stderr);
    ytdlp.stderr.pipe(ytdlpLogStream, { end: false });

    handleProcessError(ytdlp, "yt-dlp (JSON3 captions)", () =>
      finishOnce(null, null),
    );
    ytdlp.on("exit", finishOnce);
  };

  const downloadCaptionFormat = (
    code: string,
    format: "vtt" | "json3",
    playerClient?: string,
  ): Promise<void> =>
    new Promise((resolve) => {
      const outputFilename = `${writeBasePath}.${code}.${format}`;
      if (fs.existsSync(outputFilename)) {
        resolve();
        return;
      }

      const outputTemplate = `${writeBasePath}.caption`;
      let finished = false;
      const finishOnce = (exitCode: number | null) => {
        if (finished) return;
        finished = true;
        const generatedFilename = `${outputTemplate}.${code}.${format}`;
        if (exitCode === 0) safeRename(generatedFilename, outputFilename);
        else {
          console.warn(
            `Unable to download optional ${format} captions for ${videoId} (${code})`,
          );
          safeUnlink(generatedFilename);
        }
        resolve();
      };

      const captionProcess = spawn(
        resourcePaths.ytdlp,
        [
          ...getYoutubeYtDlpArgs(playerClient),
          "--write-subs",
          "--sub-langs",
          code,
          "--sub-format",
          format,
          "--skip-download",
          "-o",
          outputTemplate,
          "--",
          videoId,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      invariant(captionProcess.stdout);
      invariant(captionProcess.stderr);
      captionProcess.stdout.pipe(process.stdout);
      captionProcess.stdout.pipe(ytdlpLogStream, { end: false });
      captionProcess.stderr.pipe(process.stderr);
      captionProcess.stderr.pipe(ytdlpLogStream, { end: false });
      handleProcessError(captionProcess, `yt-dlp (${format} captions)`, () =>
        finishOnce(null),
      );
      captionProcess.on("exit", (exitCode) => finishOnce(exitCode));
    });

  const downloadAllRequestedCaptions = async (playerClient?: string) => {
    const attempted = new Set<string>();
    while (true) {
      const requests = youtubeCaptionRequests.get(videoId);
      const nextCode = requests
        ? [...requests].find((code) => !attempted.has(code))
        : undefined;
      if (!nextCode) return;

      attempted.add(nextCode);
      await downloadCaptionFormat(nextCode, "vtt", playerClient);
      await downloadCaptionFormat(nextCode, "json3", playerClient);
    }
  };

  const runYtDlp = (useProgressiveFallback: boolean, playerClient?: string) => {
    const formatArgs = useProgressiveFallback
      ? ["-f", "18/b[height<=720][ext=mp4]/b[height<=720]"]
      : ["-S", "res:720,ext:mp4:m4a", "-N", "4"];
    const ytdlp = spawn(
      resourcePaths.ytdlp,
      [
        ...getYoutubeYtDlpArgs(playerClient),
        ...captionArgs,
        ...formatArgs,
        "--recode",
        "mp4",
        "--ffmpeg-location",
        resourcePaths.ffmpeg,
        "-o",
        videoFilename,
        "--",
        videoId,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    invariant(ytdlp.stdout);
    invariant(ytdlp.stderr);

    ytdlp.stdout.pipe(process.stdout);
    ytdlp.stdout.pipe(ytdlpLogStream, { end: false });
    ytdlp.stderr.pipe(process.stderr);
    ytdlp.stderr.pipe(ytdlpLogStream, { end: false });

    ytdlp.stdout.on("data", (data) => {
      handleYoutubeDownloadLog(data.toString(), downloadQueueItem);
    });

    handleProcessError(ytdlp, "yt-dlp", () => {
      failDownload(null, null);
    });

    ytdlp.on("exit", (code, signal) => {
      if (code === 0) {
        downloadJson3Captions(playerClient, () => {
          void downloadAllRequestedCaptions(playerClient).finally(() => {
            ytdlpLogStream.end();
            finishDownload();
          });
        });
        return;
      }

      if (!useProgressiveFallback) {
        console.warn(
          `Preferred YouTube formats failed for ${videoId}${playerClient ? ` using ${playerClient}` : ""}; retrying with a progressive MP4`,
        );
        downloadQueueItem.progress = 0;
        runYtDlp(true, playerClient);
        return;
      }

      if (!playerClient) {
        console.warn(
          `Default yt-dlp clients failed for ${videoId}; retrying with web_embedded`,
        );
        downloadQueueItem.progress = 0;
        runYtDlp(false, "web_embedded");
        return;
      }

      ytdlpLogStream.end();
      failDownload(code, signal);
    });
  };

  runYtDlp(false);
}

export function downloadNicoVideo(
  downloadQueue: DownloadQueueItem[],
  userIdentity: UserIdentity,
  videoId: string,
  onComplete: () => any,
): void {
  const { isOwner, item: downloadQueueItem } = beginSharedDownload(
    `niconico:${videoId}`,
    downloadQueue,
    2,
    userIdentity,
    videoId,
    null,
    () => onComplete(),
  );
  if (!isOwner) return;

  ensureExternalResources()
    .then(() => downloadNicoVideoImpl(videoId, downloadQueueItem))
    .catch((err) => {
      console.error(`Error preparing external resources: ${err}`);
      failSharedDownload(downloadQueueItem);
    });
}

function downloadNicoVideoImpl(
  videoId: string,
  downloadQueueItem: DownloadQueueItem,
): void {
  if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER);
  }

  const filenamePrefix = `nico-${videoId}`;
  const writeBasePath = `${TEMP_FOLDER}/${filenamePrefix}`;

  const videoFilename = `${writeBasePath}.mp4`;
  const ytdlpLogFilename = `${writeBasePath}.log`;

  const tempFilename = `${videoFilename}.tmp`;

  if (fs.existsSync(tempFilename)) {
    console.error(`${tempFilename} exists but was not in the download queue.`);

    deleteTempFiles(filenamePrefix);
  }

  fs.closeSync(fs.openSync(tempFilename, "w"));

  console.info(`Downloading Niconico video to ${videoFilename}`);

  const ytdlpLogStream = fs.createWriteStream(ytdlpLogFilename);

  attachLogStreamErrorHandler(ytdlpLogStream, "yt-dlp");

  const env = { ...process.env };
  // Don't need a proxy to download from Niconico
  delete env.http_proxy;
  delete env.HTTP_PROXY;
  delete env.https_proxy;
  delete env.HTTPS_PROXY;

  const ytdlp = spawn(
    resourcePaths.ytdlp,
    getNiconicoYtDlpDownloadArgs(videoId, videoFilename, resourcePaths.ffmpeg),
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  invariant(ytdlp.stdout);
  invariant(ytdlp.stderr);

  ytdlp.stdout.pipe(process.stdout);
  ytdlp.stdout.pipe(ytdlpLogStream);
  ytdlp.stderr.pipe(process.stderr);
  ytdlp.stderr.pipe(ytdlpLogStream);

  ytdlp.stdout.on("data", (data) => {
    handleYoutubeDownloadLog(data.toString(), downloadQueueItem);
  });

  handleProcessError(ytdlp, "yt-dlp", () => {
    failSharedDownload(downloadQueueItem);
    safeUnlink(tempFilename);
  });

  ytdlp.on("exit", (code, signal) => {
    safeUnlink(tempFilename);

    if (code === 0) {
      completeVerifiedDownload("NICONICO", videoId, null, downloadQueueItem);
    } else {
      failSharedDownload(downloadQueueItem);
      console.error(
        `Error downloading Niconico Video with ID ${videoId}: code=${code}, signal=${signal}, log=${ytdlpLogFilename}`,
      );
    }
  });
}
