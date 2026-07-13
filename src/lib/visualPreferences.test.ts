import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_VISUAL_PREFERENCES,
  MAX_GENRE_MAPPINGS,
  THEME_IDS,
  VISUAL_PREFERENCES_STORAGE_KEY,
  loadVisualPreferences,
  normalizeGenre,
  sanitizeVisualPreferences,
  saveVisualPreferences,
} from "./visualPreferences";

describe("visual preferences", () => {
  it("defines all seven personality identifiers once", () => {
    expect(THEME_IDS).toEqual([
      "prism",
      "cyber",
      "bloom",
      "pixel",
      "rock",
      "cinematic",
      "lounge",
    ]);
  });

  it("normalizes genre keys deterministically", () => {
    expect(normalizeGenre("  ＥＬＥＣＴＲＯＮＩＣ\n  音乐  ")).toBe("electronic 音乐");
    expect(normalizeGenre("Dream\u0000\tPop")).toBe("dream pop");
  });

  it("sanitizes scalar values and never trusts a stored version", () => {
    expect(
      sanitizeVisualPreferences({
        version: 999,
        intensity: 150.6,
        coverPalette: false,
        visualizer: "particles",
      }),
    ).toEqual({
      version: 1,
      intensity: 100,
      coverPalette: false,
      visualizer: "particles",
      genreMappings: [],
    });

    expect(
      sanitizeVisualPreferences({
        intensity: Number.NaN,
        coverPalette: "false",
        visualizer: "lasers",
      }),
    ).toEqual({ ...DEFAULT_VISUAL_PREFERENCES, genreMappings: [] });
    expect(sanitizeVisualPreferences({ intensity: -4.4 }).intensity).toBe(0);
  });

  it("normalizes, validates, and deduplicates mappings with the last value winning", () => {
    const preferences = sanitizeVisualPreferences({
      genreMappings: [
        { genre: " Rock ", theme: "rock" },
        { genre: "ＲＯＣＫ", theme: "cyber" },
        { genre: "Jazz", theme: "lounge" },
        { genre: "", theme: "prism" },
        { genre: "x".repeat(81), theme: "pixel" },
        { genre: "Classical", theme: "unknown" },
        { genre: "__proto__", theme: "bloom" },
      ],
    });

    expect(preferences.genreMappings).toEqual([
      { genre: "rock", theme: "cyber" },
      { genre: "jazz", theme: "lounge" },
      { genre: "__proto__", theme: "bloom" },
    ]);
    expect(Object.getPrototypeOf(preferences.genreMappings)).toBe(Array.prototype);
  });

  it("caps unique mappings without allowing duplicates to expand the limit", () => {
    const genreMappings = Array.from({ length: MAX_GENRE_MAPPINGS + 20 }, (_, index) => ({
      genre: `Genre ${index}`,
      theme: "prism",
    }));
    genreMappings.push({ genre: "Genre 0", theme: "rock" });

    const preferences = sanitizeVisualPreferences({ genreMappings });

    expect(preferences.genreMappings).toHaveLength(MAX_GENRE_MAPPINGS);
    expect(preferences.genreMappings[0]).toEqual({ genre: "genre 0", theme: "rock" });
    expect(preferences.genreMappings.at(-1)).toEqual({ genre: "genre 249", theme: "prism" });
  });

  it("loads defaults for missing, malformed, and inaccessible storage", () => {
    const missing = { getItem: vi.fn(() => null), setItem: vi.fn() };
    const malformed = { getItem: vi.fn(() => "{bad json"), setItem: vi.fn() };
    const inaccessible = {
      getItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      setItem: vi.fn(),
    };

    expect(loadVisualPreferences(missing)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(loadVisualPreferences(malformed)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(loadVisualPreferences(inaccessible)).toEqual(DEFAULT_VISUAL_PREFERENCES);
    expect(loadVisualPreferences(null)).toEqual(DEFAULT_VISUAL_PREFERENCES);
  });

  it("loads and sanitizes a stored preference payload", () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        version: 1,
        intensity: 72.2,
        coverPalette: false,
        visualizer: "spectrum",
        genreMappings: [{ genre: " Jazz ", theme: "lounge" }],
        password: "must-not-escape",
      })),
      setItem: vi.fn(),
    };

    expect(loadVisualPreferences(storage)).toEqual({
      version: 1,
      intensity: 72,
      coverPalette: false,
      visualizer: "spectrum",
      genreMappings: [{ genre: "jazz", theme: "lounge" }],
    });
    expect(storage.getItem).toHaveBeenCalledWith(VISUAL_PREFERENCES_STORAGE_KEY);
  });

  it("persists only the explicit safe schema", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    const saved = saveVisualPreferences(
      {
        version: 1,
        intensity: 63,
        coverPalette: true,
        visualizer: "hybrid",
        genreMappings: [
          {
            genre: " Electronic ",
            theme: "cyber",
            coverUrl: "https://music.test/rest/getCoverArt?apiKey=secret",
          },
        ],
        password: "secret",
        apiKey: "secret",
        coverUrl: "https://music.test/rest/getCoverArt?u=user&t=token&s=salt",
        palette: { primary: "#ffffff" },
      },
      storage,
    );

    expect(saved).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    const [key, serialized] = storage.setItem.mock.calls[0]!;
    expect(key).toBe(VISUAL_PREFERENCES_STORAGE_KEY);
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      intensity: 63,
      coverPalette: true,
      visualizer: "hybrid",
      genreMappings: [{ genre: "electronic", theme: "cyber" }],
    });
    expect(serialized).not.toMatch(/secret|apiKey|getCoverArt|password|palette|coverUrl/);
  });

  it("tolerates storage write failures", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("full", "QuotaExceededError");
      }),
    };

    expect(saveVisualPreferences(DEFAULT_VISUAL_PREFERENCES, storage)).toBe(false);
  });
});
