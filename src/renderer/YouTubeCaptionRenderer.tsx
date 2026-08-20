import React, { useEffect, useState } from "react";

import "./YouTubeCaptionRenderer.css";
import {
  parseWebVtt,
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
    return cueIndex + 1;
  }

  return timeMs - cue.endMs <= FINISHED_CUE_WINDOW_MS ? cueIndex : -1;
}

function CaptionCue(props: {
  cue: YouTubeCaptionCue;
  role: "previous" | "current" | "next";
  timeMs: number;
}) {
  return (
    <div className={`youtubeCaptionCue youtubeCaptionCue-${props.role}`}>
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
  onError: (error: unknown) => void;
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const [cues, setCues] = useState<YouTubeCaptionCue[]>([]);
  const [timeMs, setTimeMs] = useState(0);

  useEffect(() => {
    const abortController = new AbortController();
    setCues([]);

    void fetch(props.src, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Caption request failed with HTTP ${response.status}`,
          );
        }
        return response.text();
      })
      .then((vtt) => {
        const parsedCues = parseWebVtt(vtt);
        if (parsedCues.length === 0) {
          throw new Error("The caption file did not contain any usable cues.");
        }
        setCues(parsedCues);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        props.onError(error);
      });

    return () => abortController.abort();
  }, [props.src]);

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
      {cueIndex > 0 ? (
        <CaptionCue
          key={`cue-${cueIndex - 1}`}
          cue={cues[cueIndex - 1]}
          role="previous"
          timeMs={timeMs}
        />
      ) : null}
      <CaptionCue
        key={`cue-${cueIndex}`}
        cue={cues[cueIndex]}
        role="current"
        timeMs={timeMs}
      />
      {cueIndex + 1 < cues.length ? (
        <CaptionCue
          key={`cue-${cueIndex + 1}`}
          cue={cues[cueIndex + 1]}
          role="next"
          timeMs={timeMs}
        />
      ) : null}
    </div>
  );
}

export default YouTubeCaptionRenderer;
