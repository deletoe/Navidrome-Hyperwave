import { describe, expect, it } from "vitest";

import type { StructuredLyrics } from "../types";
import {
  getActiveLyricLineIndex,
  lyricLanguageLabel,
  lyricTimestampMs,
  rankLyrics,
} from "./lyrics";

const synced: StructuredLyrics = {
  lang: "eng",
  synced: true,
  offset: -100,
  line: [
    { start: 1000, value: "One" },
    { start: 2500, value: "Two" },
    { start: 5000, value: "Three" },
  ],
};

describe("lyrics timeline", () => {
  it("applies offsets and finds the latest elapsed synchronized line", () => {
    expect(getActiveLyricLineIndex(synced, 0.89)).toBe(-1);
    expect(getActiveLyricLineIndex(synced, 0.9)).toBe(0);
    expect(getActiveLyricLineIndex(synced, 2.4)).toBe(1);
    expect(getActiveLyricLineIndex(synced, 99)).toBe(2);
    expect(lyricTimestampMs(50, -100)).toBe(0);
  });

  it("prefers synchronized lyrics and labels alternatives", () => {
    const plain: StructuredLyrics = {
      lang: "jpn",
      synced: false,
      line: [{ value: "A" }, { value: "B" }, { value: "C" }, { value: "D" }],
    };
    expect(rankLyrics([plain, synced])).toEqual([synced, plain]);
    expect(lyricLanguageLabel(synced, 0)).toBe("eng · synced");
    expect(lyricLanguageLabel(plain, 1)).toBe("jpn · plain 2");
  });
});
