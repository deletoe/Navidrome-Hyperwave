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
      Uint8Array.from([255, 128, 128, 128, 0, 0, 0, 0, 0, 0]),
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
    const bloom = renderTheme("bloom");
    const pixel = renderTheme("pixel");
    const rock = renderTheme("rock");
    const lounge = renderTheme("lounge");

    expect(bloom.calls.ellipse).toHaveBeenCalled();
    expect(pixel.context.imageSmoothingEnabled).toBe(false);
    expect(pixel.calls.fillRect.mock.calls.length).toBeGreaterThan(10);
    expect(rock.calls.lineTo.mock.calls.length).toBeGreaterThan(20);
    expect(lounge.calls.arc.mock.calls.length).toBeGreaterThanOrEqual(8);
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
});

function loudFrame() {
  return {
    frequency: Uint8Array.from({ length: 128 }, (_, index) => 255 - (index % 48)),
    waveform: Uint8Array.from({ length: 128 }, (_, index) => 128 + Math.round(Math.sin(index / 5) * 92)),
  };
}

function renderTheme(themeId: ThemeId) {
  const drawing = drawingContext();
  renderVisualizerFrame({
    context: drawing.context,
    width: 640,
    height: 360,
    time: 800,
    frame: loudFrame(),
    state: createVisualizerRenderState(11),
    themeId,
    intensity: 1,
    primary: "#ffe45d",
    secondary: "#5df4ff",
  });
  return drawing;
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
