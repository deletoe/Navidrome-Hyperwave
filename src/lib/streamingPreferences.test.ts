import { describe, expect, it } from "vitest";

import {
  browserNeedsCompatibilityTranscode,
  DEFAULT_STREAMING_PREFERENCES,
  maxBitRateForTrack,
  normalizeStreamingPreferences,
  streamingDecisionForTrack,
} from "./streamingPreferences";

describe("streaming preferences", () => {
  it("keeps original quality on the internal route in automatic mode", () => {
    expect(maxBitRateForTrack(
      { bitRate: 1411 },
      "internal",
      DEFAULT_STREAMING_PREFERENCES,
    )).toBeUndefined();
  });

  it("limits only high or unknown bitrate tracks on the external route in automatic mode", () => {
    expect(maxBitRateForTrack(
      { bitRate: 320 },
      "external",
      DEFAULT_STREAMING_PREFERENCES,
    )).toBe(256);
    expect(maxBitRateForTrack(
      { bitRate: 192 },
      "external",
      DEFAULT_STREAMING_PREFERENCES,
    )).toBeUndefined();
    expect(maxBitRateForTrack(
      {},
      "external",
      DEFAULT_STREAMING_PREFERENCES,
    )).toBe(256);
  });

  it("supports explicit original and limited policies", () => {
    expect(maxBitRateForTrack(
      { bitRate: 1411 },
      "external",
      { mode: "original", maxBitRate: 128 },
    )).toBeUndefined();
    expect(maxBitRateForTrack(
      { bitRate: 96 },
      "internal",
      { mode: "limited", maxBitRate: 128 },
    )).toBe(128);
  });

  it("uses Opus 256 for ALAC-like M4A in the browser while native playback stays original", () => {
    const alac = {
      suffix: "m4a",
      contentType: "audio/mp4",
      bitDepth: 24,
      bitRate: 9216,
    };

    expect(browserNeedsCompatibilityTranscode(alac)).toBe(true);
    expect(streamingDecisionForTrack(
      alac,
      "internal",
      { mode: "original", maxBitRate: 128 },
      "browser",
    )).toEqual({ maxBitRate: 256, format: "opus" });
    expect(streamingDecisionForTrack(
      alac,
      "internal",
      { mode: "original", maxBitRate: 128 },
      "native",
    )).toEqual({});
  });

  it("does not transcode ordinary AAC-in-M4A for browser compatibility", () => {
    const aac = {
      suffix: "m4a",
      contentType: "audio/mp4",
      bitRate: 256,
    };
    expect(browserNeedsCompatibilityTranscode(aac)).toBe(false);
    expect(streamingDecisionForTrack(
      aac,
      "internal",
      DEFAULT_STREAMING_PREFERENCES,
      "browser",
    )).toEqual({});
  });

  it("uses explicit Opus for network bitrate limits", () => {
    expect(streamingDecisionForTrack(
      { bitRate: 320, suffix: "mp3", contentType: "audio/mpeg" },
      "external",
      DEFAULT_STREAMING_PREFERENCES,
      "browser",
    )).toEqual({ maxBitRate: 256, format: "opus" });
  });

  it("repairs invalid stored values", () => {
    expect(normalizeStreamingPreferences({ mode: "limited", maxBitRate: 999 }))
      .toEqual({ mode: "limited", maxBitRate: 256 });
    expect(normalizeStreamingPreferences(undefined)).toEqual(DEFAULT_STREAMING_PREFERENCES);
  });
});
