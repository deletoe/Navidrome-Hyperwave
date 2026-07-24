import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubsonicClient } from "../lib/subsonic";
import type { Album, Artist, ArtistDirectory, Track } from "../types";
import { useNavidrome, type HomeSection } from "./useNavidrome";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function navidromeClient(overrides: Partial<SubsonicClient> = {}): SubsonicClient {
  return {
    ping: vi.fn(async () => ({ status: "ok" as const, version: "1.16.1" })),
    getAlbumList2: vi.fn(async () => []),
    getAlbum: vi.fn(async (id) => ({ id, name: "Album", song: [] })),
    getArtists: vi.fn(async () => ({ index: [] })),
    getArtist: vi.fn(async (id) => ({ id, name: "Artist", album: [] })),
    getGenres: vi.fn(async () => []),
    getSongsByGenre: vi.fn(async () => []),
    search3: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    getStarred2: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    star: vi.fn(async () => undefined),
    unstar: vi.fn(async () => undefined),
    scrobble: vi.fn(async () => undefined),
    getLyricsBySongId: vi.fn(async () => []),
    fetchCoverArt: vi.fn(async () => new Blob([], { type: "image/png" })),
    coverArtUrl: vi.fn((id) => `http://music.test/cover/${id}`),
    streamUrl: vi.fn((id) => `http://music.test/stream/${id}`),
    ...overrides,
  };
}

const connection = {
  serverUrl: "http://music.test",
  auth: { type: "apiKey" as const, apiKey: "key" },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("dual-route connection and streaming quality", () => {
  it("prefers the internal address and keeps original quality in automatic mode", async () => {
    const internalClient = navidromeClient({
      streamUrl: vi.fn((id, maxBitRate) => `http://lan/stream/${id}?max=${maxBitRate ?? "original"}`),
    });
    const factory = vi.fn(() => internalClient);
    const { result } = renderHook(() => useNavidrome({ clientFactory: factory }));

    await act(async () => result.current.connect({
      internalServerUrl: "http://192.168.1.20:4533/",
      externalServerUrl: "https://music.example.com/",
      auth: { type: "apiKey", apiKey: "key" },
    }));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(result.current.activeRoute).toBe("internal");
    expect(result.current.activeServerUrl).toBe("http://192.168.1.20:4533");
    expect(result.current.streamUrlForTrack({ id: "lossless", title: "Lossless", bitRate: 1411 }))
      .toContain("max=original");
  });

  it("falls back to the external address and caps high-bitrate tracks at 256 kbps", async () => {
    const internalClient = navidromeClient({
      ping: vi.fn(async () => {
        throw new Error("LAN unavailable");
      }),
    });
    const externalClient = navidromeClient({
      streamUrl: vi.fn((id, maxBitRate) => `https://music.example.com/stream/${id}?max=${maxBitRate ?? "original"}`),
    });
    const factory = vi.fn()
      .mockReturnValueOnce(internalClient)
      .mockReturnValueOnce(externalClient);
    const { result } = renderHook(() => useNavidrome({ clientFactory: factory }));

    await act(async () => result.current.connect({
      internalServerUrl: "http://192.168.1.20:4533",
      externalServerUrl: "https://music.example.com",
      auth: { type: "apiKey", apiKey: "key" },
    }));

    expect(factory).toHaveBeenCalledTimes(2);
    expect(result.current.activeRoute).toBe("external");
    expect(result.current.streamUrlForTrack({ id: "high", title: "High", bitRate: 320 }))
      .toContain("max=256");
    expect(result.current.streamUrlForTrack({ id: "low", title: "Low", bitRate: 192 }))
      .toContain("max=original");

    act(() => result.current.setStreamingMode("limited"));
    act(() => result.current.setStreamingMaxBitRate(128));
    expect(result.current.streamUrlForTrack({ id: "manual", title: "Manual", bitRate: 96 }))
      .toContain("max=128");
  });

  it("transcodes ALAC-like M4A to Opus only for browser playback", async () => {
    const streamUrl = vi.fn((id, maxBitRate, format) =>
      `http://lan/stream/${id}?max=${maxBitRate ?? "original"}&format=${format ?? "source"}`);
    const internalClient = navidromeClient({ streamUrl });
    const { result } = renderHook(() => useNavidrome({
      clientFactory: vi.fn(() => internalClient),
    }));

    await act(async () => result.current.connect({
      internalServerUrl: "http://192.168.1.20:4533",
      auth: { type: "apiKey", apiKey: "key" },
    }));

    const alac: Track = {
      id: "alac",
      title: "The Sound of Silence",
      suffix: "m4a",
      contentType: "audio/mp4",
      bitDepth: 24,
      samplingRate: 192000,
      bitRate: 9216,
    };
    expect(result.current.streamUrlForTrack(alac))
      .toContain("max=256&format=opus");
    expect(result.current.streamUrlForTrack(alac, "native"))
      .toContain("max=original&format=source");
  });

  it("retries an unrecognized unsupported browser source as Opus without affecting native output", async () => {
    const streamUrl = vi.fn((id, maxBitRate, format) =>
      `http://lan/stream/${id}?max=${maxBitRate ?? "original"}&format=${format ?? "source"}`);
    const internalClient = navidromeClient({ streamUrl });
    const { result } = renderHook(() => useNavidrome({
      clientFactory: vi.fn(() => internalClient),
    }));

    await act(async () => result.current.connect({
      internalServerUrl: "http://192.168.1.20:4533",
      auth: { type: "apiKey", apiKey: "key" },
    }));

    const unknown: Track = {
      id: "unsupported",
      title: "Unknown codec",
      suffix: "bin",
      bitRate: 128,
    };
    expect(result.current.streamUrlForTrack(unknown))
      .toContain("max=original&format=source");

    await act(async () => {
      expect(await result.current.reportPlaybackFailure(unknown, 4)).toBe(true);
    });

    expect(result.current.streamUrlForTrack(unknown))
      .toContain("max=256&format=opus");
    expect(result.current.streamUrlForTrack(unknown, "native"))
      .toContain("max=original&format=source");
  });

  it("switches a live internal session to external and retries a failed API request", async () => {
    const internalClient = navidromeClient();
    const externalClient = navidromeClient({
      getGenres: vi.fn(async () => [{ value: "Recovered" }]),
    });
    const factory = vi.fn()
      .mockReturnValueOnce(internalClient)
      .mockReturnValueOnce(externalClient);
    const { result } = renderHook(() => useNavidrome({ clientFactory: factory }));
    await act(async () => result.current.connect({
      internalServerUrl: "http://192.168.1.20:4533",
      externalServerUrl: "https://music.example.com",
      auth: { type: "apiKey", apiKey: "key" },
    }));
    vi.mocked(internalClient.getGenres).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await act(async () => result.current.retryHomeSection("genres"));

    expect(externalClient.ping).toHaveBeenCalled();
    expect(externalClient.getGenres).toHaveBeenCalled();
    expect(result.current.activeRoute).toBe("external");
    expect(result.current.home.genres).toEqual([{ value: "Recovered" }]);
    expect(result.current.routeNotice).toMatch(/Switched to the external route/);
  });

  it("probes an unavailable internal route adaptively and requires two successes before returning", async () => {
    vi.useFakeTimers();
    try {
      const internalPing = vi.fn()
        .mockRejectedValueOnce(new TypeError("LAN unavailable"))
        .mockResolvedValue({ status: "ok" as const, version: "1.16.1" });
      const internalClient = navidromeClient({ ping: internalPing });
      const externalClient = navidromeClient();
      const factory = vi.fn()
        .mockReturnValueOnce(internalClient)
        .mockReturnValueOnce(externalClient);
      const { result } = renderHook(() => useNavidrome({ clientFactory: factory }));
      await act(async () => result.current.connect({
        internalServerUrl: "http://192.168.1.20:4533",
        externalServerUrl: "https://music.example.com",
        auth: { type: "apiKey", apiKey: "key" },
      }));
      expect(result.current.activeRoute).toBe("external");

      await act(async () => vi.advanceTimersByTimeAsync(15_000));
      expect(result.current.activeRoute).toBe("external");
      expect(result.current.routeStatus).toBe("probing");

      await act(async () => vi.advanceTimersByTimeAsync(3_000));
      expect(internalPing).toHaveBeenCalledTimes(3);
      expect(result.current.activeRoute).toBe("internal");
      expect(result.current.routeNotice).toMatch(/stable again/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("detail request generation", () => {
  it("keeps the newest detail when album, artist, and genre requests settle out of order", async () => {
    const albumRequest = deferred<Album>();
    const artistRequest = deferred<Artist>();
    const genreRequest = deferred<Track[]>();
    const nextClient = navidromeClient({
      getAlbum: vi.fn(() => albumRequest.promise),
      getArtist: vi.fn(() => artistRequest.promise),
      getSongsByGenre: vi.fn(() => genreRequest.promise),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let albumOpen!: Promise<void>;
    let artistOpen!: Promise<void>;
    let genreOpen!: Promise<void>;
    act(() => {
      albumOpen = result.current.openAlbum("old-album");
      artistOpen = result.current.openArtist("old-artist");
      genreOpen = result.current.openGenre("Jazz");
    });
    const jazzTrack = { id: "jazz-1", title: "Blue Signal" };
    await act(async () => {
      genreRequest.resolve([jazzTrack]);
      await genreOpen;
    });
    await act(async () => {
      albumRequest.resolve({ id: "old-album", name: "Old Album", song: [] });
      artistRequest.resolve({ id: "old-artist", name: "Old Artist", album: [] });
      await Promise.all([albumOpen, artistOpen]);
    });

    expect(result.current.activeGenre).toBe("Jazz");
    expect(result.current.genreTracks).toEqual([jazzTrack]);
    expect(result.current.activeAlbum).toBeUndefined();
    expect(result.current.activeArtist).toBeUndefined();
    expect(result.current.detailError).toBeUndefined();
    expect(result.current.detailLoading).toBe(false);
  });

  it("does not restore a detail after clearDetail invalidates its pending request", async () => {
    const albumRequest = deferred<Album>();
    const nextClient = navidromeClient({ getAlbum: vi.fn(() => albumRequest.promise) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openAlbum("album-1");
    });
    await waitFor(() => expect(result.current.detailLoading).toBe(true));
    act(() => result.current.clearDetail());
    await act(async () => {
      albumRequest.resolve({ id: "album-1", name: "Late Album", song: [] });
      await opening;
    });

    expect(result.current.activeAlbum).toBeUndefined();
    expect(result.current.activeArtist).toBeUndefined();
    expect(result.current.activeGenre).toBeUndefined();
    expect(result.current.genreTracks).toEqual([]);
    expect(result.current.detailError).toBeUndefined();
    expect(result.current.detailLoading).toBe(false);
  });

  it("ignores a pending detail rejection after disconnect", async () => {
    const artistRequest = deferred<Artist>();
    const nextClient = navidromeClient({ getArtist: vi.fn(() => artistRequest.promise) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openArtist("artist-1");
    });
    await waitFor(() => expect(result.current.detailLoading).toBe(true));
    act(() => result.current.disconnect());
    await act(async () => {
      artistRequest.reject(new Error("late artist failure"));
      await opening;
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.activeArtist).toBeUndefined();
    expect(result.current.detailError).toBeUndefined();
    expect(result.current.detailLoading).toBe(false);
  });

  it("invalidates a pending detail when reconnecting to a new client", async () => {
    const albumRequest = deferred<Album>();
    const firstClient = navidromeClient({ getAlbum: vi.fn(() => albumRequest.promise) });
    const secondClient = navidromeClient();
    const factory = vi.fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const { result } = renderHook(() => useNavidrome({ clientFactory: factory }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openAlbum("old-session-album");
    });
    await waitFor(() => expect(result.current.detailLoading).toBe(true));
    await act(async () => result.current.connect(connection));
    await act(async () => {
      albumRequest.resolve({ id: "old-session-album", name: "Old Session", song: [] });
      await opening;
    });

    expect(secondClient.ping).toHaveBeenCalled();
    expect(result.current.client).toBeDefined();
    expect(result.current.activeAlbum).toBeUndefined();
    expect(result.current.detailError).toBeUndefined();
    expect(result.current.detailLoading).toBe(false);
  });
});

describe("artist directory", () => {
  it("loads the indexed directory only when requested", async () => {
    const request = deferred<ArtistDirectory>();
    const getArtists = vi.fn(() => request.promise);
    const nextClient = navidromeClient({ getArtists });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    expect(getArtists).not.toHaveBeenCalled();
    expect(result.current.artistDirectory).toBeUndefined();

    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadArtists("folder-1");
    });
    await waitFor(() => expect(result.current.artistsLoading).toBe(true));
    expect(getArtists).toHaveBeenCalledWith("folder-1", expect.any(AbortSignal));

    await act(async () => {
      request.resolve({
        ignoredArticles: "The",
        index: [{ name: "S", artist: [{ id: "artist-1", name: "Signal Club" }] }],
      });
      await loading;
    });
    expect(result.current.artistDirectory?.index[0]?.artist[0]?.name).toBe("Signal Club");
    expect(result.current.artistsLoading).toBe(false);
    expect(result.current.artistsError).toBeUndefined();
  });

  it("does not restore a pending directory after disconnect", async () => {
    const request = deferred<ArtistDirectory>();
    const nextClient = navidromeClient({ getArtists: vi.fn(() => request.promise) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let loading!: Promise<void>;
    act(() => {
      loading = result.current.loadArtists();
    });
    await waitFor(() => expect(result.current.artistsLoading).toBe(true));
    act(() => result.current.disconnect());
    await act(async () => {
      request.resolve({ index: [{ name: "A", artist: [{ id: "late", name: "Late" }] }] });
      await loading;
    });

    expect(result.current.artistDirectory).toBeUndefined();
    expect(result.current.artistsLoading).toBe(false);
    expect(result.current.artistsError).toBeUndefined();
  });

  it("aborts and times out a stalled artist directory request", async () => {
    vi.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const nextClient = navidromeClient({
        getArtists: vi.fn((_musicFolderId, signal) => {
          requestSignal = signal;
          return new Promise<ArtistDirectory>(() => undefined);
        }),
      });
      const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
      await act(async () => result.current.connect(connection));

      let loading!: Promise<void>;
      await act(async () => {
        loading = result.current.loadArtists();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(requestSignal?.aborted).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
        await loading;
      });
      expect(requestSignal?.aborted).toBe(true);
      expect(result.current.artistsLoading).toBe(false);
      expect(result.current.artistsError).toBe("Artist directory request timed out");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("artist songs", () => {
  it("publishes the artist and albums before its album songs finish loading", async () => {
    const albumRequest = deferred<Album>();
    const nextClient = navidromeClient({
      getArtist: vi.fn(async () => ({
        id: "artist-1",
        name: "Signal Club",
        album: [{ id: "album-1", name: "Night Signals" }],
      })),
      getAlbum: vi.fn(() => albumRequest.promise),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openArtist("artist-1");
    });
    await waitFor(() => expect(result.current.artistTracksLoading).toBe(true));
    expect(result.current.activeArtist?.name).toBe("Signal Club");
    expect(result.current.activeArtist?.album?.[0]?.name).toBe("Night Signals");
    expect(result.current.detailLoading).toBe(false);
    expect(result.current.activeArtistTracks).toEqual([]);

    await act(async () => {
      albumRequest.resolve({
        id: "album-1",
        name: "Night Signals",
        song: [{ id: "track-1", title: "Blue Hour" }],
      });
      await opening;
    });
    expect(result.current.activeArtistTracks.map(({ id }) => id)).toEqual(["track-1"]);
    expect(result.current.artistTracksLoading).toBe(false);
  });

  it("publishes completed albums while another album is pending, then times it out", async () => {
    vi.useFakeTimers();
    try {
      const pendingAlbum = deferred<Album>();
      let pendingSignal: AbortSignal | undefined;
      const nextClient = navidromeClient({
        getArtist: vi.fn(async () => ({
          id: "artist-1",
          name: "Signal Club",
          album: [
            { id: "album-pending", name: "Pending" },
            { id: "album-ready", name: "Ready" },
          ],
        })),
        getAlbum: vi.fn((id, signal) => {
          if (id === "album-pending") {
            pendingSignal = signal;
            return pendingAlbum.promise;
          }
          return Promise.resolve({
                id,
                name: "Ready",
                song: [{ id: "ready-track", title: "Already Here" }],
              });
        }),
      });
      const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
      await act(async () => result.current.connect(connection));

      let opening!: Promise<void>;
      await act(async () => {
        opening = result.current.openArtist("artist-1");
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.activeArtistTracks.map(({ id }) => id)).toEqual(["ready-track"]);
      expect(result.current.artistTracksLoading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
        await opening;
      });
      expect(result.current.activeArtistTracks.map(({ id }) => id)).toEqual(["ready-track"]);
      expect(result.current.artistTracksWarning).toMatch(/1 of 2 albums/);
      expect(result.current.artistTracksLoading).toBe(false);
      expect(pendingSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps real album transports at five while timed-out requests are replaced", async () => {
    vi.useFakeTimers();
    try {
      const albums = Array.from({ length: 7 }, (_, index) => ({
        id: `album-${index}`,
        name: `Album ${index}`,
      }));
      let activeTransports = 0;
      let maximumTransports = 0;
      const getAlbum = vi.fn((_id: string, signal?: AbortSignal) =>
        new Promise<Album>(() => {
          activeTransports += 1;
          maximumTransports = Math.max(maximumTransports, activeTransports);
          signal?.addEventListener("abort", () => {
            activeTransports -= 1;
          }, { once: true });
        }),
      );
      const nextClient = navidromeClient({
        getArtist: vi.fn(async () => ({ id: "artist-1", name: "Signal Club", album: albums })),
        getAlbum,
      });
      const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
      await act(async () => result.current.connect(connection));

      let opening!: Promise<void>;
      await act(async () => {
        opening = result.current.openArtist("artist-1");
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getAlbum).toHaveBeenCalledTimes(5);
      expect(activeTransports).toBe(5);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(getAlbum).toHaveBeenCalledTimes(7);
      expect(activeTransports).toBe(2);
      expect(maximumTransports).toBe(5);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
        await opening;
      });
      expect(activeTransports).toBe(0);
      expect(result.current.artistTracksWarning).toMatch(/7 albums/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start queued album requests after the artist detail is cleared", async () => {
    const albums = Array.from({ length: 7 }, (_, index) => ({
      id: `album-${index}`,
      name: `Album ${index}`,
    }));
    const requests = new Map<string, ReturnType<typeof deferred<Album>>>();
    const requestSignals = new Map<string, AbortSignal | undefined>();
    const getAlbum = vi.fn((id: string, signal?: AbortSignal) => {
      const request = deferred<Album>();
      requests.set(id, request);
      requestSignals.set(id, signal);
      return request.promise;
    });
    const nextClient = navidromeClient({
      getArtist: vi.fn(async () => ({ id: "artist-1", name: "Signal Club", album: albums })),
      getAlbum,
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openArtist("artist-1");
    });
    await waitFor(() => expect(getAlbum).toHaveBeenCalledTimes(5));
    act(() => result.current.clearDetail());
    expect([...requestSignals.values()].every((signal) => signal?.aborted)).toBe(true);

    await act(async () => {
      requests.get("album-0")?.resolve({ id: "album-0", name: "Album 0", song: [] });
      await Promise.resolve();
    });
    expect(getAlbum).toHaveBeenCalledTimes(5);

    await act(async () => {
      for (let index = 1; index < 5; index += 1) {
        requests.get(`album-${index}`)?.resolve({
          id: `album-${index}`,
          name: `Album ${index}`,
          song: [],
        });
      }
      await opening;
    });
    expect(getAlbum).toHaveBeenCalledTimes(5);
    expect(result.current.activeArtistTracks).toEqual([]);
  });

  it("limits album requests, preserves order, deduplicates tracks, and reuses the cache", async () => {
    const albums = Array.from({ length: 7 }, (_, index) => ({
      id: `album-${index}`,
      name: `Album ${index}`,
    }));
    let concurrentRequests = 0;
    let maximumConcurrency = 0;
    const getAlbum = vi.fn(async (id: string): Promise<Album> => {
      concurrentRequests += 1;
      maximumConcurrency = Math.max(maximumConcurrency, concurrentRequests);
      await Promise.resolve();
      concurrentRequests -= 1;
      if (id === "album-2") throw new Error("album unavailable");
      const index = Number(id.split("-")[1]);
      return {
        id,
        name: `Album ${index}`,
        song: [
          ...(index === 0 || index === 3 ? [{ id: "shared", title: "Shared" }] : []),
          { id: `track-${index}`, title: `Track ${index}` },
        ],
      };
    });
    const nextClient = navidromeClient({
      getArtist: vi.fn(async () => ({ id: "artist-1", name: "Signal Club", album: albums })),
      getAlbum,
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    await act(async () => result.current.openArtist("artist-1"));

    expect(maximumConcurrency).toBe(5);
    expect(result.current.activeArtistTracks.map(({ id }) => id)).toEqual([
      "shared",
      "track-0",
      "track-1",
      "track-3",
      "track-4",
      "track-5",
      "track-6",
    ]);
    expect(result.current.artistTracksWarning).toMatch(/1 of 7 albums/);
    const callsAfterArtist = getAlbum.mock.calls.length;

    await act(async () => result.current.openAlbum("album-0"));
    expect(getAlbum).toHaveBeenCalledTimes(callsAfterArtist);
    expect(result.current.activeAlbum?.song?.map(({ id }) => id)).toEqual(["shared", "track-0"]);
  });

  it("bypasses a successful album cache entry on an explicit refresh", async () => {
    const getAlbum = vi.fn()
      .mockResolvedValueOnce({ id: "album-1", name: "First", song: [] })
      .mockResolvedValueOnce({
        id: "album-1",
        name: "Refreshed",
        song: [{ id: "track-1", title: "Newly Indexed" }],
      });
    const nextClient = navidromeClient({ getAlbum });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    await act(async () => result.current.openAlbum("album-1"));
    await act(async () => result.current.openAlbum("album-1"));
    expect(getAlbum).toHaveBeenCalledTimes(1);

    await act(async () => result.current.openAlbum("album-1", true));
    expect(getAlbum).toHaveBeenCalledTimes(2);
    expect(result.current.activeAlbum?.name).toBe("Refreshed");
    expect(result.current.activeAlbum?.song?.[0]?.id).toBe("track-1");
  });

  it("ignores album aggregation that finishes after disconnect", async () => {
    const albumRequest = deferred<Album>();
    const nextClient = navidromeClient({
      getArtist: vi.fn(async () => ({
        id: "artist-1",
        name: "Signal Club",
        album: [{ id: "album-1", name: "Album" }],
      })),
      getAlbum: vi.fn(() => albumRequest.promise),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));

    let opening!: Promise<void>;
    act(() => {
      opening = result.current.openArtist("artist-1");
    });
    await waitFor(() => expect(result.current.artistTracksLoading).toBe(true));
    act(() => result.current.disconnect());
    await act(async () => {
      albumRequest.resolve({
        id: "album-1",
        name: "Album",
        song: [{ id: "late-track", title: "Late" }],
      });
      await opening;
    });

    expect(result.current.activeArtist).toBeUndefined();
    expect(result.current.activeArtistTracks).toEqual([]);
    expect(result.current.artistTracksLoading).toBe(false);
    expect(result.current.artistTracksWarning).toBeUndefined();
  });

  it("optimistically updates artist tracks and restores them when starring fails", async () => {
    const write = deferred<void>();
    const track: Track = { id: "track-1", title: "Blue Hour", albumId: "album-1" };
    const nextClient = navidromeClient({
      getArtist: vi.fn(async () => ({
        id: "artist-1",
        name: "Signal Club",
        album: [{ id: "album-1", name: "Album" }],
      })),
      getAlbum: vi.fn(async () => ({ id: "album-1", name: "Album", song: [track] })),
      star: vi.fn(() => write.promise),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => result.current.connect(connection));
    await act(async () => result.current.openArtist("artist-1"));

    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.toggleStar(track);
    });
    await waitFor(() => expect(result.current.activeArtistTracks[0]?.starred).toBeTruthy());
    await act(async () => {
      write.reject(new Error("write failed"));
      await mutation;
    });

    expect(result.current.activeArtistTracks[0]?.starred).toBeUndefined();
    expect(result.current.mutationError).toBe("write failed");
  });
});

describe("home section retry", () => {
  function renderRetryHook(nextClient: SubsonicClient) {
    return renderHook(() => useNavidrome({ clientFactory: () => nextClient }) as ReturnType<
      typeof useNavidrome
    > & {
      retryHomeSection: (section: HomeSection) => Promise<void>;
    });
  }

  it("retries only the target album endpoint and exposes target-only loading", async () => {
    const newestRetry = deferred<Album[]>();
    let newestCalls = 0;
    const getAlbumList2 = vi.fn((type: "newest" | "random" | "frequent") => {
      if (type === "newest") {
        newestCalls += 1;
        if (newestCalls === 2) return newestRetry.promise;
      }
      return Promise.resolve([{ id: `${type}-initial`, name: `${type} initial` }]);
    });
    const getGenres = vi.fn(async () => [{ value: "Rock", songCount: 4 }]);
    const getStarred2 = vi.fn(async () => ({
      song: [{ id: "starred-1", title: "Saved", starred: "now" }],
      album: [{ id: "starred-album", name: "Saved Album" }],
      artist: [{ id: "starred-artist", name: "Saved Artist" }],
    }));
    const nextClient = navidromeClient({ getAlbumList2, getGenres, getStarred2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));
    const untouched = {
      random: result.current.home.random,
      frequent: result.current.home.frequent,
      genres: result.current.home.genres,
      starredSongs: result.current.starredSongs,
      starredAlbums: result.current.starredAlbums,
      starredArtists: result.current.starredArtists,
      warnings: result.current.home.warnings,
    };

    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retryHomeSection("newest");
    });
    await waitFor(() => expect(result.current.home.loadingSections?.newest).toBe(true));

    expect(result.current.home.loading).toBe(false);
    expect(result.current.home.random).toBe(untouched.random);
    expect(result.current.home.frequent).toBe(untouched.frequent);
    expect(result.current.home.genres).toBe(untouched.genres);
    expect(result.current.starredSongs).toBe(untouched.starredSongs);
    expect(result.current.starredAlbums).toBe(untouched.starredAlbums);
    expect(result.current.starredArtists).toBe(untouched.starredArtists);
    expect(result.current.home.warnings).toEqual(untouched.warnings);
    expect(getAlbumList2.mock.calls.map(([type]) => type)).toEqual([
      "newest",
      "random",
      "frequent",
      "newest",
    ]);
    expect(getGenres).toHaveBeenCalledTimes(1);
    expect(getStarred2).toHaveBeenCalledTimes(1);

    await act(async () => {
      newestRetry.resolve([{ id: "newest-retry", name: "Newest Retry" }]);
      await retry;
    });

    expect(result.current.home.newest).toEqual([
      { id: "newest-retry", name: "Newest Retry" },
    ]);
    expect(result.current.home.loadingSections?.newest).toBe(false);
    expect(result.current.home.random).toBe(untouched.random);
    expect(result.current.home.frequent).toBe(untouched.frequent);
    expect(result.current.home.genres).toBe(untouched.genres);
  });

  it("keeps target data on failure and changes only the target warning", async () => {
    let frequentCalls = 0;
    const getAlbumList2 = vi.fn(async (type: "newest" | "random" | "frequent") => {
      if (type === "random") throw new Error("random initial failure");
      if (type === "frequent") {
        frequentCalls += 1;
        if (frequentCalls === 2) throw new Error("frequent retry failure");
      }
      return [{ id: `${type}-initial`, name: `${type} initial` }];
    });
    const nextClient = navidromeClient({ getAlbumList2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));
    const previousFrequent = result.current.home.frequent;
    const previousNewest = result.current.home.newest;
    const randomWarning = result.current.home.warnings.random;

    await act(async () => result.current.retryHomeSection("frequent"));

    expect(result.current.home.frequent).toBe(previousFrequent);
    expect(result.current.home.newest).toBe(previousNewest);
    expect(result.current.home.warnings.random).toBe(randomWarning);
    expect(result.current.home.warnings.frequent).toBe("frequent retry failure");
    expect(result.current.home.loadingSections?.frequent).toBe(false);
    expect(getAlbumList2.mock.calls.map(([type]) => type)).toEqual([
      "newest",
      "random",
      "frequent",
      "frequent",
    ]);
  });

  it("retries genres without calling album or starred endpoints", async () => {
    let genreCalls = 0;
    const getAlbumList2 = vi.fn(async (type) => [{ id: type, name: type }]);
    const getGenres = vi.fn(async () => {
      genreCalls += 1;
      return [{ value: genreCalls === 1 ? "Initial" : "Retried" }];
    });
    const getStarred2 = vi.fn(async () => ({ song: [], album: [], artist: [] }));
    const nextClient = navidromeClient({ getAlbumList2, getGenres, getStarred2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));

    await act(async () => result.current.retryHomeSection("genres"));

    expect(result.current.home.genres).toEqual([{ value: "Retried" }]);
    expect(getGenres).toHaveBeenCalledTimes(2);
    expect(getAlbumList2).toHaveBeenCalledTimes(3);
    expect(getStarred2).toHaveBeenCalledTimes(1);
  });

  it("retries starred without changing home album or genre data", async () => {
    let starredCalls = 0;
    const getAlbumList2 = vi.fn(async (type) => [{ id: type, name: type }]);
    const getGenres = vi.fn(async () => [{ value: "Rock" }]);
    const getStarred2 = vi.fn(async () => {
      starredCalls += 1;
      return {
        song: [{ id: `song-${starredCalls}`, title: `Song ${starredCalls}`, starred: "now" }],
        album: [{ id: `album-${starredCalls}`, name: `Album ${starredCalls}` }],
        artist: [{ id: `artist-${starredCalls}`, name: `Artist ${starredCalls}` }],
      };
    });
    const nextClient = navidromeClient({ getAlbumList2, getGenres, getStarred2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));
    const previousHomeData = {
      newest: result.current.home.newest,
      random: result.current.home.random,
      frequent: result.current.home.frequent,
      genres: result.current.home.genres,
    };

    await act(async () => result.current.retryHomeSection("starred"));

    expect(result.current.starredSongs[0]?.id).toBe("song-2");
    expect(result.current.starredAlbums[0]?.id).toBe("album-2");
    expect(result.current.starredArtists[0]?.id).toBe("artist-2");
    expect(result.current.home.newest).toBe(previousHomeData.newest);
    expect(result.current.home.random).toBe(previousHomeData.random);
    expect(result.current.home.frequent).toBe(previousHomeData.frequent);
    expect(result.current.home.genres).toBe(previousHomeData.genres);
    expect(getStarred2).toHaveBeenCalledTimes(2);
    expect(getAlbumList2).toHaveBeenCalledTimes(3);
    expect(getGenres).toHaveBeenCalledTimes(1);
  });

  it("does not let an older starred retry overwrite a newer favorite mutation", async () => {
    const savedTrack = {
      id: "saved-song",
      title: "Saved Song",
      starred: "2026-07-10T11:00:00.000Z",
    };
    const staleRetry = deferred<{ song: Track[]; album: []; artist: [] }>();
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [savedTrack], album: [], artist: [] })
      .mockImplementationOnce(() => staleRetry.promise)
      .mockResolvedValueOnce({ song: [], album: [], artist: [] });
    const nextClient = navidromeClient({ getStarred2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));

    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retryHomeSection("starred");
    });
    await waitFor(() => expect(result.current.home.loadingSections?.starred).toBe(true));

    await act(async () => result.current.toggleStar(savedTrack));
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.starredSongs).toEqual([]));

    await act(async () => {
      staleRetry.resolve({ song: [savedTrack], album: [], artist: [] });
      await retry;
    });

    expect(result.current.starredSongs).toEqual([]);
    expect(result.current.isTrackStarred(savedTrack)).toBe(false);
  });

  it("does not let an older full refresh overwrite a newer favorite mutation", async () => {
    const savedTrack = {
      id: "refresh-saved-song",
      title: "Refresh Saved Song",
      starred: "2026-07-10T11:00:00.000Z",
    };
    const staleRefresh = deferred<{ song: Track[]; album: []; artist: [] }>();
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [savedTrack], album: [], artist: [] })
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce({ song: [], album: [], artist: [] });
    const nextClient = navidromeClient({ getStarred2 });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshHome();
    });
    await waitFor(() => expect(result.current.home.loading).toBe(true));

    await act(async () => result.current.toggleStar(savedTrack));
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.starredSongs).toEqual([]));

    await act(async () => {
      staleRefresh.resolve({ song: [savedTrack], album: [], artist: [] });
      await refresh;
    });

    expect(result.current.starredSongs).toEqual([]);
    expect(result.current.isTrackStarred(savedTrack)).toBe(false);
  });

  it("does not let a full refresh started during a favorite write overwrite its result", async () => {
    const savedTrack = {
      id: "pending-write-song",
      title: "Pending Write Song",
      starred: "2026-07-10T11:00:00.000Z",
    };
    const pendingUnstar = deferred<void>();
    const staleRefresh = deferred<{ song: Track[]; album: []; artist: [] }>();
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [savedTrack], album: [], artist: [] })
      .mockImplementationOnce(() => staleRefresh.promise)
      .mockResolvedValueOnce({ song: [], album: [], artist: [] });
    const nextClient = navidromeClient({
      getStarred2,
      unstar: vi.fn(() => pendingUnstar.promise),
    });
    const { result } = renderRetryHook(nextClient);
    await act(async () => result.current.connect(connection));

    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.toggleStar(savedTrack);
    });
    await waitFor(() => expect(result.current.starredSongs).toEqual([]));

    let refresh!: Promise<void>;
    act(() => {
      refresh = result.current.refreshHome();
    });
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(2));

    await act(async () => {
      pendingUnstar.resolve();
      await mutation;
    });
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.starredSongs).toEqual([]));

    await act(async () => {
      staleRefresh.resolve({ song: [savedTrack], album: [], artist: [] });
      await refresh;
    });

    expect(result.current.starredSongs).toEqual([]);
    expect(result.current.isTrackStarred(savedTrack)).toBe(false);
  });
});

describe("mutation-aware favorite truth", () => {
  function renderFavoriteHook(nextClient: SubsonicClient) {
    return renderHook(() => useNavidrome({ clientFactory: () => nextClient }) as ReturnType<
      typeof useNavidrome
    > & {
      isTrackStarred: (track: Track) => boolean;
    });
  }

  it("uses the reconciled starredIds set as the single favorite truth", async () => {
    const staleQueueTrack = {
      id: "queue-song",
      title: "Queue Signal",
      starred: "2024-02-03T04:05:06.000Z",
    };
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [], album: [], artist: [] })
      .mockResolvedValueOnce({
        song: [{ ...staleQueueTrack, starred: "2026-07-10T11:00:00.000Z" }],
        album: [],
        artist: [],
      })
      .mockResolvedValueOnce({ song: [], album: [], artist: [] });
    const nextClient = navidromeClient({ getStarred2 });
    const { result } = renderFavoriteHook(nextClient);
    await act(async () => result.current.connect(connection));

    expect(result.current.starredIds.has(staleQueueTrack.id)).toBe(false);
    expect(result.current.isTrackStarred(staleQueueTrack)).toBe(false);

    await act(async () => result.current.toggleStar(staleQueueTrack));
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(2));
    expect(nextClient.star).toHaveBeenCalledTimes(1);
    expect(nextClient.unstar).not.toHaveBeenCalled();
    expect(result.current.starredIds.has(staleQueueTrack.id)).toBe(true);
    expect(result.current.isTrackStarred(staleQueueTrack)).toBe(true);

    await act(async () => result.current.toggleStar(staleQueueTrack));
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(3));
    expect(nextClient.unstar).toHaveBeenCalledTimes(1);
    expect(nextClient.star).toHaveBeenCalledTimes(1);
    expect(result.current.starredIds.has(staleQueueTrack.id)).toBe(false);
    expect(result.current.isTrackStarred(staleQueueTrack)).toBe(false);
  });

  it("rolls mutation-aware truth back to the exact prior favorite state on failure", async () => {
    const originalStarred = "2024-02-03T04:05:06.000Z";
    const staleQueueTrack = {
      id: "rollback-song",
      title: "Rollback Signal",
      starred: originalStarred,
    };
    const nextClient = navidromeClient({
      getStarred2: vi.fn(async () => ({ song: [staleQueueTrack], album: [], artist: [] })),
      unstar: vi.fn(async () => {
        throw new Error("favorite write failed");
      }),
    });
    const { result } = renderFavoriteHook(nextClient);
    await act(async () => result.current.connect(connection));

    await act(async () => result.current.toggleStar(staleQueueTrack));

    expect(result.current.mutationError).toBe("favorite write failed");
    expect(result.current.starredSongs).toEqual([staleQueueTrack]);
    expect(result.current.starredSongs[0]?.starred).toBe(originalStarred);
    expect(result.current.starredIds.has(staleQueueTrack.id)).toBe(true);
    expect(result.current.isTrackStarred(staleQueueTrack)).toBe(true);
  });

  it("does not let a failed write from an old connection roll back the new session", async () => {
    const track = { id: "shared-song", title: "Shared Signal" };
    const oldWrite = deferred<void>();
    const firstClient = navidromeClient({
      getStarred2: vi.fn(async () => ({ song: [], album: [], artist: [] })),
      star: vi.fn(() => oldWrite.promise),
    });
    const secondStarred = vi
      .fn()
      .mockResolvedValueOnce({ song: [], album: [], artist: [] })
      .mockResolvedValueOnce({
        song: [{ ...track, starred: "2026-07-13T12:00:00.000Z" }],
        album: [],
        artist: [],
      });
    const secondClient = navidromeClient({ getStarred2: secondStarred });
    const factory = vi.fn()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    const current = renderHook(() => useNavidrome({ clientFactory: factory }));

    await act(async () => current.result.current.connect(connection));
    let oldMutation!: Promise<void>;
    act(() => {
      oldMutation = current.result.current.toggleStar(track);
    });
    await waitFor(() => expect(firstClient.star).toHaveBeenCalledTimes(1));

    await act(async () => current.result.current.connect(connection));
    await act(async () => current.result.current.toggleStar(track));
    await waitFor(() => expect(secondStarred).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(current.result.current.starredIds.has(track.id)).toBe(true));

    await act(async () => {
      oldWrite.reject(new Error("old session write failed"));
      await oldMutation;
    });
    expect(current.result.current.starredIds.has(track.id)).toBe(true);
    expect(current.result.current.mutationError).toBeUndefined();
  });
});
