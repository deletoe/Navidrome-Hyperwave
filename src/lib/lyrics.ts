import type { StructuredLyrics } from "../types";

export function rankLyrics(entries: readonly StructuredLyrics[]): StructuredLyrics[] {
  return [...entries].sort((left, right) => {
    if (left.synced !== right.synced) return left.synced ? -1 : 1;
    return right.line.length - left.line.length;
  });
}

export function lyricTimestampMs(start: number | undefined, offset = 0): number | undefined {
  if (start === undefined || !Number.isFinite(start)) return undefined;
  return Math.max(0, start + offset);
}

export function getActiveLyricLineIndex(
  lyrics: StructuredLyrics | undefined,
  progressSeconds: number,
): number {
  if (!lyrics?.synced || !Number.isFinite(progressSeconds)) return -1;
  const position = Math.max(0, progressSeconds * 1000);
  const offset = lyrics.offset ?? 0;
  let active = -1;
  lyrics.line.forEach((line, index) => {
    const timestamp = lyricTimestampMs(line.start, offset);
    if (timestamp !== undefined && timestamp <= position) active = index;
  });
  return active;
}

export function lyricLanguageLabel(lyrics: StructuredLyrics, index: number): string {
  const language = lyrics.lang || "Lyrics";
  const timing = lyrics.synced ? "synced" : "plain";
  return `${language} · ${timing}${index > 0 ? ` ${index + 1}` : ""}`;
}
