import { useEffect, useRef, type CSSProperties } from "react";

import {
  createVisualizerRenderState,
  renderVisualizerFrame,
  type AudioVisualizerFrame,
} from "../lib/visualizerRenderer";
import type { ThemeId } from "../types";
import type { VisualizerMode } from "../lib/visualPreferences";

export interface AudioVisualizerProps {
  readFrame?: () => AudioVisualizerFrame | undefined;
  enabled: boolean;
  playing: boolean;
  themeId: ThemeId;
  intensity: number;
  primary: string;
  secondary: string;
  mode?: VisualizerMode;
  className?: string;
}

interface CanvasDimensions {
  width: number;
  height: number;
  pixelRatio: number;
}

const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 360;

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
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimensionsRef = useRef<CanvasDimensions>({
    width: FALLBACK_WIDTH,
    height: FALLBACK_HEIGHT,
    pixelRatio: 1,
  });
  const renderStateRef = useRef(createVisualizerRenderState());
  const latestRef = useRef({ readFrame, themeId, intensity, primary, secondary, mode });
  const canRead = typeof readFrame === "function";
  const active = enabled && mode !== "off" && playing && canRead;

  latestRef.current = { readFrame, themeId, intensity, primary, secondary, mode };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resizeCanvas(): void {
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width || canvas.clientWidth || FALLBACK_WIDTH));
      const height = Math.max(1, Math.round(bounds.height || canvas.clientHeight || FALLBACK_HEIGHT));
      const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
      const pixelWidth = Math.round(width * pixelRatio);
      const pixelHeight = Math.round(height * pixelRatio);

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      dimensionsRef.current = { width, height, pixelRatio };
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
  }, []);

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

    function paint(time: number): void {
      if (!running) return;
      const latest = latestRef.current;
      const frame = latest.readFrame?.();
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
      animationFrame = window.requestAnimationFrame(paint);
    }

    animationFrame = window.requestAnimationFrame(paint);
    return () => {
      running = false;
      window.cancelAnimationFrame(animationFrame);
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
      style={DECORATIVE_CANVAS_STYLE}
    />
  );
}

function clearCanvas(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
