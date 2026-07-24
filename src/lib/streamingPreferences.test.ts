import { describe, expect, it } from "vitest";

import {
  DEFAULT_STREAMING_PREFERENCES,
  maxBitRateForTrack,
  normalizeStreamingPreferences,
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

  it("repairs invalid stored values", () => {
    expect(normalizeStreamingPreferences({ mode: "limited", maxBitRate: 999 }))
      .toEqual({ mode: "limited", maxBitRate: 256 });
    expect(normalizeStreamingPreferences(undefined)).toEqual(DEFAULT_STREAMING_PREFERENCES);
  });
});
