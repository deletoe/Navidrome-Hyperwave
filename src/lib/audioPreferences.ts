export const AUDIO_PREFERENCES_STORAGE_KEY = "mn56.audioPrefs.v1";

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [5, 4, 3, 1.5, 0, -1, -1.5, -1, 0, 1],
  vocal: [-2, -1.5, -1, 0, 1.5, 3, 4, 3, 1, -1],
  rock: [4, 3, 1, -1, -2, 0, 2, 3.5, 4, 3],
  electronic: [4.5, 3.5, 1, 0, -1, 1, 2, 2.5, 4, 4.5],
  classical: [2.5, 2, 1, 0, -1, -1, 0, 1.5, 2.5, 3],
  jazz: [3, 2, 1, 1.5, -1, -1, 0, 1.5, 2.5, 3],
  night: [-4, -3, -1.5, 0, 1.5, 2, 1, -1, -3, -5],
} as const satisfies Record<string, readonly number[]>;

export type EqPresetId = keyof typeof EQ_PRESETS | "custom";

export interface AudioPreferences {
  readonly version: 1;
  readonly eqEnabled: boolean;
  readonly preset: EqPresetId;
  readonly preampDb: number;
  readonly bandGains: readonly number[];
  readonly stereoBlend: number;
}

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = Object.freeze({
  version: 1,
  eqEnabled: false,
  preset: "flat",
  preampDb: 0,
  bandGains: Object.freeze([...EQ_PRESETS.flat]),
  stereoBlend: 0,
});

interface PreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, roundHalf(value)));
}

function isPreset(value: unknown): value is EqPresetId {
  return value === "custom" || (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(EQ_PRESETS, value)
  );
}

function cloneDefaults(): AudioPreferences {
  return { ...DEFAULT_AUDIO_PREFERENCES, bandGains: [...DEFAULT_AUDIO_PREFERENCES.bandGains] };
}

function defaultStorage(): PreferencesStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function sanitizeAudioPreferences(value: unknown): AudioPreferences {
  if (!isRecord(value)) return cloneDefaults();
  const gains = Array.isArray(value.bandGains) && value.bandGains.length === EQ_FREQUENCIES.length
    ? value.bandGains.map((gain, index) => clamp(gain, -12, 12, DEFAULT_AUDIO_PREFERENCES.bandGains[index]!))
    : [...DEFAULT_AUDIO_PREFERENCES.bandGains];
  return {
    version: 1,
    eqEnabled: typeof value.eqEnabled === "boolean" ? value.eqEnabled : false,
    preset: isPreset(value.preset) ? value.preset : "flat",
    preampDb: clamp(value.preampDb, -12, 6, 0),
    bandGains: gains,
    stereoBlend: Math.round(clamp(value.stereoBlend, 0, 100, 0)),
  };
}

export function loadAudioPreferences(
  storage: PreferencesStorage | null | undefined = defaultStorage(),
): AudioPreferences {
  if (!storage) return cloneDefaults();
  try {
    const serialized = storage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    return serialized === null ? cloneDefaults() : sanitizeAudioPreferences(JSON.parse(serialized));
  } catch {
    return cloneDefaults();
  }
}

export function saveAudioPreferences(
  preferences: unknown,
  storage: PreferencesStorage | null | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  const safe = sanitizeAudioPreferences(preferences);
  try {
    storage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}
