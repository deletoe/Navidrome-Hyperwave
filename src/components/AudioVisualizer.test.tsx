import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AudioVisualizer } from "./AudioVisualizer";

let animationCallbacks: Map<number, FrameRequestCallback>;
let nextAnimationId: number;
let requestAnimationFrameMock: ReturnType<typeof vi.fn>;
let cancelAnimationFrameMock: ReturnType<typeof vi.fn>;
let context: CanvasRenderingContext2D;

beforeEach(() => {
  animationCallbacks = new Map();
  nextAnimationId = 0;
  requestAnimationFrameMock = vi.fn((callback: FrameRequestCallback) => {
    nextAnimationId += 1;
    animationCallbacks.set(nextAnimationId, callback);
    return nextAnimationId;
  });
  cancelAnimationFrameMock = vi.fn((id: number) => {
    animationCallbacks.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );

  context = drawingContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 800,
    bottom: 420,
    left: 0,
    width: 800,
    height: 420,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AudioVisualizer", () => {
  it("renders one stable decorative canvas and keeps exactly one RAF chain", () => {
    const readFrame = vi.fn(() => loudFrame());
    const view = render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        themeId="prism"
        intensity={1}
        primary="#8de7ff"
        secondary="#b99cff"
      />,
    );
    const canvas = view.container.querySelector("canvas")!;

    expect(canvas).toHaveAttribute("aria-hidden", "true");
    expect(canvas).toHaveAttribute("data-active", "true");
    expect(canvas).toHaveStyle({ pointerEvents: "none" });
    expect(animationCallbacks.size).toBe(1);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    act(() => runNextAnimationFrame(16.7));
    expect(readFrame).toHaveBeenCalledOnce();
    expect(canvas).toHaveAttribute("data-frame-state", "live");
    expect(animationCallbacks.size).toBe(1);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);

    const cancellationCount = cancelAnimationFrameMock.mock.calls.length;
    view.rerender(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        themeId="rock"
        intensity={1.7}
        primary="#ff653f"
        secondary="#f4d35e"
      />,
    );

    expect(view.container.querySelector("canvas")).toBe(canvas);
    expect(canvas).toHaveAttribute("data-theme", "rock");
    expect(animationCallbacks.size).toBe(1);
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(cancellationCount);

    view.rerender(
      <AudioVisualizer
        readFrame={readFrame}
        enabled={false}
        playing
        themeId="rock"
        intensity={1.7}
        primary="#ff653f"
        secondary="#f4d35e"
      />,
    );

    expect(canvas).toHaveAttribute("data-active", "false");
    expect(canvas).toHaveAttribute("data-frame-state", "idle");
    expect(animationCallbacks.size).toBe(0);
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(cancellationCount + 1);
  });

  it("does not animate while disabled, paused, or missing a frame reader", () => {
    const readFrame = vi.fn(() => loudFrame());
    const view = render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled={false}
        playing
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    expect(animationCallbacks.size).toBe(0);

    view.rerender(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing={false}
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    expect(animationCallbacks.size).toBe(0);

    view.rerender(
      <AudioVisualizer
        enabled
        playing
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    expect(animationCallbacks.size).toBe(0);
    expect(readFrame).not.toHaveBeenCalled();
  });

  it("switches live modes without duplicating RAF and treats off as an explicit stop", () => {
    const readFrame = vi.fn(() => loudFrame());
    const view = render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        mode="spectrum"
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    const canvas = view.container.querySelector("canvas")!;
    expect(animationCallbacks.size).toBe(1);

    view.rerender(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        mode="particles"
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    expect(canvas).toHaveAttribute("data-mode", "particles");
    expect(animationCallbacks.size).toBe(1);
    expect(cancelAnimationFrameMock).not.toHaveBeenCalled();

    view.rerender(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        mode="off"
        themeId="cyber"
        intensity={1}
        primary="#54ffe1"
        secondary="#ff4fd8"
      />,
    );
    expect(canvas).toHaveAttribute("data-mode", "off");
    expect(canvas).toHaveAttribute("data-active", "false");
    expect(animationCallbacks.size).toBe(0);
    expect(cancelAnimationFrameMock).toHaveBeenCalledOnce();
  });

  it("cancels its outstanding frame when unmounted", () => {
    const view = render(
      <AudioVisualizer
        readFrame={() => loudFrame()}
        enabled
        playing
        themeId="lounge"
        intensity={1}
        primary="#d9ae63"
        secondary="#78b6a8"
      />,
    );

    expect(animationCallbacks.size).toBe(1);
    view.unmount();
    expect(animationCallbacks.size).toBe(0);
    expect(cancelAnimationFrameMock).toHaveBeenCalledOnce();
  });
});

function runNextAnimationFrame(time: number): void {
  const next = animationCallbacks.entries().next().value as
    | [number, FrameRequestCallback]
    | undefined;
  if (!next) throw new Error("No animation frame is pending");
  const [id, callback] = next;
  animationCallbacks.delete(id);
  callback(time);
}

function loudFrame() {
  return {
    frequency: Uint8Array.from({ length: 128 }, (_, index) => 220 - (index % 40)),
    waveform: Uint8Array.from({ length: 128 }, (_, index) => 128 + Math.round(Math.sin(index / 6) * 80)),
  };
}

function drawingContext(): CanvasRenderingContext2D {
  return {
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
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 1,
    strokeStyle: "#000",
    fillStyle: "#000",
    imageSmoothingEnabled: true,
  } as unknown as CanvasRenderingContext2D;
}
