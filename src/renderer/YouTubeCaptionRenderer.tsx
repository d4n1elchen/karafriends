import React, { useEffect, useState } from "react";

import { KuroshiroSingleton } from "../common/joysoundParser";
import "./YouTubeCaptionRenderer.css";
import {
  applyJapaneseReadingTiming,
  isJapaneseCaptionCode,
  parseWebVtt,
  parseYouTubeJson3,
  YouTubeCaptionCue,
  YouTubeCaptionSegment,
} from "./youtubeCaptions";

const UPCOMING_CUE_WINDOW_MS = 5_000;
const FINISHED_CUE_WINDOW_MS = 2_000;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function segmentProgress(segment: YouTubeCaptionSegment, timeMs: number) {
  const duration = segment.endMs - segment.startMs;
  if (duration <= 0) return timeMs >= segment.endMs ? 100 : 0;

  return clamp(((timeMs - segment.startMs) / duration) * 100, 0, 100);
}

function findDisplayCue(cues: YouTubeCaptionCue[], timeMs: number) {
  if (cues.length === 0) return -1;

  let cueIndex = -1;
  for (let index = 0; index < cues.length; index += 1) {
    if (cues[index].startMs > timeMs) break;
    cueIndex = index;
  }

  if (cueIndex < 0) {
    return cues[0].startMs - timeMs <= UPCOMING_CUE_WINDOW_MS ? 0 : -1;
  }

  const cue = cues[cueIndex];
  if (timeMs <= cue.endMs) return cueIndex;

  const nextCue = cues[cueIndex + 1];
  if (nextCue && nextCue.startMs - timeMs <= UPCOMING_CUE_WINDOW_MS) {
    return cueIndex;
  }

  return timeMs - cue.endMs <= FINISHED_CUE_WINDOW_MS ? cueIndex : -1;
}

function CaptionCue(props: {
  cue: YouTubeCaptionCue;
  lane: "upper" | "lower";
  upcoming: boolean;
  timeMs: number;
}) {
  return (
    <div
      className={`youtubeCaptionCue youtubeCaptionCue-${props.lane} ${
        props.upcoming ? "youtubeCaptionCue-upcoming" : ""
      }`}
    >
      {props.cue.lines.map((line, lineIndex) => (
        <div className="youtubeCaptionLine" key={lineIndex}>
          {line.segments.map((segment, segmentIndex) => (
            <span className="youtubeCaptionSegment" key={segmentIndex}>
              <span className="youtubeCaptionText">{segment.text}</span>
              <span
                aria-hidden="true"
                className="youtubeCaptionText youtubeCaptionTextHighlighted"
                style={{ width: `${segmentProgress(segment, props.timeMs)}%` }}
              >
                {segment.text}
              </span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function YouTubeCaptionRenderer(props: {
  json3Src: string;
  kuroshiro: KuroshiroSingleton;
  languageCode: string | null;
  onError: (error: unknown) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  vttSrc: string;
}) {
  const [cues, setCues] = useState<YouTubeCaptionCue[]>([]);
  const [timeMs, setTimeMs] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    setCues([]);

    const applyLanguageTiming = async (parsedCues: YouTubeCaptionCue[]) => {
      if (!isJapaneseCaptionCode(props.languageCode)) {
        return parsedCues;
      }

      try {
        await props.kuroshiro.analyzerInitPromise;
        return await applyJapaneseReadingTiming(
          parsedCues,
          props.kuroshiro.analyzer,
        );
      } catch (error) {
        console.warn(
          "Unable to apply Japanese reading timing; using caption timing as-is",
          error,
        );
        return parsedCues;
      }
    };

    const loadCaptions = async () => {
      try {
        const json3Response = await fetch(props.json3Src, {
          signal: abortController.signal,
        });
        if (!json3Response.ok) {
          throw new Error(
            `JSON3 caption request failed with HTTP ${json3Response.status}`,
          );
        }

        const parsedCues = parseYouTubeJson3(await json3Response.text());
        if (parsedCues.length === 0) {
          throw new Error("The JSON3 file did not contain any usable cues.");
        }
        console.info(`Using JSON3 YouTube captions from ${props.json3Src}`);
        setCues(await applyLanguageTiming(parsedCues));
        return;
      } catch (json3Error) {
        if (abortController.signal.aborted) return;
        console.warn(
          "Unable to use JSON3 captions; falling back to VTT",
          json3Error,
        );
      }

      try {
        const response = await fetch(props.vttSrc, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(
            `VTT caption request failed with HTTP ${response.status}`,
          );
        }

        const parsedCues = parseWebVtt(await response.text());
        if (parsedCues.length === 0) {
          throw new Error("The VTT file did not contain any usable cues.");
        }
        setCues(await applyLanguageTiming(parsedCues));
      } catch (error) {
        if (abortController.signal.aborted) return;
        props.onError(error);
      }
    };

    void loadCaptions();

    return () => abortController.abort();
  }, [props.json3Src, props.kuroshiro, props.languageCode, props.vttSrc]);

  useEffect(() => {
    let animationFrame = 0;
    let lastRenderedTime = -1;

    const updateTime = () => {
      const nextTime = (props.videoRef.current?.currentTime || 0) * 1000;
      if (Math.abs(nextTime - lastRenderedTime) >= 20) {
        lastRenderedTime = nextTime;
        setTimeMs(nextTime);
      }
      animationFrame = requestAnimationFrame(updateTime);
    };

    animationFrame = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animationFrame);
  }, [props.videoRef]);

  const cueIndex = findDisplayCue(cues, timeMs);
  if (cueIndex < 0) return null;

  return (
    <div className="youtubeCaptionDisplay" aria-live="off">
      <CaptionCue
        key={`cue-${cueIndex}`}
        cue={cues[cueIndex]}
        lane={cueIndex % 2 === 0 ? "upper" : "lower"}
        upcoming={false}
        timeMs={timeMs}
      />
      {cueIndex + 1 < cues.length ? (
        <CaptionCue
          key={`cue-${cueIndex + 1}`}
          cue={cues[cueIndex + 1]}
          lane={cueIndex % 2 === 0 ? "lower" : "upper"}
          upcoming={true}
          timeMs={timeMs}
        />
      ) : null}
    </div>
  );
}

export default YouTubeCaptionRenderer;
