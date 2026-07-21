import { useCallback, useEffect, useRef, useState } from "react";

import { rankLyrics } from "../lib/lyrics";
import type { SubsonicClient } from "../lib/subsonic";
import type { StructuredLyrics } from "../types";

export type TrackLyricsStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface TrackLyricsController {
  status: TrackLyricsStatus;
  entries: readonly StructuredLyrics[];
  selected?: StructuredLyrics;
  selectedIndex: number;
  error?: string;
  load(): Promise<void>;
  retry(): Promise<void>;
  select(index: number): void;
}

interface LyricsState {
  trackId?: string;
  status: TrackLyricsStatus;
  entries: StructuredLyrics[];
  selectedIndex: number;
  error?: string;
}

const EMPTY_STATE: LyricsState = {
  status: "idle",
  entries: [],
  selectedIndex: 0,
};

export function useTrackLyrics(
  client: SubsonicClient | undefined,
  trackId: string | undefined,
): TrackLyricsController {
  const [state, setState] = useState<LyricsState>(EMPTY_STATE);
  const cache = useRef(new Map<string, StructuredLyrics[]>());
  const previousClient = useRef(client);
  const generation = useRef(0);
  const abortController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    if (previousClient.current !== client) {
      cache.current.clear();
      previousClient.current = client;
    }
    generation.current += 1;
    abortController.current?.abort(new DOMException("Track changed", "AbortError"));
    abortController.current = undefined;
    if (!trackId) {
      setState(EMPTY_STATE);
      return;
    }
    const cached = cache.current.get(trackId);
    setState(cached
      ? { trackId, status: cached.length ? "ready" : "empty", entries: cached, selectedIndex: 0 }
      : { ...EMPTY_STATE, trackId });
  }, [client, trackId]);

  const load = useCallback(async () => {
    if (!client || !trackId) return;
    const cached = cache.current.get(trackId);
    if (cached) {
      setState({ trackId, status: cached.length ? "ready" : "empty", entries: cached, selectedIndex: 0 });
      return;
    }

    const requestGeneration = ++generation.current;
    abortController.current?.abort(new DOMException("Lyrics request replaced", "AbortError"));
    const controller = new AbortController();
    abortController.current = controller;
    setState({ trackId, status: "loading", entries: [], selectedIndex: 0 });
    try {
      const entries = rankLyrics(await client.getLyricsBySongId(trackId, controller.signal));
      if (generation.current !== requestGeneration || controller.signal.aborted) return;
      cache.current.set(trackId, entries);
      setState({
        trackId,
        status: entries.length ? "ready" : "empty",
        entries,
        selectedIndex: 0,
      });
    } catch (error) {
      if (controller.signal.aborted || generation.current !== requestGeneration) return;
      setState({
        trackId,
        status: "error",
        entries: [],
        selectedIndex: 0,
        error: error instanceof Error ? error.message : "Lyrics could not be loaded",
      });
    }
  }, [client, trackId]);

  const retry = useCallback(async () => {
    if (trackId) cache.current.delete(trackId);
    await load();
  }, [load, trackId]);

  const select = useCallback((index: number) => {
    setState((current) => ({
      ...current,
      selectedIndex: Math.min(Math.max(Math.round(index), 0), Math.max(0, current.entries.length - 1)),
    }));
  }, []);

  const selectedIndex = state.trackId === trackId ? state.selectedIndex : 0;
  const entries = state.trackId === trackId ? state.entries : [];
  return {
    status: state.trackId === trackId ? state.status : "idle",
    entries,
    selected: entries[selectedIndex],
    selectedIndex,
    error: state.trackId === trackId ? state.error : undefined,
    load,
    retry,
    select,
  };
}
