export interface YouTubeCaptionSegment {
  endMs: number;
  startMs: number;
  text: string;
  timingGroup?: number;
}

export interface YouTubeCaptionLine {
  segments: YouTubeCaptionSegment[];
}

export interface YouTubeCaptionCue {
  endMs: number;
  hasPreciseTiming?: boolean;
  lines: YouTubeCaptionLine[];
  startMs: number;
}

interface JapaneseAnalyzerToken {
  pronunciation?: string;
  reading?: string;
  surface_form: string;
}

export interface JapaneseCaptionAnalyzer {
  parse(text: string): Promise<JapaneseAnalyzerToken[]>;
}

interface Json3Segment {
  tOffsetMs?: unknown;
  utf8?: unknown;
}

interface Json3Event {
  dDurationMs?: unknown;
  segs?: unknown;
  tStartMs?: unknown;
}

const TIMESTAMP_SOURCE = "(?:\\d{2}:)?\\d{2}:\\d{2}[.,]\\d{3}";
const INLINE_TIMESTAMP = new RegExp(`<(${TIMESTAMP_SOURCE})>`, "g");
const TIMING_LINE = new RegExp(
  `^(${TIMESTAMP_SOURCE})\\s+-->\\s+(${TIMESTAMP_SOURCE})(?:\\s+.*)?$`,
);
const ZERO_DURATION_PUNCTUATION = new Set(
  Array.from(
    "。、，．！？：；…‥・「」『』【】（）［］｛｝〈〉《》〔〕〜～“”‘’«»‹›—–♪",
  ),
);
const SMALL_KANA = new Set(
  Array.from("ぁぃぅぇぉゃゅょゎゕゖァィゥェォャュョヮヵヶ"),
);

export function isJapaneseCaptionCode(languageCode: string | null): boolean {
  return /^ja(?:-|$)/.test(languageCode?.toLowerCase() || "");
}

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

function appendLines(
  destination: YouTubeCaptionLine[],
  source: YouTubeCaptionLine[],
) {
  source.forEach((line, index) => {
    if (index === 0) {
      destination[destination.length - 1].segments.push(...line.segments);
    } else {
      destination.push(line);
    }
  });
}

function characterTimingWeight(character: string): number {
  if (/\s/.test(character)) return 0;

  const codePoint = character.codePointAt(0) || 0;
  const isAsciiPunctuation =
    (codePoint >= 0x21 && codePoint <= 0x2f) ||
    (codePoint >= 0x3a && codePoint <= 0x40) ||
    (codePoint >= 0x5b && codePoint <= 0x60) ||
    (codePoint >= 0x7b && codePoint <= 0x7e);
  const isFullWidthPunctuation =
    (codePoint >= 0xff01 && codePoint <= 0xff0f) ||
    (codePoint >= 0xff1a && codePoint <= 0xff20) ||
    (codePoint >= 0xff3b && codePoint <= 0xff40) ||
    (codePoint >= 0xff5b && codePoint <= 0xff65);
  const isCombiningMark =
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x3099 && codePoint <= 0x309a) ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f);

  return isAsciiPunctuation ||
    isFullWidthPunctuation ||
    isCombiningMark ||
    ZERO_DURATION_PUNCTUATION.has(character)
    ? 0
    : 1;
}

function approximateSegments(
  text: string,
  startMs: number,
  endMs: number,
  suppliedTimingWeights?: number[],
  timingGroup?: number,
): YouTubeCaptionLine[] {
  const lines: YouTubeCaptionLine[] = [{ segments: [] }];
  const characters = Array.from(text);
  const timingWeights =
    suppliedTimingWeights?.length === characters.length
      ? suppliedTimingWeights
      : characters.map(characterTimingWeight);
  const totalTimingWeight = timingWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  const timingDivisor = Math.max(1, totalTimingWeight);
  const duration = Math.max(1, endMs - startMs);
  let elapsedTimingWeight = 0;

  characters.forEach((character, index) => {
    if (character === "\n") {
      lines.push({ segments: [] });
      return;
    }

    const timingWeight = timingWeights[index];
    const segmentStart =
      startMs + (duration * elapsedTimingWeight) / timingDivisor;
    elapsedTimingWeight += timingWeight;
    const segmentEnd =
      startMs + (duration * elapsedTimingWeight) / timingDivisor;
    const segment: YouTubeCaptionSegment = {
      endMs: segmentEnd,
      startMs: segmentStart,
      text: character,
    };
    if (timingGroup !== undefined) segment.timingGroup = timingGroup;
    lines[lines.length - 1].segments.push(segment);
  });

  // A punctuation-only cue still needs a finite display interval.
  if (totalTimingWeight === 0) {
    lines.forEach((line) =>
      line.segments.forEach((segment) => {
        segment.startMs = startMs;
        segment.endMs = endMs;
      }),
    );
  }

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
      hasPreciseTiming: INLINE_TIMESTAMP.test(text),
      lines: parseCueText(text, startMs, endMs),
      startMs,
    });
    INLINE_TIMESTAMP.lastIndex = 0;
  });

  return cues.sort((left, right) => left.startMs - right.startMs);
}

export function parseYouTubeJson3(rawJson: string): YouTubeCaptionCue[] {
  const data = JSON.parse(rawJson) as { events?: unknown };
  if (!Array.isArray(data.events)) return [];

  const events = data.events
    .map((rawEvent) => rawEvent as Json3Event)
    .filter(
      (event) =>
        typeof event.tStartMs === "number" &&
        Number.isFinite(event.tStartMs) &&
        Array.isArray(event.segs),
    );

  return events.flatMap<YouTubeCaptionCue>((event, eventIndex) => {
    const startMs = event.tStartMs as number;
    const nextStartMs = events[eventIndex + 1]?.tStartMs;
    const declaredDuration =
      typeof event.dDurationMs === "number" &&
      Number.isFinite(event.dDurationMs) &&
      event.dDurationMs > 0
        ? event.dDurationMs
        : null;
    const endMs = declaredDuration
      ? startMs + declaredDuration
      : typeof nextStartMs === "number" && nextStartMs > startMs
        ? nextStartMs
        : startMs + 2_000;
    const segments = (event.segs as Json3Segment[]).filter(
      (segment) => typeof segment.utf8 === "string",
    );
    const text = segments.map((segment) => segment.utf8 as string).join("");
    if (text.trim().length === 0) return [];

    const hasSegmentOffsets = segments.some(
      (segment) =>
        typeof segment.tOffsetMs === "number" &&
        Number.isFinite(segment.tOffsetMs),
    );
    if (!hasSegmentOffsets) {
      return [
        {
          endMs,
          hasPreciseTiming: false,
          lines: approximateSegments(text.trim(), startMs, endMs),
          startMs,
        },
      ];
    }

    const lines: YouTubeCaptionLine[] = [{ segments: [] }];
    segments.forEach((segment, segmentIndex) => {
      const offset =
        typeof segment.tOffsetMs === "number" &&
        Number.isFinite(segment.tOffsetMs)
          ? segment.tOffsetMs
          : 0;
      const nextSegment = segments[segmentIndex + 1];
      const nextOffset =
        typeof nextSegment?.tOffsetMs === "number" &&
        Number.isFinite(nextSegment.tOffsetMs)
          ? nextSegment.tOffsetMs
          : endMs - startMs;
      const segmentStartMs = Math.min(
        endMs,
        Math.max(startMs, startMs + offset),
      );
      const segmentEndMs = Math.min(
        endMs,
        Math.max(segmentStartMs, startMs + nextOffset),
      );

      appendLines(
        lines,
        approximateSegments(
          segment.utf8 as string,
          segmentStartMs,
          segmentEndMs,
          undefined,
          segmentIndex,
        ),
      );
    });

    return [
      {
        endMs,
        hasPreciseTiming: true,
        lines: lines.filter((line) => line.segments.length > 0),
        startMs,
      },
    ];
  });
}

function moraCount(reading: string): number {
  return Array.from(reading).reduce((count, character) => {
    if (SMALL_KANA.has(character)) return count;
    return count + characterTimingWeight(character);
  }, 0);
}

function tokenTimingWeights(token: JapaneseAnalyzerToken): number[] {
  const characters = Array.from(token.surface_form);
  const genericWeights = characters.map(characterTimingWeight);
  const timedCharacterCount = genericWeights.filter(
    (weight) => weight > 0,
  ).length;
  const reading = token.pronunciation || token.reading;
  const readingMorae = reading ? moraCount(reading) : 0;

  if (readingMorae <= 0 || timedCharacterCount === 0) return genericWeights;

  const weightPerCharacter = readingMorae / timedCharacterCount;
  return genericWeights.map((weight) => (weight > 0 ? weightPerCharacter : 0));
}

function timingWeightsForTokens(
  text: string,
  tokens: JapaneseAnalyzerToken[],
): number[] {
  const weights: number[] = [];
  let cursor = 0;

  tokens.forEach((token) => {
    if (!token.surface_form) return;
    const tokenIndex = text.indexOf(token.surface_form, cursor);
    if (tokenIndex < 0) return;

    weights.push(
      ...Array.from(text.slice(cursor, tokenIndex)).map(characterTimingWeight),
      ...tokenTimingWeights(token),
    );
    cursor = tokenIndex + token.surface_form.length;
  });

  weights.push(...Array.from(text.slice(cursor)).map(characterTimingWeight));
  return weights;
}

function retimeSegments(
  segments: YouTubeCaptionSegment[],
  timingWeights: number[],
): YouTubeCaptionSegment[] {
  const startMs = Math.min(...segments.map((segment) => segment.startMs));
  const endMs = Math.max(...segments.map((segment) => segment.endMs));
  const totalWeight = timingWeights.reduce(
    (total, weight) => total + weight,
    0,
  );
  if (totalWeight <= 0) {
    return segments.map((segment) => ({ ...segment, startMs, endMs }));
  }

  const duration = endMs - startMs;
  let elapsedWeight = 0;
  let characterIndex = 0;
  return segments.map((segment) => {
    const segmentCharacterCount = Array.from(segment.text).length;
    const segmentWeight = timingWeights
      .slice(characterIndex, characterIndex + segmentCharacterCount)
      .reduce((total, weight) => total + weight, 0);
    characterIndex += segmentCharacterCount;
    const segmentStartMs = startMs + (duration * elapsedWeight) / totalWeight;
    elapsedWeight += segmentWeight;

    return {
      ...segment,
      endMs: startMs + (duration * elapsedWeight) / totalWeight,
      startMs: segmentStartMs,
    };
  });
}

export async function applyJapaneseReadingTiming(
  cues: YouTubeCaptionCue[],
  analyzer: JapaneseCaptionAnalyzer,
): Promise<YouTubeCaptionCue[]> {
  const retimedCues: YouTubeCaptionCue[] = [];

  for (const cue of cues) {
    const groupedSegments = new Map<number, YouTubeCaptionSegment[]>();
    cue.lines.forEach((line) =>
      line.segments.forEach((segment) => {
        if (segment.timingGroup === undefined) return;
        const group = groupedSegments.get(segment.timingGroup) || [];
        group.push(segment);
        groupedSegments.set(segment.timingGroup, group);
      }),
    );

    if (groupedSegments.size > 0) {
      const replacements = new Map<
        YouTubeCaptionSegment,
        YouTubeCaptionSegment
      >();
      for (const segments of groupedSegments.values()) {
        const groupText = segments.map((segment) => segment.text).join("");
        const groupTokens = await analyzer.parse(groupText);
        const weights = timingWeightsForTokens(groupText, groupTokens);
        retimeSegments(segments, weights).forEach((segment, index) =>
          replacements.set(segments[index], segment),
        );
      }

      retimedCues.push({
        ...cue,
        lines: cue.lines.map((line) => ({
          segments: line.segments.map(
            (segment) => replacements.get(segment) || segment,
          ),
        })),
      });
      continue;
    }

    if (cue.hasPreciseTiming) {
      retimedCues.push(cue);
      continue;
    }

    const text = cue.lines
      .map((line) => line.segments.map((segment) => segment.text).join(""))
      .join("\n");
    const tokens = await analyzer.parse(text);
    retimedCues.push({
      ...cue,
      lines: approximateSegments(
        text,
        cue.startMs,
        cue.endMs,
        timingWeightsForTokens(text, tokens),
      ),
    });
  }

  return retimedCues;
}
