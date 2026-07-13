import type { ThemeId } from "../types";
import type { VisualizerMode } from "./visualPreferences";

export interface AudioVisualizerFrame {
  frequency: Uint8Array;
  waveform: Uint8Array;
}

export interface SpectrumBands {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
}

export interface VisualizerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  spin: number;
}

export interface VisualizerRenderState {
  particles: VisualizerParticle[];
  seed: number;
  lastTime: number;
  themeId?: ThemeId;
}

export interface VisualizerRenderOptions {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  frame: AudioVisualizerFrame;
  state: VisualizerRenderState;
  themeId: ThemeId;
  intensity: number;
  primary: string;
  secondary: string;
  mode?: VisualizerMode;
}

export interface VisualizerRenderSummary {
  strategy: VisualizerStrategyName;
  bands: SpectrumBands;
  particleCount: number;
}

export const VISUALIZER_STRATEGIES = {
  prism: "radial-prism",
  cyber: "neon-console",
  bloom: "petal-orbit",
  pixel: "block-meter",
  rock: "riot-wave",
  cinematic: "light-curtain",
  lounge: "brass-rings",
} as const satisfies Record<ThemeId, string>;

export type VisualizerStrategyName = (typeof VISUALIZER_STRATEGIES)[ThemeId];

const TAU = Math.PI * 2;

export function createVisualizerRenderState(seed = 0x51f15e): VisualizerRenderState {
  return {
    particles: [],
    seed: seed >>> 0,
    lastTime: 0,
  };
}

export function clampVisualizerIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) return 1;
  return Math.min(Math.max(intensity, 0), 2);
}

export function computeSpectrumBands(frequency: Uint8Array): SpectrumBands {
  if (frequency.length === 0) {
    return { bass: 0, mid: 0, treble: 0, energy: 0 };
  }

  const bassEnd = Math.max(1, Math.floor(frequency.length * 0.12));
  const midEnd = Math.max(bassEnd + 1, Math.floor(frequency.length * 0.48));
  const bass = averageRange(frequency, 0, bassEnd);
  const mid = averageRange(frequency, bassEnd, midEnd);
  const treble = averageRange(frequency, midEnd, frequency.length);
  return {
    bass,
    mid,
    treble,
    energy: bass * 0.45 + mid * 0.35 + treble * 0.2,
  };
}

export function renderVisualizerFrame({
  context,
  width,
  height,
  time,
  frame,
  state,
  themeId,
  intensity: rawIntensity,
  primary,
  secondary,
  mode = "hybrid",
}: VisualizerRenderOptions): VisualizerRenderSummary {
  const intensity = clampVisualizerIntensity(rawIntensity);
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const bands = computeSpectrumBands(frame.frequency);

  if (state.themeId !== themeId) {
    state.particles.length = 0;
    state.themeId = themeId;
    state.lastTime = time;
  }

  const elapsed = state.lastTime > 0 ? (time - state.lastTime) / 1_000 : 1 / 60;
  const delta = Math.min(Math.max(elapsed, 1 / 240), 0.05);
  state.lastTime = time;
  const showSpectrum = mode === "spectrum" || mode === "hybrid";
  const showParticles = mode === "particles" || mode === "hybrid";
  if (showParticles) updateParticles(state, bands, intensity, delta, themeId);
  else state.particles.length = 0;

  context.save();
  context.clearRect(0, 0, safeWidth, safeHeight);
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (showSpectrum) switch (themeId) {
    case "cyber":
      drawCyber(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "bloom":
      drawBloom(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "pixel":
      drawPixel(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "rock":
      drawRock(context, safeWidth, safeHeight, frame.waveform, bands, intensity, primary, secondary, time);
      break;
    case "cinematic":
      drawCinematic(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "lounge":
      drawLounge(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "prism":
    default:
      drawPrism(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
  }

  if (showParticles) {
    drawParticles(context, safeWidth, safeHeight, state.particles, themeId, primary, secondary);
  }
  context.restore();

  return {
    strategy: VISUALIZER_STRATEGIES[themeId],
    bands,
    particleCount: state.particles.length,
  };
}

function averageRange(values: Uint8Array, start: number, end: number): number {
  const safeStart = Math.min(Math.max(start, 0), values.length);
  const safeEnd = Math.min(Math.max(end, safeStart + 1), values.length);
  let total = 0;
  for (let index = safeStart; index < safeEnd; index += 1) {
    total += values[index] ?? 0;
  }
  return total / Math.max(safeEnd - safeStart, 1) / 255;
}

function sampleFrequency(values: Uint8Array, index: number, count: number): number {
  if (values.length === 0) return 0;
  const sourceIndex = Math.min(
    values.length - 1,
    Math.floor((index / Math.max(count - 1, 1)) * (values.length - 1)),
  );
  return (values[sourceIndex] ?? 0) / 255;
}

function nextRandom(state: VisualizerRenderState): number {
  state.seed = (Math.imul(state.seed, 1_664_525) + 1_013_904_223) >>> 0;
  return state.seed / 0x1_0000_0000;
}

function updateParticles(
  state: VisualizerRenderState,
  bands: SpectrumBands,
  intensity: number,
  delta: number,
  themeId: ThemeId,
): void {
  const cap = Math.round(16 + intensity * 32);
  const impulse = Math.min(4, Math.floor((bands.bass * 2.8 + bands.treble * 1.4) * intensity));

  for (let index = 0; index < impulse && state.particles.length < cap; index += 1) {
    const angle = nextRandom(state) * TAU;
    const speed = (0.035 + nextRandom(state) * 0.12) * (0.65 + intensity * 0.6);
    const fromBottom = themeId === "rock" || themeId === "cyber";
    state.particles.push({
      x: fromBottom ? nextRandom(state) : 0.5 + (nextRandom(state) - 0.5) * 0.18,
      y: fromBottom ? 0.92 : 0.52 + (nextRandom(state) - 0.5) * 0.12,
      vx: Math.cos(angle) * speed,
      vy: fromBottom ? -Math.abs(Math.sin(angle) * speed) : Math.sin(angle) * speed,
      size: 1.2 + nextRandom(state) * (2.6 + intensity * 2.2),
      life: 0.58 + nextRandom(state) * 0.42,
      spin: (nextRandom(state) - 0.5) * 4,
    });
  }

  for (const particle of state.particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta * (0.3 + Math.abs(particle.vx) * 1.8);
    particle.spin += delta * 1.7;
  }
  state.particles = state.particles.filter(
    (particle) =>
      particle.life > 0 &&
      particle.x > -0.12 &&
      particle.x < 1.12 &&
      particle.y > -0.12 &&
      particle.y < 1.12,
  );
}

function drawPrism(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const count = 32;
  const radius = Math.min(width, height) * (0.1 + bands.bass * 0.08);
  context.save();
  context.translate(width * 0.5, height * 0.52);
  context.rotate(time * 0.000035);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < count; index += 1) {
    const value = sampleFrequency(frequency, index, count);
    const angle = (index / count) * TAU;
    const length = (12 + value * Math.min(width, height) * 0.2) * intensity;
    context.beginPath();
    context.strokeStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.16 + value * 0.64;
    context.lineWidth = 0.8 + value * 2.4;
    context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    context.lineTo(Math.cos(angle) * (radius + length), Math.sin(angle) * (radius + length));
    context.stroke();
  }
  context.restore();
}

function drawCyber(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const columns = 24;
  const gap = Math.max(2, width * 0.003);
  const columnWidth = width / columns;
  context.globalCompositeOperation = "lighter";
  context.lineWidth = 1;
  context.globalAlpha = 0.08 + bands.energy * 0.14;
  context.strokeStyle = primary;
  for (let y = height * 0.18; y < height; y += Math.max(22, height / 16)) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let index = 0; index < columns; index += 1) {
    const value = sampleFrequency(frequency, index, columns);
    const barHeight = (height * 0.1 + value * height * 0.5) * intensity;
    context.fillStyle = index % 3 === 0 ? secondary : primary;
    context.globalAlpha = 0.18 + value * 0.72;
    context.fillRect(index * columnWidth + gap, height - barHeight, Math.max(1, columnWidth - gap * 2), barHeight);
  }
  context.fillStyle = secondary;
  context.globalAlpha = 0.2 + bands.treble * 0.45;
  context.fillRect(0, (time * 0.08) % height, width, Math.max(1, intensity * 1.5));
}

function drawBloom(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const petals = 14;
  const centerX = width * 0.5;
  const centerY = height * 0.56;
  const orbit = Math.min(width, height) * (0.08 + bands.bass * 0.14);
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < petals; index += 1) {
    const value = sampleFrequency(frequency, index, petals);
    const angle = (index / petals) * TAU + time * 0.00008;
    const length = (18 + value * Math.min(width, height) * 0.22) * intensity;
    context.save();
    context.translate(centerX + Math.cos(angle) * orbit, centerY + Math.sin(angle) * orbit);
    context.rotate(angle);
    context.beginPath();
    context.fillStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.08 + value * 0.36;
    context.ellipse(length * 0.48, 0, Math.max(2, length * 0.5), 4 + value * 13, 0, 0, TAU);
    context.fill();
    context.restore();
  }
}

function drawPixel(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  context.imageSmoothingEnabled = false;
  const columns = 18;
  const block = Math.max(3, Math.floor(Math.min(width / 90, height / 48)));
  const columnWidth = width / columns;
  for (let index = 0; index < columns; index += 1) {
    const value = sampleFrequency(frequency, index, columns);
    const levels = Math.round(value * 12 * intensity);
    context.fillStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.25 + value * 0.7;
    for (let level = 0; level < levels; level += 1) {
      const x = Math.floor(index * columnWidth / block) * block;
      const y = height - (level + 2) * block;
      context.fillRect(x, y, Math.max(block, Math.floor(columnWidth / block - 1) * block), block - 1);
    }
  }
  context.fillStyle = secondary;
  context.globalAlpha = 0.14 + bands.treble * 0.2;
  const cursor = Math.floor(((time * 0.025) % width) / block) * block;
  context.fillRect(cursor, height * 0.12, block, height * 0.7);
}

function drawRock(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const points = Math.min(Math.max(waveform.length, 2), 96);
  context.globalCompositeOperation = "lighter";
  for (let pass = 0; pass < 2; pass += 1) {
    context.beginPath();
    context.strokeStyle = pass === 0 ? primary : secondary;
    context.lineWidth = pass === 0 ? 2.4 + bands.bass * 4 : 0.8;
    context.globalAlpha = pass === 0 ? 0.36 + bands.energy * 0.56 : 0.2;
    for (let index = 0; index < points; index += 1) {
      const sourceIndex = Math.floor((index / Math.max(points - 1, 1)) * Math.max(waveform.length - 1, 0));
      const sample = ((waveform[sourceIndex] ?? 128) - 128) / 128;
      const jitter = Math.sin(index * 1.7 + time * 0.012) * bands.treble * 3;
      const x = (index / Math.max(points - 1, 1)) * width;
      const y = height * 0.58 + sample * height * 0.3 * intensity + jitter + pass * 5;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawCinematic(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const beams = 18;
  const centerX = width * 0.5;
  const floor = height * 0.94;
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < beams; index += 1) {
    const value = sampleFrequency(frequency, index, beams);
    const spread = ((index / Math.max(beams - 1, 1)) - 0.5) * width * 0.9;
    const sway = Math.sin(time * 0.00035 + index) * 4 * intensity;
    context.beginPath();
    context.strokeStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.05 + value * 0.32;
    context.lineWidth = 1 + value * 3.5;
    context.moveTo(centerX + sway, height * 0.08);
    context.lineTo(centerX + spread, floor - value * height * 0.22 * intensity);
    context.stroke();
  }
  context.beginPath();
  context.strokeStyle = primary;
  context.globalAlpha = 0.12 + bands.bass * 0.3;
  context.lineWidth = 1.5;
  context.arc(centerX, floor, Math.min(width, height) * (0.16 + bands.bass * 0.12), Math.PI, TAU);
  context.stroke();
}

function drawLounge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const centerX = width * 0.68;
  const centerY = height * 0.58;
  const base = Math.min(width, height) * 0.1;
  context.globalCompositeOperation = "lighter";
  for (let ring = 0; ring < 7; ring += 1) {
    const value = sampleFrequency(frequency, ring, 7);
    const radius = base + ring * Math.min(width, height) * 0.045 + value * 18 * intensity;
    context.beginPath();
    context.strokeStyle = ring % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.08 + value * 0.3;
    context.lineWidth = 0.8 + value * 2;
    context.arc(centerX, centerY, radius, -Math.PI * 0.82, Math.PI * 0.82);
    context.stroke();
  }
  context.beginPath();
  context.strokeStyle = secondary;
  context.globalAlpha = 0.08 + bands.mid * 0.18;
  context.lineWidth = 8 + bands.bass * 16;
  context.arc(width * 0.24, height * 0.72, base * 1.4, time * 0.00008, time * 0.00008 + Math.PI * 1.35);
  context.stroke();
}

function drawParticles(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  particles: VisualizerParticle[],
  themeId: ThemeId,
  primary: string,
  secondary: string,
): void {
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index]!;
    const x = particle.x * width;
    const y = particle.y * height;
    const size = particle.size * Math.max(particle.life, 0);
    context.save();
    context.translate(x, y);
    context.rotate(particle.spin);
    context.fillStyle = index % 2 === 0 ? primary : secondary;
    context.strokeStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = Math.max(0, particle.life) * 0.62;
    if (themeId === "pixel" || themeId === "cyber") {
      context.fillRect(-size, -size, size * 2, size * 2);
    } else if (themeId === "rock") {
      context.beginPath();
      context.moveTo(-size * 2, size);
      context.lineTo(size * 2, -size);
      context.lineWidth = Math.max(1, size * 0.5);
      context.stroke();
    } else if (themeId === "prism") {
      context.beginPath();
      context.moveTo(0, -size * 1.5);
      context.lineTo(size * 1.3, size);
      context.lineTo(-size * 1.3, size);
      context.closePath();
      context.fill();
    } else if (themeId === "bloom") {
      context.beginPath();
      context.ellipse(0, 0, size * 1.8, size * 0.72, 0, 0, TAU);
      context.fill();
    } else {
      context.beginPath();
      context.arc(0, 0, size, 0, TAU);
      context.fill();
    }
    context.restore();
  }
}
