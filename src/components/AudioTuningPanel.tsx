import { useId } from "react";

import type { AudioProcessingController } from "../hooks/useAudioPlayer";
import type { AudioPreferencesController } from "../hooks/useAudioPreferences";
import {
  EQ_FREQUENCIES,
  EQ_PRESETS,
  type EqPresetId,
} from "../lib/audioPreferences";
import { AppIcon } from "./AppIcon";

export interface AudioTuningPanelProps {
  settings: AudioPreferencesController;
  processing: AudioProcessingController;
}

const PRESET_LABELS: Record<EqPresetId, string> = {
  flat: "Flat",
  bass: "Bass lift",
  vocal: "Vocal focus",
  rock: "Rock",
  electronic: "Electronic",
  classical: "Classical",
  jazz: "Jazz",
  night: "Night listening",
  custom: "Custom",
};

function formatFrequency(frequency: number): string {
  return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}

function formatDb(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(value % 1 === 0 ? 0 : 1)} dB`;
}

export function AudioTuningPanel({ settings, processing }: AudioTuningPanelProps) {
  const headingId = useId();
  const fusionId = useId();
  const { preferences } = settings;
  const processingLabel = !processing.supported || processing.status === "unavailable"
    ? "Web Audio unavailable"
    : processing.status === "ready"
      ? "DSP live"
      : processing.status === "waiting"
        ? "DSP armed"
        : "DSP bypassed";

  function activate(): void {
    void processing.activate().catch(() => undefined);
  }

  return (
    <section className="audio-tuning" aria-labelledby={headingId}>
      <header>
        <div>
          <p className="eyebrow">Headphone lab</p>
          <h3 id={headingId}>EQ + stereo fusion</h3>
        </div>
        <span className="audio-tuning__status" data-status={processing.status} role="status">
          {processingLabel}
        </span>
      </header>

      <div className="audio-tuning__toolbar">
        <label className="audio-tuning__switch">
          <input
            type="checkbox"
            checked={preferences.eqEnabled}
            disabled={!processing.supported}
            onChange={(event) => {
              if (event.currentTarget.checked) activate();
              settings.setEqEnabled(event.currentTarget.checked);
            }}
          />
          <span aria-hidden="true" />
          EQ {preferences.eqEnabled ? "on" : "bypassed"}
        </label>
        <label>
          <span>Preset</span>
          <select
            value={preferences.preset}
            disabled={!processing.supported}
            onChange={(event) => {
              const preset = event.currentTarget.value as EqPresetId;
              if (preset === "custom") return;
              activate();
              settings.applyPreset(preset);
            }}
          >
            {Object.keys(EQ_PRESETS).map((preset) => (
              <option key={preset} value={preset}>{PRESET_LABELS[preset as EqPresetId]}</option>
            ))}
            {preferences.preset === "custom" ? <option value="custom">Custom</option> : null}
          </select>
        </label>
        <button className="button-with-icon" type="button" onClick={settings.reset}>
          <AppIcon name="retry" />
          Reset audio
        </button>
      </div>

      <div className="audio-tuning__equalizer" aria-label="10 band equalizer">
        <label className="audio-tuning__band audio-tuning__band--preamp">
          <output>{formatDb(preferences.preampDb)}</output>
          <input
            aria-label="Preamp"
            type="range"
            min="-12"
            max="6"
            step="0.5"
            value={preferences.preampDb}
            disabled={!processing.supported}
            aria-valuetext={formatDb(preferences.preampDb)}
            onChange={(event) => {
              activate();
              settings.setPreampDb(event.currentTarget.valueAsNumber);
            }}
          />
          <span>Pre</span>
        </label>
        {EQ_FREQUENCIES.map((frequency, index) => {
          const gain = preferences.bandGains[index] ?? 0;
          return (
            <label className="audio-tuning__band" key={frequency}>
              <output>{formatDb(gain)}</output>
              <input
                aria-label={`${frequency} hertz`}
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={gain}
                disabled={!processing.supported}
                aria-valuetext={formatDb(gain)}
                onChange={(event) => {
                  activate();
                  settings.setBandGain(index, event.currentTarget.valueAsNumber);
                }}
              />
              <span>{formatFrequency(frequency)}</span>
            </label>
          );
        })}
      </div>

      <div className="audio-tuning__fusion">
        <div>
          <label htmlFor={fusionId}>Stereo fusion</label>
          <output htmlFor={fusionId}>{preferences.stereoBlend}%</output>
        </div>
        <input
          id={fusionId}
          aria-label="Stereo fusion"
          type="range"
          min="0"
          max="100"
          step="1"
          value={preferences.stereoBlend}
          disabled={!processing.supported}
          aria-valuetext={`${preferences.stereoBlend} percent, ${preferences.stereoBlend === 0 ? "original stereo" : preferences.stereoBlend === 100 ? "mono blend" : "cross-channel blend"}`}
          onChange={(event) => {
            if (event.currentTarget.valueAsNumber > 0) activate();
            settings.setStereoBlend(event.currentTarget.valueAsNumber);
          }}
        />
        <div className="audio-tuning__fusion-labels" aria-hidden="true">
          <span>Original stereo</span>
          <span>Mono blend</span>
        </div>
        <p>Cross-feeds both channels without boosting centered sounds — useful for hard-panned mixes.</p>
      </div>
      {processing.error ? <p className="audio-tuning__error">{processing.error}</p> : null}
    </section>
  );
}
