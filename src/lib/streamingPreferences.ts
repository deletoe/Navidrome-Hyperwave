import type { Track } from "../types";

export type ConnectionRoute = "internal" | "external";
export type StreamingMode = "auto" | "original" | "limited";
export type PlaybackTarget = "browser" | "native";

export interface StreamingDecision {
  maxBitRate?: number;
  format?: "opus";
}

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

export function browserNeedsCompatibilityTranscode(
  track: Pick<Track, "bitDepth" | "bitRate" | "contentType" | "suffix">,
): boolean {
  const suffix = track.suffix?.trim().toLowerCase();
  const contentType = track.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const isMp4Audio = suffix === "m4a" || suffix === "mp4" || contentType === "audio/mp4";
  if (!isMp4Audio) return false;

  // OpenSubsonic does not expose the codec name. Navidrome does expose the
  // lossless bit depth, while very high MP4 audio bitrates are another reliable
  // ALAC signal. Ordinary AAC-in-M4A remains on the original stream.
  return track.bitRate !== undefined && (
    track.bitRate > 576
    || (
      track.bitRate > 320
      && track.bitDepth !== undefined
      && track.bitDepth > 0
    )
  );
}

export function streamingDecisionForTrack(
  track: Pick<Track, "bitDepth" | "bitRate" | "contentType" | "suffix">,
  route: ConnectionRoute,
  preferences: StreamingPreferences,
  target: PlaybackTarget,
  forceCompatibilityTranscode = false,
): StreamingDecision {
  let maxBitRate = maxBitRateForTrack(track, route, preferences);
  if (
    target === "browser"
    && (forceCompatibilityTranscode || browserNeedsCompatibilityTranscode(track))
  ) {
    maxBitRate ??= preferences.mode === "limited"
      ? preferences.maxBitRate
      : DEFAULT_STREAMING_PREFERENCES.maxBitRate;
  }
  return maxBitRate === undefined
    ? {}
    : { maxBitRate, format: "opus" };
}
