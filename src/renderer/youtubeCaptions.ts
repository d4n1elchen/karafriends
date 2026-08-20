export interface YouTubeCaptionSegment {
  endMs: number;
  startMs: number;
  text: string;
}

export interface YouTubeCaptionLine {
  segments: YouTubeCaptionSegment[];
}

export interface YouTubeCaptionCue {
  endMs: number;
  lines: YouTubeCaptionLine[];
  startMs: number;
}

const TIMESTAMP_SOURCE = "(?:\\d{2}:)?\\d{2}:\\d{2}[.,]\\d{3}";
const INLINE_TIMESTAMP = new RegExp(`<(${TIMESTAMP_SOURCE})>`, "g");
const TIMING_LINE = new RegExp(
  `^(${TIMESTAMP_SOURCE})\\s+-->\\s+(${TIMESTAMP_SOURCE})(?:\\s+.*)?$`,
);

function parseTimestamp(value: string): number {
  const parts = value.replace(",", ".").split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length > 0 ? Number(parts.pop()) : 0;

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function decodeEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, code: string) => {
      if (code[0] !== "#") return namedEntities[code.toLowerCase()] || entity;

      const hexadecimal = code[1].toLowerCase() === "x";
      const numericValue = Number.parseInt(
        code.slice(hexadecimal ? 2 : 1),
        hexadecimal ? 16 : 10,
      );

      return Number.isFinite(numericValue)
        ? String.fromCodePoint(numericValue)
        : entity;
    },
  );
}

function cleanCaptionText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ""));
}

function appendSegment(
  lines: YouTubeCaptionLine[],
  segment: YouTubeCaptionSegment,
) {
  const textLines = segment.text.split("\n");

  textLines.forEach((text, index) => {
    if (index > 0) lines.push({ segments: [] });
    if (text.length > 0) {
      lines[lines.length - 1].segments.push({ ...segment, text });
    }
  });
}

function approximateSegments(
  text: string,
  startMs: number,
  endMs: number,
): YouTubeCaptionLine[] {
  const lines: YouTubeCaptionLine[] = [{ segments: [] }];
  const characters = Array.from(text);
  const timedCharacterCount = characters.filter(
    (character) => character !== "\n",
  ).length;
  const duration = Math.max(1, endMs - startMs);
  let characterIndex = 0;

  characters.forEach((character) => {
    if (character === "\n") {
      lines.push({ segments: [] });
      return;
    }

    const segmentStart =
      startMs + (duration * characterIndex) / timedCharacterCount;
    characterIndex += 1;
    const segmentEnd =
      startMs + (duration * characterIndex) / timedCharacterCount;
    lines[lines.length - 1].segments.push({
      endMs: segmentEnd,
      startMs: segmentStart,
      text: character,
    });
  });

  return lines.filter((line) => line.segments.length > 0);
}

function parseCueText(
  rawText: string,
  startMs: number,
  endMs: number,
): YouTubeCaptionLine[] {
  INLINE_TIMESTAMP.lastIndex = 0;
  const timestampMatches = Array.from(rawText.matchAll(INLINE_TIMESTAMP));
  const cleanText = cleanCaptionText(rawText).trim();

  if (timestampMatches.length === 0) {
    return approximateSegments(cleanText, startMs, endMs);
  }

  const lines: YouTubeCaptionLine[] = [{ segments: [] }];
  let chunkStartMs = startMs;
  let textStart = 0;

  timestampMatches.forEach((match) => {
    const boundaryMs = Math.min(
      endMs,
      Math.max(startMs, parseTimestamp(match[1])),
    );
    const text = cleanCaptionText(rawText.slice(textStart, match.index));

    if (text.length > 0) {
      appendSegment(lines, {
        endMs: Math.max(chunkStartMs, boundaryMs),
        startMs: chunkStartMs,
        text,
      });
    }

    chunkStartMs = boundaryMs;
    textStart = (match.index || 0) + match[0].length;
  });

  const remainingText = cleanCaptionText(rawText.slice(textStart));
  if (remainingText.length > 0) {
    appendSegment(lines, {
      endMs,
      startMs: chunkStartMs,
      text: remainingText,
    });
  }

  const populatedLines = lines.filter((line) => line.segments.length > 0);
  return populatedLines.length > 0
    ? populatedLines
    : approximateSegments(cleanText, startMs, endMs);
}

export function parseWebVtt(rawVtt: string): YouTubeCaptionCue[] {
  const blocks = rawVtt
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/);
  const cues: YouTubeCaptionCue[] = [];

  blocks.forEach((block) => {
    const lines = block.split("\n");
    const timingIndex = lines.findIndex((line) =>
      TIMING_LINE.test(line.trim()),
    );
    if (timingIndex < 0) return;

    const timingMatch = lines[timingIndex].trim().match(TIMING_LINE);
    if (!timingMatch) return;

    const startMs = parseTimestamp(timingMatch[1]);
    const endMs = parseTimestamp(timingMatch[2]);
    const text = lines.slice(timingIndex + 1).join("\n");
    if (endMs <= startMs || cleanCaptionText(text).trim().length === 0) return;

    cues.push({
      endMs,
      lines: parseCueText(text, startMs, endMs),
      startMs,
    });
  });

  return cues.sort((left, right) => left.startMs - right.startMs);
}
