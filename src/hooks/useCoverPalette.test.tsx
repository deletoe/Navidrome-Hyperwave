import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CoverPalette } from "../types";
import { clearCoverPaletteCache, useCoverPalette } from "./useCoverPalette";

const palette: CoverPalette = { primary: "#ff3366", secondary: "#22ccdd", dark: "#160b12" };

afterEach(() => {
  clearCoverPaletteCache();
  vi.restoreAllMocks();
});

describe("useCoverPalette", () => {
  it("loads, decodes, and caches a cover without retaining its authenticated URL", async () => {
    const loadCoverArt = vi.fn(async () => new Blob(["cover"], { type: "image/png" }));
    const decodePalette = vi.fn(async () => palette);
    const first = renderHook(() =>
      useCoverPalette({ coverArtId: "cover-1", enabled: true, loadCoverArt, decodePalette }),
    );

    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    expect(first.result.current.palette).toEqual(palette);
    first.unmount();

    const second = renderHook(() =>
      useCoverPalette({ coverArtId: "cover-1", enabled: true, loadCoverArt, decodePalette }),
    );
    expect(second.result.current).toEqual({ palette, status: "ready" });
    expect(loadCoverArt).toHaveBeenCalledTimes(1);
  });

  it("clears the previous palette immediately and ignores stale completion", async () => {
    let resolveFirst!: (blob: Blob) => void;
    const firstBlob = new Promise<Blob>((resolve) => {
      resolveFirst = resolve;
    });
    const secondBlob = new Blob(["second"]);
    const loadCoverArt = vi.fn((id: string) =>
      id === "first" ? firstBlob : Promise.resolve(secondBlob),
    );
    const decodePalette = vi.fn(async (blob: Blob) =>
      blob === secondBlob
        ? palette
        : { primary: "#111111", secondary: "#222222", dark: "#000000" },
    );
    const view = renderHook(
      ({ id }) => useCoverPalette({ coverArtId: id, enabled: true, loadCoverArt, decodePalette }),
      { initialProps: { id: "first" } },
    );

    view.rerender({ id: "second" });
    await waitFor(() => expect(view.result.current).toEqual({ palette, status: "ready" }));
    expect(loadCoverArt).toHaveBeenCalledTimes(2);
    await act(async () => resolveFirst(new Blob(["first"])));
    expect(view.result.current).toEqual({ palette, status: "ready" });
  });

  it("falls back silently when cover bytes cannot be read", async () => {
    const loadCoverArt = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const decodePalette = vi.fn(async () => palette);
    const view = renderHook(() =>
      useCoverPalette({
        coverArtId: "blocked",
        enabled: true,
        loadCoverArt,
        decodePalette,
      }),
    );

    await waitFor(() => expect(view.result.current).toEqual({ status: "unavailable" }));
  });
});
