import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SubsonicClient } from "../lib/subsonic";
import type { StructuredLyrics } from "../types";
import { useTrackLyrics } from "./useTrackLyrics";

function client(getLyricsBySongId: SubsonicClient["getLyricsBySongId"]): SubsonicClient {
  return { getLyricsBySongId } as SubsonicClient;
}

const plain: StructuredLyrics = {
  synced: false,
  line: [{ value: "Plain" }, { value: "Lyrics" }],
};
const synced: StructuredLyrics = {
  synced: true,
  line: [{ start: 1000, value: "Timed" }],
};

describe("useTrackLyrics", () => {
  it("loads lazily, ranks synchronized lyrics, selects alternatives, and caches by track", async () => {
    const getLyricsBySongId = vi.fn(async () => [plain, synced]);
    const activeClient = client(getLyricsBySongId);
    const { result, rerender } = renderHook(
      ({ trackId }) => useTrackLyrics(activeClient, trackId),
      { initialProps: { trackId: "one" } },
    );

    expect(result.current.status).toBe("idle");
    expect(getLyricsBySongId).not.toHaveBeenCalled();
    await act(async () => result.current.load());
    expect(result.current.status).toBe("ready");
    expect(result.current.selected).toEqual(synced);
    act(() => result.current.select(1));
    expect(result.current.selected).toEqual(plain);

    rerender({ trackId: "two" });
    expect(result.current.status).toBe("idle");
    rerender({ trackId: "one" });
    expect(result.current.status).toBe("ready");
    expect(getLyricsBySongId).toHaveBeenCalledOnce();
  });

  it("ignores stale lyrics after the track changes", async () => {
    let resolveFirst!: (value: StructuredLyrics[]) => void;
    const first = new Promise<StructuredLyrics[]>((resolve) => { resolveFirst = resolve; });
    const getLyricsBySongId = vi.fn((id: string) => id === "one" ? first : Promise.resolve([plain]));
    const activeClient = client(getLyricsBySongId);
    const { result, rerender } = renderHook(
      ({ trackId }) => useTrackLyrics(activeClient, trackId),
      { initialProps: { trackId: "one" } },
    );

    act(() => { void result.current.load(); });
    rerender({ trackId: "two" });
    await act(async () => result.current.load());
    expect(result.current.selected).toEqual(plain);
    await act(async () => resolveFirst([synced]));
    expect(result.current.selected).toEqual(plain);
  });

  it("reports empty and recoverable error states", async () => {
    const getLyricsBySongId = vi.fn()
      .mockRejectedValueOnce(new Error("songLyrics unsupported"))
      .mockResolvedValueOnce([]);
    const activeClient = client(getLyricsBySongId);
    const { result } = renderHook(() => useTrackLyrics(activeClient, "one"));

    await act(async () => result.current.load());
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/unsupported/i);
    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });
});
