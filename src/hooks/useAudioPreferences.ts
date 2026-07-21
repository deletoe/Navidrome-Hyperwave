import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_AUDIO_PREFERENCES,
  EQ_PRESETS,
  loadAudioPreferences,
  sanitizeAudioPreferences,
  saveAudioPreferences,
  type AudioPreferences,
  type EqPresetId,
} from "../lib/audioPreferences";

export interface AudioPreferencesController {
  preferences: AudioPreferences;
  setEqEnabled(enabled: boolean): void;
  setPreampDb(value: number): void;
  setBandGain(index: number, value: number): void;
  applyPreset(preset: Exclude<EqPresetId, "custom">): void;
  setStereoBlend(value: number): void;
  reset(): void;
}

export function useAudioPreferences(): AudioPreferencesController {
  const [preferences, setPreferences] = useState(loadAudioPreferences);

  useEffect(() => {
    saveAudioPreferences(preferences);
  }, [preferences]);

  const update = useCallback((next: Partial<AudioPreferences>) => {
    setPreferences((current) => sanitizeAudioPreferences({ ...current, ...next }));
  }, []);

  const setEqEnabled = useCallback((enabled: boolean) => update({ eqEnabled: enabled }), [update]);
  const setPreampDb = useCallback((value: number) => {
    update({ preampDb: value, eqEnabled: true, preset: "custom" });
  }, [update]);
  const setBandGain = useCallback((index: number, value: number) => {
    setPreferences((current) => {
      if (!Number.isInteger(index) || index < 0 || index >= current.bandGains.length) return current;
      const bandGains = [...current.bandGains];
      bandGains[index] = value;
      return sanitizeAudioPreferences({
        ...current,
        bandGains,
        eqEnabled: true,
        preset: "custom",
      });
    });
  }, []);
  const applyPreset = useCallback((preset: Exclude<EqPresetId, "custom">) => {
    update({ preset, bandGains: [...EQ_PRESETS[preset]], eqEnabled: true });
  }, [update]);
  const setStereoBlend = useCallback((value: number) => update({ stereoBlend: value }), [update]);
  const reset = useCallback(() => setPreferences({
    ...DEFAULT_AUDIO_PREFERENCES,
    bandGains: [...DEFAULT_AUDIO_PREFERENCES.bandGains],
  }), []);

  return {
    preferences,
    setEqEnabled,
    setPreampDb,
    setBandGain,
    applyPreset,
    setStereoBlend,
    reset,
  };
}
