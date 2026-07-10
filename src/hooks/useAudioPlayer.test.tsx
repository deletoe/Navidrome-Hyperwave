import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SubsonicClient } from "../lib/subsonic";
import {
  createInitialQueueState,
  queueReducer,
  type QueueState,
} from "../state/playerQueue";
import type { Track } from "../types";
import { getScrobbleThreshold, useAudioPlayer } from "./useAudioPlayer";
import { useNavidrome } from "./useNavidrome";

const song: Track = {
  id: "song-1",
  title: "Signal One",
  artist: "Test Artist",
  album: "Test Album",
  duration: 180,
};

const client = {
  streamUrl: vi.fn((id: string) => `http://music.test/stream/${id}`),
  coverArtUrl: vi.fn((id: string) => `http://music.test/cover/${id}`),
  scrobble: vi.fn(async () => undefined),
} as unknown as SubsonicClient;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Harness({
  currentTrack,
  activeClient = client,
}: {
  currentTrack?: Track;
  activeClient?: SubsonicClient;
}) {
  const [, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const queueState = currentTrack
    ? ({
        tracks: [currentTrack],
        currentIndex: 0,
        repeatMode: "off",
        shuffle: false,
      } satisfies QueueState)
    : createInitialQueueState();
  const player = useAudioPlayer({ client: activeClient, currentTrack, queueState, dispatch });

  return (
    <div>
      <audio ref={player.audioRef} data-testid="audio" />
      <button type="button" onClick={() => void player.play()}>
        play
      </button>
      <output>{player.volume}</output>
    </div>
  );
}

function QueueOccurrenceHarness({
  queueState,
  activeClient,
}: {
  queueState: QueueState;
  activeClient: SubsonicClient;
}) {
  const [, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const currentTrack = queueState.tracks[queueState.currentIndex];
  const player = useAudioPlayer({ client: activeClient, currentTrack, queueState, dispatch });

  return (
    <div>
      <audio ref={player.audioRef} data-testid="occurrence-audio" />
      <button type="button" onClick={() => void player.play()}>
        play occurrence
      </button>
    </div>
  );
}

describe("useAudioPlayer", () => {
  it("pauses and removes the media source when the queue becomes empty", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause");
    const load = vi.spyOn(HTMLMediaElement.prototype, "load");
    const removeAttribute = vi.spyOn(HTMLMediaElement.prototype, "removeAttribute");
    const { rerender } = render(<Harness currentTrack={song} />);

    rerender(<Harness currentTrack={undefined} />);

    expect(pause).toHaveBeenCalled();
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(load).toHaveBeenCalled();
  });

  it("does not rebuild the stream URL for an unchanged track", () => {
    vi.mocked(client.streamUrl).mockClear();
    const { rerender } = render(<Harness currentTrack={song} />);

    rerender(<Harness currentTrack={{ ...song }} />);

    expect(client.streamUrl).toHaveBeenCalledTimes(1);
  });

  it("starts playback from an explicit user action", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(<Harness currentTrack={song} />);

    await act(async () => {
      view.getByRole("button", { name: "play" }).click();
    });

    expect(play).toHaveBeenCalled();
  });

  it("rebuilds the stream URL when the client session changes", () => {
    const firstClient = navidromeClient({
      streamUrl: vi.fn((id) => `http://first.test/${id}`),
    });
    const secondClient = navidromeClient({
      streamUrl: vi.fn((id) => `http://second.test/${id}`),
    });
    const view = render(<Harness currentTrack={song} activeClient={firstClient} />);

    view.rerender(<Harness currentTrack={{ ...song }} activeClient={secondClient} />);

    expect(secondClient.streamUrl).toHaveBeenCalledWith(song.id);
    expect(view.getByTestId("audio")).toHaveAttribute("src", `http://second.test/${song.id}`);
  });

  it("scrobbles the next track when continuous playback advances", async () => {
    const nextClient = navidromeClient();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const view = render(<Harness currentTrack={song} activeClient={nextClient} />);
    await act(async () => {
      view.getByRole("button", { name: "play" }).click();
    });
    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledWith(song.id, false));

    const second = { ...song, id: "song-2", title: "Signal Two" };
    view.rerender(<Harness currentTrack={second} activeClient={nextClient} />);

    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledWith(second.id, false));
  });

  it("reloads, resumes, and scrobbles adjacent occurrences with the same track id", async () => {
    const nextClient = navidromeClient();
    const load = vi.spyOn(HTMLMediaElement.prototype, "load");
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const duplicateQueue = {
      tracks: [song, song],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
      occurrenceKeys: [1, 2],
      nextOccurrenceKey: 2,
    } as QueueState;
    const view = render(
      <QueueOccurrenceHarness queueState={duplicateQueue} activeClient={nextClient} />,
    );

    await act(async () => {
      view.getByRole("button", { name: "play occurrence" }).click();
    });
    await waitFor(() => expect(nextClient.scrobble).toHaveBeenCalledTimes(1));

    view.rerender(
      <QueueOccurrenceHarness
        queueState={{ ...duplicateQueue, currentIndex: 1 }}
        activeClient={nextClient}
      />,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(play).toHaveBeenCalledTimes(2);
    expect(nextClient.scrobble).toHaveBeenNthCalledWith(2, song.id, false);
  });

  it("removes Media Session handlers when the track is cleared", () => {
    const actionHandler = vi.fn();
    const original = Object.getOwnPropertyDescriptor(navigator, "mediaSession");
    vi.stubGlobal(
      "MediaMetadata",
      class {
        constructor(_metadata: MediaMetadataInit) {}
      },
    );
    Object.defineProperty(navigator, "mediaSession", {
      configurable: true,
      value: { metadata: null, setActionHandler: actionHandler },
    });
    try {
      const view = render(<Harness currentTrack={song} />);
      view.rerender(<Harness currentTrack={undefined} />);
      expect(actionHandler).toHaveBeenCalledWith("play", null);
      expect(actionHandler).toHaveBeenCalledWith("nexttrack", null);
    } finally {
      if (original) Object.defineProperty(navigator, "mediaSession", original);
      else Reflect.deleteProperty(navigator, "mediaSession");
    }
  });

  it("uses the earlier of half duration and four minutes for submission", () => {
    expect(getScrobbleThreshold(180)).toBe(90);
    expect(getScrobbleThreshold(900)).toBe(240);
    expect(getScrobbleThreshold(0)).toBe(0);
  });
});

function navidromeClient(
  overrides: Partial<SubsonicClient> = {},
): SubsonicClient {
  return {
    ping: vi.fn(async () => ({ status: "ok" as const, version: "1.16.1", openSubsonic: true })),
    getAlbumList2: vi.fn(async () => []),
    getAlbum: vi.fn(async (id) => ({ id, name: "Album", song: [] })),
    getArtist: vi.fn(async (id) => ({ id, name: "Artist", album: [] })),
    getGenres: vi.fn(async () => []),
    getSongsByGenre: vi.fn(async () => []),
    search3: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    getStarred2: vi.fn(async () => ({ song: [], album: [], artist: [] })),
    star: vi.fn(async () => undefined),
    unstar: vi.fn(async () => undefined),
    scrobble: vi.fn(async () => undefined),
    coverArtUrl: vi.fn((id) => `http://music.test/cover/${id}`),
    streamUrl: vi.fn((id) => `http://music.test/stream/${id}`),
    ...overrides,
  };
}

describe("useNavidrome", () => {
  it("keeps successful home sections when one request fails", async () => {
    const nextClient = navidromeClient({
      getAlbumList2: vi.fn(async (type) => {
        if (type === "newest") throw new Error("newest unavailable");
        return [{ id: type, name: type }];
      }),
      getGenres: vi.fn(async () => [{ value: "Rock", albumCount: 1, songCount: 4 }]),
    });
    const { result } = renderHook(() =>
      useNavidrome({ clientFactory: () => nextClient }),
    );

    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "password", username: "ada", password: "secret" },
      });
    });

    expect(result.current.serverInfo?.status).toBe("ok");
    expect(result.current.home.random).toHaveLength(1);
    expect(result.current.home.frequent).toHaveLength(1);
    expect(result.current.home.genres).toHaveLength(1);
    expect(result.current.home.warnings.newest).toMatch(/unavailable/i);
  });

  it("ignores a stale search response", async () => {
    let resolveFirst!: (value: { song: Track[]; album: []; artist: [] }) => void;
    let resolveSecond!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const first = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveSecond = resolve;
    });
    const nextClient = navidromeClient({
      search3: vi.fn((query) => (query === "first" ? first : second)),
    });
    const { result } = renderHook(() =>
      useNavidrome({ clientFactory: () => nextClient }),
    );
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    act(() => {
      void result.current.search("first");
      void result.current.search("second");
    });
    await act(async () => {
      resolveSecond({ song: [{ ...song, id: "second" }], album: [], artist: [] });
      await second;
    });
    await waitFor(() => expect(result.current.searchResult?.song[0]?.id).toBe("second"));
    await act(async () => {
      resolveFirst({ song: [{ ...song, id: "first" }], album: [], artist: [] });
      await first;
    });

    expect(result.current.searchResult?.song[0]?.id).toBe("second");
  });

  it("invalidates an in-flight search when the query is cleared", async () => {
    let resolveSearch!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const pending = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveSearch = resolve;
    });
    const nextClient = navidromeClient({ search3: vi.fn(() => pending) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    act(() => {
      void result.current.search("old");
      void result.current.search("");
    });
    await act(async () => {
      resolveSearch({ song: [{ ...song, id: "old" }], album: [], artist: [] });
      await pending;
    });

    expect(result.current.searchResult).toBeUndefined();
  });

  it("leaves connecting state when disconnect interrupts a pending ping", async () => {
    let resolvePing!: (value: { status: "ok"; version: string }) => void;
    const ping = new Promise<{ status: "ok"; version: string }>((resolve) => {
      resolvePing = resolve;
    });
    const nextClient = navidromeClient({ ping: vi.fn(() => ping) });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    let connection!: Promise<void>;
    act(() => {
      connection = result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await waitFor(() => expect(result.current.isConnecting).toBe(true));

    act(() => result.current.disconnect());
    await act(async () => {
      resolvePing({ status: "ok", version: "1.16.1" });
      await connection;
    });

    expect(result.current.isConnecting).toBe(false);
    expect(result.current.isConnected).toBe(false);
  });

  it("rolls back only the failed favorite when mutations overlap", async () => {
    const secondTrack = { ...song, id: "song-2", title: "Signal Two" };
    let rejectFirst!: (reason: Error) => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    const nextClient = navidromeClient({
      star: vi.fn((id) => (id === song.id ? first : second)),
      getStarred2: vi
        .fn()
        .mockResolvedValueOnce({ song: [], album: [], artist: [] })
        .mockResolvedValue({ song: [{ ...secondTrack, starred: "now" }], album: [], artist: [] }),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });

    let firstMutation!: Promise<void>;
    act(() => {
      firstMutation = result.current.toggleStar(song);
    });
    await waitFor(() => expect(result.current.starredSongs.map(({ id }) => id)).toContain(song.id));
    let secondMutation!: Promise<void>;
    act(() => {
      secondMutation = result.current.toggleStar(secondTrack);
    });
    await waitFor(() => expect(result.current.starredSongs).toHaveLength(2));

    await act(async () => {
      resolveSecond();
      await secondMutation;
      rejectFirst(new Error("first failed"));
      await firstMutation;
    });

    expect(result.current.starredSongs.map(({ id }) => id)).toEqual([secondTrack.id]);
  });

  it("restores the exact starred timestamp when unstar fails", async () => {
    const originalStarred = "2024-02-03T04:05:06.000Z";
    const starredTrack = { ...song, starred: originalStarred };
    const nextClient = navidromeClient({
      search3: vi.fn(async () => ({ song: [starredTrack], album: [], artist: [] })),
      getStarred2: vi.fn(async () => ({ song: [starredTrack], album: [], artist: [] })),
      unstar: vi.fn(async () => {
        throw new Error("write failed");
      }),
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await act(async () => {
      await result.current.search("signal");
    });

    await act(async () => {
      await result.current.toggleStar(result.current.searchResult!.song[0]!);
    });

    expect(result.current.searchResult?.song[0]?.starred).toBe(originalStarred);
    expect(result.current.starredSongs[0]?.starred).toBe(originalStarred);
  });

  it("does not let an older favorite refresh erase a newer pending mutation", async () => {
    const secondTrack = { ...song, id: "song-2", title: "Signal Two" };
    let resolveOldRefresh!: (value: { song: Track[]; album: []; artist: [] }) => void;
    const oldRefresh = new Promise<{ song: Track[]; album: []; artist: [] }>((resolve) => {
      resolveOldRefresh = resolve;
    });
    let resolveSecondWrite!: () => void;
    const secondWrite = new Promise<void>((resolve) => {
      resolveSecondWrite = resolve;
    });
    const getStarred2 = vi
      .fn()
      .mockResolvedValueOnce({ song: [], album: [], artist: [] })
      .mockImplementationOnce(() => oldRefresh)
      .mockResolvedValue({
        song: [markAsStarred(song), markAsStarred(secondTrack)],
        album: [],
        artist: [],
      });
    const nextClient = navidromeClient({
      star: vi.fn((id) => (id === song.id ? Promise.resolve() : secondWrite)),
      getStarred2,
    });
    const { result } = renderHook(() => useNavidrome({ clientFactory: () => nextClient }));
    await act(async () => {
      await result.current.connect({
        serverUrl: "http://music.test",
        auth: { type: "apiKey", apiKey: "key" },
      });
    });
    await act(async () => {
      await result.current.toggleStar(song);
    });
    await waitFor(() => expect(getStarred2).toHaveBeenCalledTimes(2));
    let pendingSecond!: Promise<void>;
    act(() => {
      pendingSecond = result.current.toggleStar(secondTrack);
    });
    await waitFor(() => expect(result.current.starredSongs).toHaveLength(2));

    try {
      await act(async () => {
        resolveOldRefresh({ song: [markAsStarred(song)], album: [], artist: [] });
        await oldRefresh;
      });
      expect(result.current.starredSongs.map(({ id }) => id)).toContain(secondTrack.id);
    } finally {
      await act(async () => {
        resolveSecondWrite();
        await pendingSecond;
      });
    }
  });
});

function markAsStarred(track: Track): Track {
  return { ...track, starred: "2024-01-01T00:00:00.000Z" };
}
