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

  it("limits redraw work when RAF runs at 120 Hz", () => {
    const readFrame = vi.fn(() => loudFrame());
    render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        maxFps={30}
        themeId="prism"
        intensity={1}
        primary="#8de7ff"
        secondary="#b99cff"
      />,
    );

    act(() => runNextAnimationFrame(0));
    act(() => runNextAnimationFrame(8.33));
    act(() => runNextAnimationFrame(16.67));
    act(() => runNextAnimationFrame(25));
    expect(readFrame).toHaveBeenCalledTimes(1);
    expect(animationCallbacks.size).toBe(1);

    act(() => runNextAnimationFrame(33.34));
    expect(readFrame).toHaveBeenCalledTimes(2);
    expect(readFrame).toHaveBeenLastCalledWith(33.34);
  });

  it("sustains the 45 FPS player budget without exceeding it", () => {
    const readFrame = vi.fn(() => loudFrame());
    render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        maxFps={45}
        themeId="cyber"
        intensity={1}
        primary="#6ef5ff"
        secondary="#ff4fd8"
      />,
    );

    for (let frame = 0; frame <= 120; frame += 1) {
      act(() => runNextAnimationFrame(frame * (1_000 / 120)));
    }

    // The inclusive 0–1000ms window contains the initial frame plus 45 slots.
    expect(readFrame).toHaveBeenCalledTimes(46);
  });

  it("resets its deadline after a main-thread stall instead of catching up", () => {
    const readFrame = vi.fn(() => loudFrame());
    render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        maxFps={30}
        themeId="rock"
        intensity={1}
        primary="#ff653f"
        secondary="#f4d35e"
      />,
    );

    act(() => runNextAnimationFrame(0));
    act(() => runNextAnimationFrame(90));
    act(() => runNextAnimationFrame(98.33));
    act(() => runNextAnimationFrame(106.67));
    act(() => runNextAnimationFrame(115));
    expect(readFrame).toHaveBeenCalledTimes(2);

    act(() => runNextAnimationFrame(123.34));
    expect(readFrame).toHaveBeenCalledTimes(3);
  });

  it("reduces backing resolution to stay within the pixel budget", () => {
    const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 2_000,
      bottom: 1_000,
      left: 0,
      width: 2_000,
      height: 1_000,
      toJSON: () => ({}),
    });

    const view = render(
      <AudioVisualizer
        readFrame={() => loudFrame()}
        enabled
        playing
        maxPixelCount={1_000_000}
        maxDevicePixelRatio={2}
        themeId="cinematic"
        intensity={1}
        primary="#ffc66d"
        secondary="#7ca9ff"
      />,
    );
    const canvas = view.container.querySelector("canvas")!;

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(1_000_000);
    expect(canvas.width).toBe(1_414);
    expect(canvas.height).toBe(707);
    expect(context.setTransform).toHaveBeenCalledWith(0.707, 0, 0, 0.707, 0, 0);

    if (originalDevicePixelRatio) {
      Object.defineProperty(window, "devicePixelRatio", originalDevicePixelRatio);
    } else {
      Reflect.deleteProperty(window, "devicePixelRatio");
    }
  });

  it("keeps the pixel budget hard for extremely large canvases", () => {
    vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 200_000,
      bottom: 100_000,
      left: 0,
      width: 200_000,
      height: 100_000,
      toJSON: () => ({}),
    });

    const view = render(
      <AudioVisualizer
        readFrame={() => loudFrame()}
        enabled
        playing
        maxPixelCount={1_000_000}
        maxDevicePixelRatio={2}
        themeId="prism"
        intensity={1}
        primary="#8de7ff"
        secondary="#b99cff"
      />,
    );
    const canvas = view.container.querySelector("canvas")!;

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(1_000_000);
    expect(canvas).toHaveAttribute("data-pixel-count", String(canvas.width * canvas.height));
  });

  it("stops scheduling while hidden and resumes with a fresh frame", () => {
    const visibilityState = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const readFrame = vi.fn(() => loudFrame());
    render(
      <AudioVisualizer
        readFrame={readFrame}
        enabled
        playing
        themeId="bloom"
        intensity={1}
        primary="#ff96c8"
        secondary="#8ad8ff"
      />,
    );

    act(() => runNextAnimationFrame(16.7));
    expect(readFrame).toHaveBeenCalledOnce();
    expect(animationCallbacks.size).toBe(1);

    visibilityState.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animationCallbacks.size).toBe(0);
    expect(cancelAnimationFrameMock).toHaveBeenCalledOnce();

    visibilityState.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(animationCallbacks.size).toBe(1);

    act(() => runNextAnimationFrame(5_000));
    expect(readFrame).toHaveBeenCalledTimes(2);
    expect(readFrame).toHaveBeenLastCalledWith(5_000);
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
