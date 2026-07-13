import { useEffect, useRef, useState } from "react";

import { extractPaletteFromBlob } from "../lib/coverPalette";
import type { CoverPalette } from "../types";

export type CoverPaletteStatus = "idle" | "loading" | "ready" | "unavailable";

export interface UseCoverPaletteOptions {
  coverArtId?: string;
  enabled: boolean;
  loadCoverArt?: (id: string, size?: number, signal?: AbortSignal) => Promise<Blob>;
  decodePalette?: (blob: Blob) => Promise<CoverPalette | undefined>;
}

export interface CoverPaletteState {
  palette?: CoverPalette;
  status: CoverPaletteStatus;
}

const paletteCache = new Map<string, CoverPalette>();
const MAX_CACHE_ENTRIES = 64;

function cachePalette(id: string, palette: CoverPalette): void {
  paletteCache.delete(id);
  paletteCache.set(id, palette);
  while (paletteCache.size > MAX_CACHE_ENTRIES) {
    const oldest = paletteCache.keys().next().value as string | undefined;
    if (!oldest) break;
    paletteCache.delete(oldest);
  }
}

export function clearCoverPaletteCache(): void {
  paletteCache.clear();
}

export function useCoverPalette({
  coverArtId,
  enabled,
  loadCoverArt,
  decodePalette = extractPaletteFromBlob,
}: UseCoverPaletteOptions): CoverPaletteState {
  const [state, setState] = useState<CoverPaletteState>({ status: "idle" });
  const generation = useRef(0);

  useEffect(() => {
    const activeGeneration = ++generation.current;
    const id = coverArtId?.trim();
    if (!enabled || !id || !loadCoverArt) {
      setState({ status: "idle" });
      return;
    }
    const cached = paletteCache.get(id);
    if (cached) {
      setState({ palette: cached, status: "ready" });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading" });
    void loadCoverArt(id, 64, controller.signal)
      .then(decodePalette)
      .then((palette) => {
        if (controller.signal.aborted || generation.current !== activeGeneration) return;
        if (!palette) {
          setState({ status: "unavailable" });
          return;
        }
        cachePalette(id, palette);
        setState({ palette, status: "ready" });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          generation.current !== activeGeneration ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setState({ status: "unavailable" });
      });

    return () => controller.abort();
  }, [coverArtId, decodePalette, enabled, loadCoverArt]);

  return state;
}
