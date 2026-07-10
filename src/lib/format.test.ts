import { describe, expect, it } from "vitest";

import { formatCount, formatDuration, normalizeServerUrl } from "./format";

describe("format helpers", () => {
  it("normalizes server URLs without losing a reverse-proxy path", () => {
    expect(normalizeServerUrl(" music.example/navidrome/ ")).toBe("http://music.example/navidrome");
    expect(normalizeServerUrl("https://music.example/base///")).toBe("https://music.example/base");
  });

  it("rejects non-http protocols", () => {
    expect(() => normalizeServerUrl("file:///tmp/music")).toThrow(/http/i);
  });

  it("formats durations and counts for player copy", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1_250)).toBe("1.2k");
  });
});
