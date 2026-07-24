import type { Track } from "../types";

export type ConnectionRoute = "internal" | "external";
export type StreamingMode = "auto" | "original" | "limited";

export interface StreamingPreferences {
  mode: StreamingMode;
  maxBitRate: number;
}

export const DEFAULT_STREAMING_PREFERENCES: StreamingPreferences = {
  mode: "auto",
  maxBitRate: 256,
};

export const STREAMING_BIT_RATE_OPTIONS = [64, 96, 128, 192, 256, 320] as const;

export function normalizeStreamingPreferences(
  value: Partial<StreamingPreferences> | undefined,
): StreamingPreferences {
  const mode = value?.mode;
  const maxBitRate = Number(value?.maxBitRate);
  return {
    mode: mode === "original" || mode === "limited" ? mode : "auto",
    maxBitRate: STREAMING_BIT_RATE_OPTIONS.includes(
      maxBitRate as (typeof STREAMING_BIT_RATE_OPTIONS)[number],
    )
      ? maxBitRate
      : DEFAULT_STREAMING_PREFERENCES.maxBitRate,
  };
}

export function maxBitRateForTrack(
  track: Pick<Track, "bitRate">,
  route: ConnectionRoute,
  preferences: StreamingPreferences,
): number | undefined {
  if (preferences.mode === "original") return undefined;
  if (preferences.mode === "limited") return preferences.maxBitRate;
  if (route === "internal") return undefined;
  return track.bitRate === undefined || track.bitRate > preferences.maxBitRate
    ? preferences.maxBitRate
    : undefined;
}
