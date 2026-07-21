import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AudioProcessingController } from "../hooks/useAudioPlayer";
import type { AudioPreferencesController } from "../hooks/useAudioPreferences";
import { DEFAULT_AUDIO_PREFERENCES } from "../lib/audioPreferences";
import { AudioTuningPanel } from "./AudioTuningPanel";

afterEach(cleanup);

function settings(): AudioPreferencesController {
  return {
    preferences: { ...DEFAULT_AUDIO_PREFERENCES, bandGains: [...DEFAULT_AUDIO_PREFERENCES.bandGains] },
    setEqEnabled: vi.fn(),
    setPreampDb: vi.fn(),
    setBandGain: vi.fn(),
    applyPreset: vi.fn(),
    setStereoBlend: vi.fn(),
    reset: vi.fn(),
  };
}

function processing(): AudioProcessingController {
  return { supported: true, status: "off", activate: vi.fn(async () => undefined) };
}

describe("AudioTuningPanel", () => {
  it("exposes EQ, preset, preamp, ten bands, and stereo fusion accessibly", () => {
    render(<AudioTuningPanel settings={settings()} processing={processing()} />);

    expect(screen.getByRole("heading", { name: "EQ + stereo fusion" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /EQ bypassed/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Preset/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Preamp" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "32 hertz" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "16000 hertz" })).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(12);
    expect(screen.getByRole("slider", { name: "Stereo fusion" })).toHaveAttribute(
      "aria-valuetext",
      "0 percent, original stereo",
    );
  });

  it("arms Web Audio before applying processing controls", () => {
    const audioSettings = settings();
    const audioProcessing = processing();
    render(<AudioTuningPanel settings={audioSettings} processing={audioProcessing} />);

    fireEvent.change(screen.getByRole("slider", { name: "Stereo fusion" }), {
      target: { value: "70" },
    });
    expect(audioProcessing.activate).toHaveBeenCalledOnce();
    expect(audioSettings.setStereoBlend).toHaveBeenCalledWith(70);

    fireEvent.change(screen.getByRole("combobox", { name: /Preset/i }), {
      target: { value: "rock" },
    });
    expect(audioSettings.applyPreset).toHaveBeenCalledWith("rock");
    expect(audioProcessing.activate).toHaveBeenCalledTimes(2);
  });
});
