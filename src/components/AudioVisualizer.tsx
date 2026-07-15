import { useEffect, useRef, type CSSProperties } from "react";

import {
  createVisualizerRenderState,
  renderVisualizerFrame,
  type AudioVisualizerFrame,
} from "../lib/visualizerRenderer";
import type { ThemeId } from "../types";
import type { VisualizerMode } from "../lib/visualPreferences";

export interface AudioVisualizerProps {
  readFrame?: (frameTime?: number) => AudioVisualizerFrame | undefined;
  enabled: boolean;
  playing: boolean;
  themeId: ThemeId;
  intensity: number;
  primary: string;
  secondary: string;
  mode?: VisualizerMode;
  className?: string;
  maxFps?: number;
  maxPixelCount?: number;
  maxDevicePixelRatio?: number;
}

interface CanvasDimensions {
  width: number;
  height: number;
}

const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 360;
const DEFAULT_MAX_FPS = 60;
const DEFAULT_MAX_PIXEL_COUNT = 2_000_000;
const DEFAULT_MAX_DEVICE_PIXEL_RATIO = 2;
const FRAME_DEADLINE_TOLERANCE_MS = 0.5;

const DECORATIVE_CANVAS_STYLE: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

export function AudioVisualizer({
  readFrame,
  enabled,
  playing,
  themeId,
  intensity,
  primary,
  secondary,
  mode = "hybrid",
  className = "",
  maxFps = DEFAULT_MAX_FPS,
  maxPixelCount = DEFAULT_MAX_PIXEL_COUNT,
  maxDevicePixelRatio = DEFAULT_MAX_DEVICE_PIXEL_RATIO,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensionsRef = useRef<CanvasDimensions>({
    width: FALLBACK_WIDTH,
    height: FALLBACK_HEIGHT,
  });
  const renderStateRef = useRef(createVisualizerRenderState());
  const latestRef = useRef({ readFrame, themeId, intensity, primary, secondary, mode, maxFps });
  const canRead = typeof readFrame === "function";
  const active = enabled && mode !== "off" && playing && canRead;

  latestRef.current = { readFrame, themeId, intensity, primary, secondary, mode, maxFps };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resizeCanvas(): void {
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width || canvas.clientWidth || FALLBACK_WIDTH));
      const height = Math.max(1, Math.round(bounds.height || canvas.clientHeight || FALLBACK_HEIGHT));
      const backing = calculateBackingDimensions({
        width,
        height,
        devicePixelRatio: window.devicePixelRatio || 1,
        maxDevicePixelRatio,
        maxPixelCount,
      });

      if (canvas.width !== backing.pixelWidth || canvas.height !== backing.pixelHeight) {
        canvas.width = backing.pixelWidth;
        canvas.height = backing.pixelHeight;
      }
      canvas.dataset.pixelRatio = Math.sqrt(backing.scaleX * backing.scaleY).toFixed(3);
      canvas.dataset.pixelCount = String(backing.pixelWidth * backing.pixelHeight);
      context.setTransform(backing.scaleX, 0, 0, backing.scaleY, 0, 0);
      dimensionsRef.current = { width, height };
    }

    resizeCanvas();
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(resizeCanvas);
    observer?.observe(canvas);
    window.addEventListener("resize", resizeCanvas);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [maxDevicePixelRatio, maxPixelCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const drawingCanvas = canvas;
    const drawingContext = context;

    if (!active) {
      clearCanvas(canvas, context);
      canvas.dataset.frameState = "idle";
      renderStateRef.current.particles.length = 0;
      renderStateRef.current.lastTime = 0;
      return;
    }

    let running = true;
    let animationFrame = 0;
    let nextPaintTime: number | undefined;

    function scheduleFrame(): void {
      if (!running || animationFrame !== 0 || document.visibilityState === "hidden") return;
      animationFrame = window.requestAnimationFrame(paint);
    }

    function paint(time: number): void {
      animationFrame = 0;
      if (!running || document.visibilityState === "hidden") return;
      const latest = latestRef.current;
      const frameInterval = 1_000 / normalizePositive(latest.maxFps, DEFAULT_MAX_FPS);
      if (nextPaintTime === undefined || time + FRAME_DEADLINE_TOLERANCE_MS >= nextPaintTime) {
        if (nextPaintTime === undefined) {
          nextPaintTime = time + frameInterval;
        } else {
          const deadlineLag = time - nextPaintTime;
          // Keep the normal cadence phase, but abandon it after a noticeable
          // main-thread stall so missed frames never trigger a catch-up burst.
          nextPaintTime = deadlineLag > frameInterval / 2 + FRAME_DEADLINE_TOLERANCE_MS
            ? time + frameInterval
            : nextPaintTime + frameInterval;
        }
        const frame = latest.readFrame?.(time);
        if (frame) {
          if (drawingCanvas.dataset.frameState !== "live") {
            drawingCanvas.dataset.frameState = "live";
          }
          const dimensions = dimensionsRef.current;
          renderVisualizerFrame({
            context: drawingContext,
            width: dimensions.width,
            height: dimensions.height,
            time,
            frame,
            state: renderStateRef.current,
            themeId: latest.themeId,
            intensity: latest.intensity,
            primary: latest.primary,
            secondary: latest.secondary,
            mode: latest.mode,
          });
        } else if (drawingCanvas.dataset.frameState !== "waiting") {
          clearCanvas(drawingCanvas, drawingContext);
          drawingCanvas.dataset.frameState = "waiting";
        }
      }
      scheduleFrame();
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "hidden") {
        if (animationFrame !== 0) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        }
        return;
      }

      nextPaintTime = undefined;
      renderStateRef.current.lastTime = 0;
      scheduleFrame();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    scheduleFrame();
    return () => {
      running = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className={`audio-visualizer${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      data-active={active}
      data-mode={mode}
      data-theme={themeId}
      data-max-fps={maxFps}
      data-max-pixel-count={maxPixelCount}
      data-max-device-pixel-ratio={maxDevicePixelRatio}
      style={DECORATIVE_CANVAS_STYLE}
    />
  );
}

interface BackingDimensionsOptions {
  width: number;
  height: number;
  devicePixelRatio: number;
  maxDevicePixelRatio: number;
  maxPixelCount: number;
}

interface BackingDimensions {
  pixelWidth: number;
  pixelHeight: number;
  scaleX: number;
  scaleY: number;
}

function calculateBackingDimensions({
  width,
  height,
  devicePixelRatio,
  maxDevicePixelRatio,
  maxPixelCount,
}: BackingDimensionsOptions): BackingDimensions {
  const deviceLimit = Math.min(
    normalizePositive(devicePixelRatio, 1),
    normalizePositive(maxDevicePixelRatio, DEFAULT_MAX_DEVICE_PIXEL_RATIO),
  );
  const pixelBudget = Math.max(
    1,
    Math.floor(normalizePositive(maxPixelCount, DEFAULT_MAX_PIXEL_COUNT)),
  );
  const cssPixelCount = Math.max(1, width * height);
  const pixelBudgetRatio = Math.sqrt(pixelBudget / cssPixelCount);
  const targetRatio = Math.min(deviceLimit, pixelBudgetRatio);
  let pixelWidth = Math.max(1, Math.floor(width * targetRatio));
  let pixelHeight = Math.max(1, Math.floor(height * targetRatio));

  // The pixel budget is a hard ceiling even on very large external displays.
  // The final clamp also covers extreme aspect ratios where rounding either
  // dimension up to one backing pixel could otherwise exceed the ceiling.
  if (pixelWidth * pixelHeight > pixelBudget) {
    pixelWidth = Math.min(pixelWidth, pixelBudget);
    pixelHeight = Math.min(pixelHeight, Math.max(1, Math.floor(pixelBudget / pixelWidth)));
  }

  return {
    pixelWidth,
    pixelHeight,
    scaleX: pixelWidth / width,
    scaleY: pixelHeight / height,
  };
}

function normalizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clearCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
