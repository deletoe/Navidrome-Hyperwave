import { describe, expect, it, vi } from "vitest";

import type { ThemeId } from "../types";
import {
  VISUALIZER_STRATEGIES,
  clampVisualizerIntensity,
  computeSpectrumBands,
  createVisualizerRenderState,
  renderVisualizerFrame,
} from "./visualizerRenderer";

const THEME_IDS: ThemeId[] = [
  "prism",
  "cyber",
  "bloom",
  "pixel",
  "rock",
  "cinematic",
  "lounge",
];

describe("visualizerRenderer", () => {
  it("splits frequency data into normalized bass, mid, treble, and weighted energy", () => {
    const bands = computeSpectrumBands(
      Uint8Array.from([255, 128, 0, 0, 0, 0, 0, 0, 0, 0]),
    );

    expect(bands.bass).toBe(1);
    expect(bands.mid).toBeCloseTo(128 / 255, 5);
    expect(bands.treble).toBe(0);
    expect(bands.energy).toBeCloseTo(0.45 + (128 / 255) * 0.35, 5);
    expect(computeSpectrumBands(new Uint8Array())).toEqual({
      bass: 0,
      mid: 0,
      treble: 0,
      energy: 0,
    });
  });

  it("defines and executes a distinct drawing strategy for every personality", () => {
    expect(new Set(Object.values(VISUALIZER_STRATEGIES))).toHaveLength(7);
    const summaries = THEME_IDS.map((themeId) => {
      const drawing = drawingContext();
      const summary = renderVisualizerFrame({
        context: drawing.context,
        width: 800,
        height: 420,
        time: 1_000,
        frame: loudFrame(),
        state: createVisualizerRenderState(42),
        themeId,
        intensity: 1,
        primary: "#54ffe1",
        secondary: "#ff4fd8",
      });
      expect(drawing.calls.clearRect).toHaveBeenCalledOnce();
      expect(drawing.calls.restore).toHaveBeenCalled();
      expect(summary.strategy).toBe(VISUALIZER_STRATEGIES[themeId]);
      expect(summary.particleCount).toBeGreaterThan(0);
      return summary.strategy;
    });

    expect(new Set(summaries)).toHaveLength(7);
  });

  it("uses personality-specific geometry instead of one shared bar renderer", () => {
    const prism = renderTheme("prism", "spectrum");
    const cyber = renderTheme("cyber", "spectrum");
    const bloom = renderTheme("bloom", "spectrum");
    const pixel = renderTheme("pixel", "spectrum");
    const rock = renderTheme("rock", "spectrum");
    const cinematic = renderTheme("cinematic", "spectrum");
    const lounge = renderTheme("lounge", "spectrum");

    expect(prism.calls.closePath.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(cyber.calls.fillRect.mock.calls.length).toBeGreaterThan(40);
    expect(bloom.calls.ellipse.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(bloom.calls.arc).toHaveBeenCalledTimes(4);
    expect(pixel.context.imageSmoothingEnabled).toBe(false);
    expect(pixel.calls.fillRect.mock.calls.length).toBeGreaterThan(100);
    expect(rock.calls.lineTo.mock.calls.length).toBeGreaterThan(200);
    expect(cinematic.calls.fillRect).toHaveBeenCalledTimes(2);
    expect(lounge.calls.arc.mock.calls.length).toBeGreaterThanOrEqual(50);

    const signatures = [prism, cyber, bloom, pixel, rock, cinematic, lounge].map(
      ({ calls }) =>
        [
          calls.stroke.mock.calls.length,
          calls.fill.mock.calls.length,
          calls.fillRect.mock.calls.length,
          calls.ellipse.mock.calls.length,
          calls.arc.mock.calls.length,
          calls.rotate.mock.calls.length,
          calls.lineTo.mock.calls.length,
        ].join(":"),
    );
    expect(new Set(signatures)).toHaveLength(7);
  });

  it("expands low FFT bins across the display instead of crowding them at the left edge", () => {
    const drawing = drawingContext();
    renderVisualizerFrame({
      context: drawing.context,
      width: 640,
      height: 360,
      time: 800,
      frame: {
        frequency: Uint8Array.from({ length: 128 }, (_, index) => index < 16 ? 255 : 0),
        waveform: new Uint8Array(128).fill(128),
      },
      state: createVisualizerRenderState(17),
      themeId: "cyber",
      intensity: 1,
      primary: "#54ffe1",
      secondary: "#ff4fd8",
      mode: "spectrum",
    });

    expect(drawing.calls.fillRect.mock.calls.length).toBeGreaterThan(80);
  });

  it("separates spectrum, particle, hybrid, and off rendering modes", () => {
    const spectrum = renderMode("spectrum");
    expect(spectrum.summary.particleCount).toBe(0);
    expect(spectrum.drawing.calls.stroke).toHaveBeenCalled();

    const particles = renderMode("particles");
    expect(particles.summary.particleCount).toBeGreaterThan(0);
    expect(particles.drawing.calls.stroke).not.toHaveBeenCalled();
    expect(particles.drawing.calls.fillRect).toHaveBeenCalledTimes(
      particles.summary.particleCount,
    );

    const hybrid = renderMode("hybrid");
    expect(hybrid.summary.particleCount).toBeGreaterThan(0);
    expect(hybrid.drawing.calls.stroke).toHaveBeenCalled();

    const off = renderMode("off");
    expect(off.summary.particleCount).toBe(0);
    expect(off.drawing.calls.stroke).not.toHaveBeenCalled();
    expect(off.drawing.calls.fillRect).not.toHaveBeenCalled();
  });

  it("clamps intensity and keeps the particle system bounded", () => {
    expect(clampVisualizerIntensity(Number.NaN)).toBe(1);
    expect(clampVisualizerIntensity(-4)).toBe(0);
    expect(clampVisualizerIntensity(8)).toBe(2);

    const drawing = drawingContext();
    const state = createVisualizerRenderState(7);
    for (let frame = 0; frame < 180; frame += 1) {
      renderVisualizerFrame({
        context: drawing.context,
        width: 640,
        height: 360,
        time: frame * 16.7,
        frame: loudFrame(),
        state,
        themeId: "cyber",
        intensity: 2,
        primary: "#fff",
        secondary: "#0ff",
      });
    }

    expect(state.particles.length).toBeLessThanOrEqual(80);
  });

  it("keeps particle emission stable across 60 Hz and 120 Hz render loops", () => {
    const at60Hz = simulateParticles(60);
    const at120Hz = simulateParticles(120);

    expect(at60Hz).toBeGreaterThan(0);
    expect(Math.abs(at60Hz - at120Hz)).toBeLessThanOrEqual(1);
  });

  it("keeps per-frame canvas work bounded for every personality", () => {
    for (const themeId of THEME_IDS) {
      const drawing = renderTheme(themeId, "hybrid", 2);
      const totalOperations = Object.values(drawing.calls).reduce(
        (total, call) => total + call.mock.calls.length,
        0,
      );

      expect(totalOperations, themeId).toBeLessThan(1_000);
      expect(drawing.calls.fillRect.mock.calls.length, themeId).toBeLessThan(400);
      expect(drawing.calls.lineTo.mock.calls.length, themeId).toBeLessThan(400);
    }
  });
});

function loudFrame() {
  return {
    frequency: Uint8Array.from({ length: 128 }, (_, index) => 255 - (index % 48)),
    waveform: Uint8Array.from({ length: 128 }, (_, index) => 128 + Math.round(Math.sin(index / 5) * 92)),
  };
}

function renderTheme(
  themeId: ThemeId,
  mode: "spectrum" | "hybrid" = "hybrid",
  intensity = 1,
) {
  const drawing = drawingContext();
  renderVisualizerFrame({
    context: drawing.context,
    width: 640,
    height: 360,
    time: 800,
    frame: loudFrame(),
    state: createVisualizerRenderState(11),
    themeId,
    intensity,
    primary: "#ffe45d",
    secondary: "#5df4ff",
    mode,
  });
  return drawing;
}

function simulateParticles(refreshRate: number): number {
  const drawing = drawingContext();
  const state = createVisualizerRenderState(23);
  const duration = 500;
  const frameCount = Math.round((duration / 1_000) * refreshRate);
  const frame = {
    frequency: new Uint8Array(128).fill(80),
    waveform: new Uint8Array(128).fill(128),
  };

  for (let index = 0; index < frameCount; index += 1) {
    renderVisualizerFrame({
      context: drawing.context,
      width: 640,
      height: 360,
      time: 1_000 + index * (1_000 / refreshRate),
      frame,
      state,
      themeId: "lounge",
      intensity: 0.8,
      primary: "#d9ae63",
      secondary: "#78b6a8",
      mode: "particles",
    });
  }
  return state.particles.length;
}

function renderMode(mode: "off" | "spectrum" | "particles" | "hybrid") {
  const drawing = drawingContext();
  const summary = renderVisualizerFrame({
    context: drawing.context,
    width: 640,
    height: 360,
    time: 800,
    frame: loudFrame(),
    state: createVisualizerRenderState(19),
    themeId: "cyber",
    intensity: 1,
    primary: "#54ffe1",
    secondary: "#ff4fd8",
    mode,
  });
  return { drawing, summary };
}

function drawingContext() {
  const calls = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    ellipse: vi.fn(),
    arc: vi.fn(),
    setTransform: vi.fn(),
  };
  const context = {
    ...calls,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
  return { context, calls };
}
