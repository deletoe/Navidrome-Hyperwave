import { useCallback, useEffect, useMemo, useState } from "react";

import {
  loadVisualPreferences,
  normalizeGenre,
  saveVisualPreferences,
  sanitizeVisualPreferences,
  type VisualPreferences,
  type VisualizerMode,
} from "../lib/visualPreferences";
import type { ThemeId } from "../types";

export interface VisualPreferencesController {
  preferences: VisualPreferences;
  genreMap: ReadonlyMap<string, ThemeId>;
  setIntensity(value: number): void;
  setCoverPalette(enabled: boolean): void;
  setVisualizer(mode: VisualizerMode): void;
  upsertGenreMapping(genre: string, theme: ThemeId): void;
  removeGenreMapping(genre: string): void;
  resetGenreMappings(): void;
}

export function useVisualPreferences(): VisualPreferencesController {
  const [preferences, setPreferences] = useState(loadVisualPreferences);

  useEffect(() => {
    saveVisualPreferences(preferences);
  }, [preferences]);

  const update = useCallback((next: Partial<VisualPreferences>) => {
    setPreferences((current) => sanitizeVisualPreferences({ ...current, ...next }));
  }, []);

  const genreMap = useMemo(
    () => new Map(preferences.genreMappings.map(({ genre, theme }) => [genre, theme])),
    [preferences.genreMappings],
  );

  const setIntensity = useCallback((value: number) => update({ intensity: value }), [update]);
  const setCoverPalette = useCallback(
    (enabled: boolean) => update({ coverPalette: enabled }),
    [update],
  );
  const setVisualizer = useCallback(
    (mode: VisualizerMode) => update({ visualizer: mode }),
    [update],
  );
  const upsertGenreMapping = useCallback((genre: string, theme: ThemeId) => {
    setPreferences((current) => {
      const normalized = normalizeGenre(genre);
      if (!normalized) return current;
      const mappings = current.genreMappings.filter((mapping) => mapping.genre !== normalized);
      return sanitizeVisualPreferences({
        ...current,
        genreMappings: [...mappings, { genre: normalized, theme }],
      });
    });
  }, []);
  const removeGenreMapping = useCallback((genre: string) => {
    const normalized = normalizeGenre(genre);
    setPreferences((current) => ({
      ...current,
      genreMappings: current.genreMappings.filter((mapping) => mapping.genre !== normalized),
    }));
  }, []);
  const resetGenreMappings = useCallback(() => {
    setPreferences((current) => ({ ...current, genreMappings: [] }));
  }, []);

  return {
    preferences,
    genreMap,
    setIntensity,
    setCoverPalette,
    setVisualizer,
    upsertGenreMapping,
    removeGenreMapping,
    resetGenreMappings,
  };
}
