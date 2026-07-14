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
  spawnCarry?: number;
  lastEnergy?: number;
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
const MAX_PARTICLES = 80;
const MAX_WAVEFORM_POINTS = 96;

const PARTICLE_LIMITS = {
  prism: 64,
  cyber: 72,
  bloom: 52,
  pixel: 48,
  rock: MAX_PARTICLES,
  cinematic: 40,
  lounge: 36,
} as const satisfies Record<ThemeId, number>;

export function createVisualizerRenderState(seed = 0x51f15e): VisualizerRenderState {
  return {
    particles: [],
    seed: seed >>> 0,
    lastTime: 0,
    spawnCarry: 0,
    lastEnergy: 0,
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

  // An analyser exposes linearly spaced FFT bins. These conservative boundaries
  // leave the bottom band focused on low-end impact rather than folding several
  // kilohertz into a misleading "bass" value.
  const bassEnd = Math.max(1, Math.floor(frequency.length * 0.025));
  const midEnd = Math.max(bassEnd + 1, Math.floor(frequency.length * 0.2));
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
    state.lastTime = 0;
    state.spawnCarry = 0;
    state.lastEnergy = 0;
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
  context.shadowBlur = 0;

  if (showSpectrum) switch (themeId) {
    case "cyber":
      drawCyber(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
      break;
    case "bloom":
      drawBloom(context, safeWidth, safeHeight, frame.frequency, bands, intensity, primary, secondary, time);
      break;
    case "pixel":
      drawPixel(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
      break;
    case "rock":
      drawRock(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
      break;
    case "cinematic":
      drawCinematic(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
      break;
    case "lounge":
      drawLounge(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
      break;
    case "prism":
    default:
      drawPrism(
        context,
        safeWidth,
        safeHeight,
        frame.frequency,
        frame.waveform,
        bands,
        intensity,
        primary,
        secondary,
        time,
      );
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
  // Squaring the normalized position approximates a perceptual/log frequency
  // layout: scarce low FFT bins occupy useful screen space, while high bins are
  // still represented without allocating or resampling the source array.
  const normalized = index / Math.max(count - 1, 1);
  const sourceIndex = Math.min(
    values.length - 1,
    Math.floor(normalized * normalized * (values.length - 1)),
  );
  return (values[sourceIndex] ?? 0) / 255;
}

function sampleWaveform(values: Uint8Array, index: number, count: number): number {
  if (values.length === 0) return 0;
  const sourceIndex = Math.min(
    values.length - 1,
    Math.floor((index / Math.max(count - 1, 1)) * (values.length - 1)),
  );
  return ((values[sourceIndex] ?? 128) - 128) / 128;
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
  const cap = Math.min(
    PARTICLE_LIMITS[themeId],
    Math.round(12 + intensity * (PARTICLE_LIMITS[themeId] - 12) * 0.5),
  );
  const energyRise = Math.max(0, bands.energy - (state.lastEnergy ?? 0));
  state.lastEnergy = bands.energy;
  const spawnRate =
    intensity *
    (4 + bands.energy * 24 + bands.bass * 18 + bands.treble * 8 + energyRise * 180);
  state.spawnCarry = Math.min(8, (state.spawnCarry ?? 0) + spawnRate * delta);
  const impulse = Math.min(6, Math.floor(state.spawnCarry));
  state.spawnCarry -= impulse;

  for (let index = 0; index < impulse && state.particles.length < cap; index += 1) {
    state.particles.push(createParticle(state, themeId, intensity));
  }

  for (const particle of state.particles) {
    applyParticleDrift(particle, themeId, delta);
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta * (0.28 + Math.abs(particle.vx) * 1.45);
    particle.spin += delta * (themeId === "rock" ? 5.2 : 1.7);
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

function createParticle(
  state: VisualizerRenderState,
  themeId: ThemeId,
  intensity: number,
): VisualizerParticle {
  const randomA = nextRandom(state);
  const randomB = nextRandom(state);
  const randomC = nextRandom(state);
  const angle = randomA * TAU;
  const speed = (0.035 + randomB * 0.12) * (0.65 + intensity * 0.6);
  const common = {
    size: 1.2 + randomC * (2.6 + intensity * 2.2),
    life: 0.58 + nextRandom(state) * 0.42,
    spin: (nextRandom(state) - 0.5) * 4,
  };

  switch (themeId) {
    case "cyber":
      return {
        ...common,
        x: Math.round(nextRandom(state) * 14) / 14,
        y: 0.96,
        vx: (nextRandom(state) - 0.5) * speed * 0.18,
        vy: -speed * (0.8 + nextRandom(state) * 0.9),
      };
    case "bloom": {
      const radius = 0.04 + nextRandom(state) * 0.12;
      return {
        ...common,
        x: 0.5 + Math.cos(angle) * radius,
        y: 0.56 + Math.sin(angle) * radius,
        vx: Math.cos(angle + Math.PI * 0.42) * speed * 0.72,
        vy: Math.sin(angle + Math.PI * 0.42) * speed * 0.72,
      };
    }
    case "pixel":
      return {
        ...common,
        x: Math.round(nextRandom(state) * 20) / 20,
        y: 0.92,
        vx: Math.round((nextRandom(state) - 0.5) * 4) * 0.018,
        vy: -(0.055 + Math.round(nextRandom(state) * 3) * 0.018) * (0.7 + intensity * 0.35),
      };
    case "rock":
      return {
        ...common,
        x: 0.08 + nextRandom(state) * 0.84,
        y: 0.94,
        vx: (nextRandom(state) - 0.5) * speed * 1.8,
        vy: -speed * (1.25 + nextRandom(state) * 1.4),
      };
    case "cinematic":
      return {
        ...common,
        x: 0.16 + nextRandom(state) * 0.68,
        y: 0.12 + nextRandom(state) * 0.28,
        vx: (nextRandom(state) - 0.5) * speed * 0.16,
        vy: speed * (0.06 + nextRandom(state) * 0.2),
      };
    case "lounge":
      return {
        ...common,
        x: 0.24 + nextRandom(state) * 0.54,
        y: 0.78 + nextRandom(state) * 0.12,
        vx: (nextRandom(state) - 0.5) * speed * 0.22,
        vy: -speed * (0.1 + nextRandom(state) * 0.28),
      };
    case "prism":
    default:
      return {
        ...common,
        x: 0.5 + (nextRandom(state) - 0.5) * 0.08,
        y: 0.52 + (nextRandom(state) - 0.5) * 0.08,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      };
  }
}

function applyParticleDrift(
  particle: VisualizerParticle,
  themeId: ThemeId,
  delta: number,
): void {
  if (themeId === "bloom") {
    const offsetX = particle.x - 0.5;
    const offsetY = particle.y - 0.56;
    particle.vx -= offsetY * delta * 0.6;
    particle.vy += offsetX * delta * 0.6;
  } else if (themeId === "lounge") {
    particle.vx += Math.sin(particle.spin * 1.7) * delta * 0.004;
  } else if (themeId === "cinematic") {
    particle.vx += Math.sin(particle.spin) * delta * 0.002;
  }
}

function drawPrism(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const rays = 36;
  const shellPoints = 18;
  const scale = Math.min(width, height);
  const radius = scale * (0.1 + bands.bass * 0.09);
  context.save();
  context.translate(width * 0.5, height * 0.52);
  context.rotate(time * 0.00005);
  context.globalCompositeOperation = "lighter";

  // Three counter-rotating waveform shells turn the spectrum into a kaleidoscope,
  // while keeping the number of path segments independent from analyser size.
  for (let shell = 0; shell < 3; shell += 1) {
    context.save();
    context.rotate((shell % 2 === 0 ? 1 : -1) * time * (0.000018 + shell * 0.000009));
    context.beginPath();
    for (let index = 0; index < shellPoints; index += 1) {
      const angle = (index / shellPoints) * TAU;
      const frequencyValue = sampleFrequency(frequency, index + shell * 3, shellPoints);
      const waveValue = Math.abs(sampleWaveform(waveform, index, shellPoints));
      const shellRadius =
        radius +
        shell * scale * 0.055 +
        (frequencyValue * 0.7 + waveValue * 0.3) * scale * 0.045 * intensity;
      const x = Math.cos(angle) * shellRadius;
      const y = Math.sin(angle) * shellRadius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.strokeStyle = shell % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.2 + bands.energy * (0.32 + shell * 0.08);
    context.lineWidth = 0.8 + shell * 0.55 + bands.treble * 1.4;
    context.stroke();
    context.restore();
  }

  context.shadowColor = primary;
  context.shadowBlur = 6 + bands.energy * 16 * intensity;
  for (let index = 0; index < rays; index += 1) {
    const value = sampleFrequency(frequency, index, rays);
    const angle = (index / rays) * TAU;
    const inner = radius * (0.72 + (index % 3) * 0.12);
    const length = (8 + value * scale * 0.24) * intensity;
    context.beginPath();
    context.strokeStyle = index % 3 === 0 ? secondary : primary;
    context.globalAlpha = 0.12 + value * 0.72;
    context.lineWidth = 0.7 + value * 2.8;
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle) * (inner + length), Math.sin(angle) * (inner + length));
    context.stroke();
  }
  context.restore();
}

function drawCyber(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const columns = 26;
  const horizon = height * 0.36;
  const columnWidth = width / columns;
  context.globalCompositeOperation = "lighter";
  context.lineWidth = 1;
  context.globalAlpha = 0.08 + bands.energy * 0.18;
  context.strokeStyle = primary;

  // Perspective grid and stepped meters deliberately resemble a live control
  // console, not a conventional bottom-aligned equalizer.
  for (let row = 0; row < 9; row += 1) {
    const progress = row / 8;
    const y = horizon + progress * progress * (height - horizon);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let line = -6; line <= 6; line += 1) {
    context.beginPath();
    context.moveTo(width * 0.5 + line * width * 0.018, horizon);
    context.lineTo(width * 0.5 + line * width * 0.095, height);
    context.stroke();
  }

  context.shadowColor = primary;
  context.shadowBlur = 4 + bands.treble * 12;
  for (let index = 0; index < columns; index += 1) {
    const value = sampleFrequency(frequency, index, columns);
    const levels = Math.min(12, Math.round(value * 12 * intensity));
    const meterWidth = Math.max(2, columnWidth * 0.64);
    const segmentHeight = Math.max(2, height * 0.018);
    context.fillStyle = index % 3 === 0 ? secondary : primary;
    for (let level = 0; level < levels; level += 1) {
      const flicker = (index + level + Math.floor(time / 90)) % 7 === 0 ? 0.42 : 0;
      context.globalAlpha = 0.22 + value * 0.6 + flicker;
      context.fillRect(
        index * columnWidth + (columnWidth - meterWidth) * 0.5,
        height - (level + 1.8) * segmentHeight * 1.55,
        meterWidth,
        segmentHeight,
      );
    }
  }

  const scopePoints = Math.min(MAX_WAVEFORM_POINTS, 72);
  context.beginPath();
  context.strokeStyle = secondary;
  context.globalAlpha = 0.28 + bands.mid * 0.54;
  context.lineWidth = 1.1 + bands.treble * 1.6;
  for (let index = 0; index < scopePoints; index += 1) {
    const x = (index / (scopePoints - 1)) * width;
    const y = horizon + sampleWaveform(waveform, index, scopePoints) * height * 0.085 * intensity;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  context.fillStyle = secondary;
  context.globalAlpha = 0.18 + bands.treble * 0.5;
  context.fillRect(0, (time * 0.11) % height, width, Math.max(1, intensity * 1.8));
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
  const petals = 18;
  const centerX = width * 0.5;
  const centerY = height * 0.56;
  const scale = Math.min(width, height);
  const orbit = scale * (0.075 + bands.bass * 0.12);
  context.globalCompositeOperation = "lighter";

  // Two petal orbits rotate in opposite directions. The inner bloom follows
  // mids while the outer petals stretch on transient energy.
  for (let ring = 0; ring < 2; ring += 1) {
    const ringPetals = ring === 0 ? petals : 10;
    const direction = ring === 0 ? 1 : -1;
    for (let index = 0; index < ringPetals; index += 1) {
      const value = sampleFrequency(frequency, index + ring * 5, ringPetals);
      const angle = (index / ringPetals) * TAU + direction * time * (0.000055 + ring * 0.000025);
      const ringOrbit = orbit + ring * scale * 0.078;
      const length = (12 + value * scale * (ring === 0 ? 0.17 : 0.11)) * intensity;
      context.save();
      context.translate(
        centerX + Math.cos(angle) * ringOrbit,
        centerY + Math.sin(angle) * ringOrbit,
      );
      context.rotate(angle + Math.sin(time * 0.0007 + index) * 0.1);
      context.beginPath();
      context.fillStyle = (index + ring) % 2 === 0 ? primary : secondary;
      context.globalAlpha = 0.07 + value * (ring === 0 ? 0.42 : 0.28);
      context.ellipse(
        length * 0.48,
        0,
        Math.max(2, length * 0.5),
        3.5 + value * (ring === 0 ? 13 : 8),
        0,
        0,
        TAU,
      );
      context.fill();
      context.restore();
    }
  }

  context.shadowColor = primary;
  context.shadowBlur = 8 + bands.energy * 18;
  for (let ripple = 0; ripple < 4; ripple += 1) {
    const phase = (time * 0.00018 + ripple / 4) % 1;
    context.beginPath();
    context.strokeStyle = ripple % 2 === 0 ? primary : secondary;
    context.globalAlpha = (1 - phase) * (0.05 + bands.mid * 0.2);
    context.lineWidth = 0.7 + bands.bass * 1.7;
    context.arc(centerX, centerY, orbit * (0.35 + phase * 2.1), 0, TAU);
    context.stroke();
  }
}

function drawPixel(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  context.imageSmoothingEnabled = false;
  const columns = 20;
  const block = Math.max(3, Math.floor(Math.min(width / 90, height / 48)));
  const columnWidth = width / columns;
  for (let index = 0; index < columns; index += 1) {
    const value = sampleFrequency(frequency, index, columns);
    const levels = Math.min(12, Math.round(value * 12 * intensity));
    context.fillStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.25 + value * 0.7;
    for (let level = 0; level < levels; level += 1) {
      const x = Math.floor(index * columnWidth / block) * block;
      const y = height - (level + 2) * block;
      context.fillRect(x, y, Math.max(block, Math.floor(columnWidth / block - 1) * block), block - 1);
    }
  }

  // The oscilloscope is quantized to the same logical pixel grid so it reads
  // like a moving game HUD instead of a smoothed waveform pasted on top.
  const waveBlocks = 56;
  context.fillStyle = primary;
  context.globalAlpha = 0.42 + bands.mid * 0.4;
  for (let index = 0; index < waveBlocks; index += 1) {
    const x = Math.floor(((index / (waveBlocks - 1)) * width) / block) * block;
    const sample = sampleWaveform(waveform, index, waveBlocks);
    const y =
      Math.floor((height * 0.28 + sample * height * 0.13 * intensity) / block) * block;
    context.fillRect(x, y, block, block);
  }

  context.fillStyle = secondary;
  context.globalAlpha = 0.16 + bands.bass * 0.26;
  const pulseSize = block * Math.max(2, Math.round(2 + bands.bass * 4 * intensity));
  context.fillRect(
    Math.floor((width * 0.5 - pulseSize * 0.5) / block) * block,
    Math.floor((height * 0.5 - pulseSize * 0.5) / block) * block,
    pulseSize,
    pulseSize,
  );
  context.fillStyle = secondary;
  context.globalAlpha = 0.14 + bands.treble * 0.2;
  const cursor = Math.floor(((time * 0.025) % width) / block) * block;
  context.fillRect(cursor, height * 0.12, block, height * 0.7);
}

function drawRock(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const points = Math.min(Math.max(waveform.length, 2), MAX_WAVEFORM_POINTS);
  context.globalCompositeOperation = "lighter";

  context.shadowColor = primary;
  context.shadowBlur = 7 + bands.bass * 15;
  for (let pass = 0; pass < 3; pass += 1) {
    context.beginPath();
    context.strokeStyle = pass === 1 ? secondary : primary;
    context.lineWidth = pass === 0 ? 3 + bands.bass * 5 : pass === 1 ? 1.2 : 0.7;
    context.globalAlpha = pass === 0 ? 0.42 + bands.energy * 0.5 : pass === 1 ? 0.28 : 0.14;
    for (let index = 0; index < points; index += 1) {
      const sample = sampleWaveform(waveform, index, points);
      const value = sampleFrequency(frequency, index, points);
      const jitter =
        Math.sin(index * (1.45 + pass * 0.17) + time * 0.014) *
        bands.treble *
        (2.5 + pass * 1.8);
      const x = (index / Math.max(points - 1, 1)) * width;
      const tear = (index % 7 === 0 ? value * 7 : 0) * (pass === 2 ? -1 : 1);
      const y =
        height * (0.54 + pass * 0.055) +
        sample * height * (0.28 - pass * 0.035) * intensity +
        jitter +
        tear;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  // Slanted transient slashes evoke stage lights, torn tape, and amplifier
  // clipping; bass controls their reach while treble controls their opacity.
  for (let slash = 0; slash < 12; slash += 1) {
    const value = sampleFrequency(frequency, slash, 12);
    const x = ((slash + 0.35) / 12) * width;
    const reach = height * (0.08 + value * 0.24) * intensity;
    context.beginPath();
    context.strokeStyle = slash % 3 === 0 ? secondary : primary;
    context.globalAlpha = 0.08 + value * bands.treble * 0.48;
    context.lineWidth = 1 + value * 2.8;
    context.moveTo(x - reach * 0.22, height * 0.92);
    context.lineTo(x + reach * 0.22, height * 0.92 - reach);
    context.stroke();
  }
}

function drawCinematic(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
  bands: SpectrumBands,
  intensity: number,
  primary: string,
  secondary: string,
  time: number,
): void {
  const beams = 16;
  const centerX = width * 0.5;
  const floor = height * 0.94;
  context.globalCompositeOperation = "lighter";

  // Letterbox bands and slow symmetrical light curtains give this personality
  // a widescreen composition before any spectrum geometry is drawn.
  context.fillStyle = "#000";
  context.globalAlpha = 0.22;
  context.fillRect(0, 0, width, height * 0.075);
  context.fillRect(0, height * 0.925, width, height * 0.075);

  context.shadowColor = primary;
  context.shadowBlur = 8 + bands.energy * 18;
  for (let index = 0; index < beams; index += 1) {
    const value = sampleFrequency(frequency, index, beams);
    const spread = ((index / Math.max(beams - 1, 1)) - 0.5) * width * 0.9;
    const sway = Math.sin(time * 0.00032 + index * 0.72) * 6 * intensity;
    context.beginPath();
    context.strokeStyle = index % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.04 + value * 0.36;
    context.lineWidth = 1 + value * 4.2;
    context.moveTo(centerX + sway, height * 0.075);
    context.lineTo(centerX + spread, floor - value * height * 0.22 * intensity);
    context.stroke();
  }

  const ribbonPoints = 64;
  context.beginPath();
  context.strokeStyle = secondary;
  context.globalAlpha = 0.16 + bands.mid * 0.36;
  context.lineWidth = 1.2 + bands.energy * 1.8;
  for (let index = 0; index < ribbonPoints; index += 1) {
    const x = (index / (ribbonPoints - 1)) * width;
    const envelope = Math.sin((index / (ribbonPoints - 1)) * Math.PI);
    const sample = sampleWaveform(waveform, index, ribbonPoints);
    const y = height * 0.72 + sample * envelope * height * 0.09 * intensity;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  context.beginPath();
  context.strokeStyle = primary;
  context.globalAlpha = 0.12 + bands.bass * 0.34;
  context.lineWidth = 1.5 + bands.bass * 1.5;
  context.arc(
    centerX,
    floor,
    Math.min(width, height) * (0.16 + bands.bass * 0.13 * intensity),
    Math.PI,
    TAU,
  );
  context.stroke();
}

function drawLounge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  frequency: Uint8Array,
  waveform: Uint8Array,
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
  context.shadowColor = primary;
  context.shadowBlur = 5 + bands.energy * 11;

  // Off-centre brass grooves behave like a record under a warm spotlight.
  for (let ring = 0; ring < 9; ring += 1) {
    const value = sampleFrequency(frequency, ring, 9);
    const radius = base + ring * Math.min(width, height) * 0.036 + value * 18 * intensity;
    context.beginPath();
    context.strokeStyle = ring % 2 === 0 ? primary : secondary;
    context.globalAlpha = 0.065 + value * 0.29;
    context.lineWidth = 0.7 + value * 1.9;
    const gap = 0.17 + (ring % 3) * 0.08;
    context.arc(
      centerX,
      centerY,
      radius,
      -Math.PI * (1 - gap) + time * 0.000012 * (ring % 2 === 0 ? 1 : -1),
      Math.PI * (1 - gap) + time * 0.000012 * (ring % 2 === 0 ? 1 : -1),
    );
    context.stroke();
  }

  // A dotted low-tempo waveform crosses the open side of the record. Dots
  // make it visibly different from the rock and cinematic line scopes.
  const notes = 42;
  for (let index = 0; index < notes; index += 1) {
    const progress = index / (notes - 1);
    const sample = sampleWaveform(waveform, index, notes);
    const x = width * (0.05 + progress * 0.47);
    const y = height * 0.46 + sample * height * 0.12 * intensity;
    const noteSize = 0.8 + sampleFrequency(frequency, index, notes) * 2.6;
    context.beginPath();
    context.fillStyle = index % 5 === 0 ? secondary : primary;
    context.globalAlpha = 0.12 + bands.mid * 0.32;
    context.arc(x, y, noteSize, 0, TAU);
    context.fill();
  }

  context.beginPath();
  context.strokeStyle = secondary;
  context.globalAlpha = 0.08 + bands.mid * 0.22;
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
    if (themeId === "pixel") {
      context.fillRect(-size, -size, size * 2, size * 2);
    } else if (themeId === "cyber") {
      context.fillRect(-size * 0.35, -size * 2.2, size * 0.7, size * 4.4);
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
    } else if (themeId === "cinematic") {
      context.beginPath();
      context.moveTo(0, -size * 1.4);
      context.lineTo(size * 0.72, 0);
      context.lineTo(0, size * 1.4);
      context.lineTo(-size * 0.72, 0);
      context.closePath();
      context.fill();
    } else if (themeId === "lounge") {
      context.beginPath();
      context.lineWidth = Math.max(0.7, size * 0.35);
      context.arc(0, 0, size * 1.25, 0, TAU);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(0, 0, size, 0, TAU);
      context.fill();
    }
    context.restore();
  }
}
