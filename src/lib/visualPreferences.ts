import type { ThemeId } from "../types";

export const VISUAL_PREFERENCES_STORAGE_KEY = "mn56.visualPrefs.v1";
export const MAX_GENRE_MAPPINGS = 250;
export const MAX_GENRE_LENGTH = 80;

export const THEME_IDS = [
  "prism",
  "cyber",
  "bloom",
  "pixel",
  "rock",
  "cinematic",
  "lounge",
] as const satisfies readonly ThemeId[];

export const VISUALIZER_MODES = ["off", "spectrum", "particles", "hybrid"] as const;

export type VisualizerMode = (typeof VISUALIZER_MODES)[number];

export interface GenreThemeMapping {
  readonly genre: string;
  readonly theme: ThemeId;
}

export interface VisualPreferences {
  readonly version: 1;
  readonly intensity: number;
  readonly coverPalette: boolean;
  readonly visualizer: VisualizerMode;
  readonly genreMappings: readonly GenreThemeMapping[];
}

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = Object.freeze({
  version: 1,
  intensity: 85,
  coverPalette: true,
  visualizer: "hybrid",
  genreMappings: Object.freeze([]),
});

interface PreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

function isVisualizerMode(value: unknown): value is VisualizerMode {
  return typeof value === "string" && (VISUALIZER_MODES as readonly string[]).includes(value);
}

function cloneDefaults(): VisualPreferences {
  return {
    ...DEFAULT_VISUAL_PREFERENCES,
    genreMappings: [],
  };
}

function defaultStorage(): PreferencesStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeGenre(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function sanitizeVisualPreferences(value: unknown): VisualPreferences {
  if (!isRecord(value)) return cloneDefaults();

  const intensity = typeof value.intensity === "number" && Number.isFinite(value.intensity)
    ? Math.min(100, Math.max(0, Math.round(value.intensity)))
    : DEFAULT_VISUAL_PREFERENCES.intensity;
  const coverPalette = typeof value.coverPalette === "boolean"
    ? value.coverPalette
    : DEFAULT_VISUAL_PREFERENCES.coverPalette;
  const visualizer = isVisualizerMode(value.visualizer)
    ? value.visualizer
    : DEFAULT_VISUAL_PREFERENCES.visualizer;
  const mappings = new Map<string, ThemeId>();

  if (Array.isArray(value.genreMappings)) {
    for (const candidate of value.genreMappings) {
      if (!isRecord(candidate) || typeof candidate.genre !== "string") continue;
      const genre = normalizeGenre(candidate.genre);
      if (!genre || genre.length > MAX_GENRE_LENGTH || !isThemeId(candidate.theme)) continue;

      if (mappings.has(genre)) {
        mappings.set(genre, candidate.theme);
        continue;
      }
      if (mappings.size === MAX_GENRE_MAPPINGS) continue;
      mappings.set(genre, candidate.theme);
    }
  }

  return {
    version: 1,
    intensity,
    coverPalette,
    visualizer,
    genreMappings: Array.from(mappings, ([genre, theme]) => ({ genre, theme })),
  };
}

export function loadVisualPreferences(
  storage: PreferencesStorage | null | undefined = defaultStorage(),
): VisualPreferences {
  if (!storage) return cloneDefaults();
  try {
    const serialized = storage.getItem(VISUAL_PREFERENCES_STORAGE_KEY);
    return serialized === null
      ? cloneDefaults()
      : sanitizeVisualPreferences(JSON.parse(serialized));
  } catch {
    return cloneDefaults();
  }
}

export function saveVisualPreferences(
  preferences: unknown,
  storage: PreferencesStorage | null | undefined = defaultStorage(),
): boolean {
  if (!storage) return false;
  const safe = sanitizeVisualPreferences(preferences);
  try {
    storage.setItem(
      VISUAL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: safe.version,
        intensity: safe.intensity,
        coverPalette: safe.coverPalette,
        visualizer: safe.visualizer,
        genreMappings: safe.genreMappings.map(({ genre, theme }) => ({ genre, theme })),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
