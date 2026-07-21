import { describe, expect, it, vi } from "vitest";

import {
  AUDIO_PREFERENCES_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  EQ_FREQUENCIES,
  EQ_PRESETS,
  loadAudioPreferences,
  sanitizeAudioPreferences,
  saveAudioPreferences,
} from "./audioPreferences";

describe("audio preferences", () => {
  it("defines a complete 10-band equalizer and safe bypass defaults", () => {
    expect(EQ_FREQUENCIES).toEqual([32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]);
    expect(Object.values(EQ_PRESETS).every((preset) => preset.length === 10)).toBe(true);
    expect(DEFAULT_AUDIO_PREFERENCES).toMatchObject({
      eqEnabled: false,
      preset: "flat",
      preampDb: 0,
      stereoBlend: 0,
    });
  });

  it("clamps, rounds, and repairs untrusted settings", () => {
    const safe = sanitizeAudioPreferences({
      version: 999,
      eqEnabled: true,
      preset: "lasers",
      preampDb: 99,
      bandGains: [-99, -3.74, 0.26, 99, 1, 2, 3, 4, 5, 6],
      stereoBlend: 144.2,
    });

    expect(safe).toEqual({
      version: 1,
      eqEnabled: true,
      preset: "flat",
      preampDb: 6,
      bandGains: [-12, -3.5, 0.5, 12, 1, 2, 3, 4, 5, 6],
      stereoBlend: 100,
    });
    expect(sanitizeAudioPreferences({ bandGains: [1, 2] }).bandGains).toEqual(EQ_PRESETS.flat);
  });

  it("loads defaults for malformed or inaccessible storage", () => {
    expect(loadAudioPreferences({ getItem: vi.fn(() => "{bad"), setItem: vi.fn() }))
      .toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(loadAudioPreferences({
      getItem: vi.fn(() => { throw new DOMException("blocked", "SecurityError"); }),
      setItem: vi.fn(),
    })).toEqual(DEFAULT_AUDIO_PREFERENCES);
  });

  it("persists only the explicit audio schema", () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() };
    expect(saveAudioPreferences({
      ...DEFAULT_AUDIO_PREFERENCES,
      eqEnabled: true,
      preset: "rock",
      bandGains: EQ_PRESETS.rock,
      stereoBlend: 42,
      password: "secret",
      streamUrl: "https://music.test/rest/stream?token=secret",
    }, storage)).toBe(true);

    const [key, serialized] = storage.setItem.mock.calls[0]!;
    expect(key).toBe(AUDIO_PREFERENCES_STORAGE_KEY);
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      eqEnabled: true,
      preset: "rock",
      preampDb: 0,
      bandGains: EQ_PRESETS.rock,
      stereoBlend: 42,
    });
    expect(serialized).not.toMatch(/secret|password|streamUrl|token/);
  });
});
