import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type Dispatch } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AlbumShelf } from "./components/AlbumShelf";
import { HomeView } from "./components/HomeView";
import { PlayerDock } from "./components/PlayerDock";
import { QueuePanel } from "./components/QueuePanel";
import { SearchView } from "./components/SearchView";
import { TrackList } from "./components/TrackList";
import * as audioPlayerModule from "./hooks/useAudioPlayer";
import type { AudioPlayerController } from "./hooks/useAudioPlayer";
import * as navidromeModule from "./hooks/useNavidrome";
import type { NavidromeController } from "./hooks/useNavidrome";
import type { QueueAction, QueueState } from "./state/playerQueue";
import type { Album, Artist, Track } from "./types";

const track: Track = {
  id: "track-1",
  title: "Blue Hour",
  artist: "Signal Club",
  album: "Night Signals",
  duration: 245,
};

const album: Album = {
  id: "album-1",
  name: "Night Signals",
  artist: "Signal Club",
  songCount: 8,
};

const artist: Artist = {
  id: "artist-1",
  name: "Signal Club",
  albumCount: 2,
};

function playerController(): AudioPlayerController {
  return {
    audioRef: { current: null },
    isPlaying: false,
    progress: 12,
    duration: 245,
    volume: 0.8,
    muted: false,
    error: undefined,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    toggle: vi.fn(async () => undefined),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    toggleMute: vi.fn(),
    reset: vi.fn(),
    handleTimeUpdate: vi.fn(),
    handleLoadedMetadata: vi.fn(),
    handleEnded: vi.fn(),
    handleError: vi.fn(),
  };
}

function connectedController(
  overrides: Partial<NavidromeController> = {},
): NavidromeController {
  return {
    client: {} as NonNullable<NavidromeController["client"]>,
    mediaUrls: {
      cover: () => "",
      stream: () => "",
      clear: vi.fn(),
    },
    serverInfo: { status: "ok", version: "1.16.1", openSubsonic: true },
    isConnected: true,
    isConnecting: false,
    connectionError: undefined,
    rememberedServerUrl: "",
    rememberedUsername: "",
    home: {
      newest: [],
      random: [],
      frequent: [],
      genres: [],
      warnings: {},
      loading: false,
    },
    starredSongs: [],
    starredAlbums: [],
    starredArtists: [],
    starredIds: new Set<string>(),
    isTrackStarred: (candidate) => Boolean(candidate.starred),
    searchResult: undefined,
    searchQuery: "",
    isSearching: false,
    searchError: undefined,
    activeAlbum: undefined,
    activeArtist: undefined,
    activeGenre: undefined,
    genreTracks: [],
    detailLoading: false,
    detailError: undefined,
    mutationError: undefined,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    refreshHome: vi.fn(async () => undefined),
    retryHomeSection: vi.fn(async () => undefined),
    search: vi.fn(async () => undefined),
    openAlbum: vi.fn(async () => undefined),
    openArtist: vi.fn(async () => undefined),
    openGenre: vi.fn(async () => undefined),
    clearDetail: vi.fn(),
    toggleStar: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("application shell", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  it("starts at a dedicated connection gate", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /connect your archive/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/server address/i)).toBeRequired();
  });

  it("does not persist a password field value", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/^password$/i), "top-secret");

    expect(window.localStorage.getItem("mn56.password")).toBeNull();
    expect(Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.getItem(window.localStorage.key(index) ?? ""),
    )).not.toContain("top-secret");
  });
});

describe("accessible collection actions", () => {
  it("gives every track row contextual play, queue, and star buttons", async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    const onAddToQueue = vi.fn();
    const onToggleStar = vi.fn();

    render(
      <TrackList
        title="Songs"
        tracks={[track]}
        starredIds={new Set()}
        onPlay={onPlay}
        onAddToQueue={onAddToQueue}
        onToggleStar={onToggleStar}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Play Blue Hour" }));
    await user.click(screen.getByRole("button", { name: "Add to queue: Blue Hour" }));
    await user.click(screen.getByRole("button", { name: "Star Blue Hour" }));

    expect(onPlay).toHaveBeenCalledWith(track, 0, [track]);
    expect(onAddToQueue).toHaveBeenCalledWith(track);
    expect(onToggleStar).toHaveBeenCalledWith(track);
  });

  it("opens album, artist, and genre details from real buttons", async () => {
    const user = userEvent.setup();
    const onOpenAlbum = vi.fn();
    const onOpenArtist = vi.fn();
    const onOpenGenre = vi.fn();

    const { rerender } = render(
      <AlbumShelf
        title="Newest transmissions"
        albums={[album]}
        coverUrl={() => ""}
        onOpenAlbum={onOpenAlbum}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open album Night Signals" }));
    expect(onOpenAlbum).toHaveBeenCalledWith(album);

    rerender(
      <SearchView
        query="signal"
        result={{ song: [], album: [], artist: [artist] }}
        loading={false}
        starredIds={new Set()}
        coverUrl={() => ""}
        onSearch={vi.fn()}
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
        onPlay={vi.fn()}
        onAddToQueue={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));
    expect(onOpenArtist).toHaveBeenCalledWith(artist);

    rerender(
      <HomeView
        home={{
          newest: [],
          random: [],
          frequent: [],
          genres: [{ value: "Electronic", songCount: 12 }],
          warnings: {},
          loading: false,
        }}
        coverUrl={() => ""}
        onOpenAlbum={onOpenAlbum}
        onOpenGenre={onOpenGenre}
        onRetry={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Open genre Electronic" }));
    expect(onOpenGenre).toHaveBeenCalledWith("Electronic");
  });

  it("routes every home section retry with its own section key", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <HomeView
        home={{
          newest: [],
          random: [],
          frequent: [],
          genres: [],
          warnings: {
            newest: "newest failed",
            random: "random failed",
            frequent: "frequent failed",
            genres: "genres failed",
          },
          loading: false,
        }}
        coverUrl={() => ""}
        onOpenAlbum={vi.fn()}
        onOpenGenre={vi.fn()}
        onRetry={onRetry}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Retry Newest transmissions" }));
    await user.click(screen.getByRole("button", { name: "Retry Random access" }));
    await user.click(screen.getByRole("button", { name: "Retry Frequent frequencies" }));
    await user.click(screen.getByRole("button", { name: "Retry genres" }));

    expect(onRetry.mock.calls).toEqual([
      ["newest"],
      ["random"],
      ["frequent"],
      ["genres"],
    ]);
  });

  it("does not show the empty genres retry while that section is loading", () => {
    render(
      <HomeView
        home={{
          newest: [],
          random: [],
          frequent: [],
          genres: [],
          warnings: {},
          loading: false,
          loadingSections: { genres: true },
        }}
        coverUrl={() => ""}
        onOpenAlbum={vi.fn()}
        onOpenGenre={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading genre channels…")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Refresh genres" })).not.toBeInTheDocument();
  });
});

describe("compact player interactions", () => {
  it("offers accessible favorite controls in both compact and expanded now playing", async () => {
    const user = userEvent.setup();
    const onToggleStar = vi.fn();

    render(
      <PlayerDock
        currentTrack={track}
        player={playerController()}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        isStarred={false}
        onToggleStar={onToggleStar}
        onToggleQueue={vi.fn()}
      />,
    );

    const compactFavorite = screen.getByRole("button", { name: "Star Blue Hour" });
    expect(compactFavorite).toHaveAttribute("aria-pressed", "false");
    await user.click(compactFavorite);

    await user.click(screen.getByRole("button", { name: "Open now playing" }));
    const expanded = screen.getByRole("dialog", { name: "Now playing" });
    const expandedFavorite = within(expanded).getByRole("button", { name: "Star Blue Hour" });
    expect(expandedFavorite).toHaveAttribute("aria-pressed", "false");
    await user.click(expandedFavorite);

    expect(onToggleStar).toHaveBeenCalledTimes(2);
  });

  it("expands now playing, reports queue expansion, and closes on Escape", async () => {
    const user = userEvent.setup();
    const player = playerController();

    render(
      <PlayerDock
        currentTrack={track}
        player={player}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        onToggleQueue={vi.fn()}
      />,
    );

    const expand = screen.getByRole("button", { name: "Open now playing" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Open playback queue" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Now playing" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close now playing" })).toBeEnabled();

    await user.keyboard("{Escape}");
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Now playing" })).not.toBeInTheDocument();
  });

  it("traps focus in expanded now playing and restores the expand trigger", async () => {
    const user = userEvent.setup();

    render(
      <PlayerDock
        currentTrack={track}
        player={playerController()}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        isStarred={false}
        onToggleStar={vi.fn()}
        onToggleQueue={vi.fn()}
      />,
    );

    const expand = screen.getByRole("button", { name: "Open now playing" });
    await user.click(expand);
    const dialog = screen.getByRole("dialog", { name: "Now playing" });
    const close = within(dialog).getByRole("button", { name: "Close now playing" });
    const openQueue = within(dialog).getByRole("button", { name: "Open queue" });
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(openQueue).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Now playing" })).not.toBeInTheDocument();
    expect(expand).toHaveFocus();
  });

  it("provides an operable queue drawer with Escape and a close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const dispatch = vi.fn() as Dispatch<QueueAction>;
    const state: QueueState = {
      tracks: [track],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    };

    render(
      <QueuePanel
        queuePanelId="playback-queue"
        state={state}
        open
        onClose={onClose}
        onSelectAndPlay={vi.fn()}
        dispatch={dispatch}
      />,
    );

    const close = screen.getByRole("button", { name: "Close playback queue" });
    close.focus();
    expect(close).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus into the open queue, traps it, and restores the trigger", async () => {
    const user = userEvent.setup();
    const state: QueueState = {
      tracks: [track],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    };

    function QueueFocusHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open test queue
          </button>
          <QueuePanel
            queuePanelId="focus-playback-queue"
            state={state}
            open={open}
            onClose={() => setOpen(false)}
            onSelectAndPlay={vi.fn()}
            dispatch={vi.fn() as Dispatch<QueueAction>}
          />
        </>
      );
    }

    render(<QueueFocusHarness />);
    const trigger = screen.getByRole("button", { name: "Open test queue" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Playback queue" });
    const close = within(dialog).getByRole("button", { name: "Close playback queue" });
    const last = within(dialog).getByRole("button", { name: "Remove Blue Hour from queue" });
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close playback queue" }));
    expect(trigger).toHaveFocus();
  });

  it("shares the controlled queue panel id with the actual drawer", () => {
    const state: QueueState = {
      tracks: [track],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    };

    render(
      <>
        <PlayerDock
          currentTrack={track}
          player={playerController()}
          coverUrl={() => ""}
          queuePanelId="shared-playback-queue"
          queueOpen={false}
          onToggleQueue={vi.fn()}
        />
        <QueuePanel
          queuePanelId="shared-playback-queue"
          state={state}
          open={false}
          onClose={vi.fn()}
          onSelectAndPlay={vi.fn()}
          dispatch={vi.fn() as Dispatch<QueueAction>}
        />
      </>,
    );

    const toggle = screen.getByRole("button", { name: "Open playback queue" });
    expect(toggle).toHaveAttribute("aria-controls", "shared-playback-queue");
    expect(document.getElementById("shared-playback-queue")).toBe(
      screen.getByRole("complementary", { name: "Playback queue" }),
    );
  });

  it("selects a queued track through the play callback", async () => {
    const user = userEvent.setup();
    const onSelectAndPlay = vi.fn();
    const dispatch = vi.fn() as Dispatch<QueueAction>;
    const state: QueueState = {
      tracks: [track],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    };

    render(
      <QueuePanel
        queuePanelId="playback-queue"
        state={state}
        open={false}
        onClose={vi.fn()}
        onSelectAndPlay={onSelectAndPlay}
        dispatch={dispatch}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Play Blue Hour from queue" }));

    expect(onSelectAndPlay).toHaveBeenCalledWith(0);
    expect(dispatch).not.toHaveBeenCalledWith({ type: "select", index: 0 });
  });

  it("hands off from full now playing to one queue modal and one Escape owner", async () => {
    const user = userEvent.setup();
    const onQueueClose = vi.fn();
    const state: QueueState = {
      tracks: [track],
      currentIndex: 0,
      repeatMode: "off",
      shuffle: false,
    };

    function PlayerQueueHarness() {
      const [queueOpen, setQueueOpen] = useState(false);
      return (
        <>
          <PlayerDock
            currentTrack={track}
            player={playerController()}
            coverUrl={() => ""}
            queuePanelId="coordinated-playback-queue"
            queueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen((value) => !value)}
          />
          <QueuePanel
            queuePanelId="coordinated-playback-queue"
            state={state}
            open={queueOpen}
            onClose={() => {
              onQueueClose();
              setQueueOpen(false);
            }}
            onSelectAndPlay={vi.fn()}
            dispatch={vi.fn() as Dispatch<QueueAction>}
          />
        </>
      );
    }

    render(<PlayerQueueHarness />);
    await user.click(screen.getByRole("button", { name: "Open now playing" }));
    await user.click(screen.getByRole("button", { name: "Open queue" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog", { name: "Playback queue" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onQueueClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open now playing" })).toHaveFocus();
  });
});

describe("state coordination regressions", () => {
  it("wires the current queue track through mutation-aware favorite state", async () => {
    const user = userEvent.setup();
    const staleQueueTrack = {
      ...track,
      starred: "2024-02-03T04:05:06.000Z",
    };
    const controller = connectedController({
      starredSongs: [staleQueueTrack],
      starredIds: new Set(),
      isTrackStarred: vi.fn(() => false),
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Play Blue Hour" }));

    const playback = screen.getByRole("region", { name: "Player and queue" });
    await user.click(within(playback).getByRole("button", { name: "Star Blue Hour" }));

    expect(controller.isTrackStarred).toHaveBeenCalledWith(staleQueueTrack);
    expect(controller.toggleStar).toHaveBeenCalledWith(staleQueueTrack);
    expect(screen.getByText("Added Blue Hour to favorites")).toBeInTheDocument();
  });

  it("connects home and favorites retries to only their requested sections", async () => {
    const user = userEvent.setup();
    const controller = connectedController({
      home: {
        newest: [],
        random: [],
        frequent: [],
        genres: [],
        warnings: { newest: "newest failed", starred: "favorites failed" },
        loading: false,
      },
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Retry Newest transmissions" }));
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Retry favorites" }));

    expect(controller.retryHomeSection).toHaveBeenNthCalledWith(1, "newest");
    expect(controller.retryHomeSection).toHaveBeenNthCalledWith(2, "starred");
    expect(controller.refreshHome).not.toHaveBeenCalled();
  });

  it("shows only the favorites target as loading during a starred retry", async () => {
    const user = userEvent.setup();
    const controller = connectedController({
      home: {
        newest: [],
        random: [],
        frequent: [],
        genres: [],
        warnings: {},
        loading: false,
        loadingSections: { starred: true },
      },
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));

    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
    expect(screen.getByText("Loading favorites…")).toHaveAttribute("role", "status");
  });

  it("replaces the queue when the same track is clicked from a new result list", async () => {
    const user = userEvent.setup();
    const secondTrack = { ...track, id: "track-2", title: "Afterglow" };
    const controller = connectedController({
      starredSongs: [track],
      starredIds: new Set([track.id]),
      searchQuery: "blue",
      searchResult: { song: [track, secondTrack], album: [], artist: [] },
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Play Blue Hour" }));

    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Play Blue Hour" }));

    expect(screen.getAllByRole("button", { name: /^Play .* from queue$/i })).toHaveLength(2);
  });

  it("starts playback when a queue row labeled Play is selected", async () => {
    const user = userEvent.setup();
    const controller = connectedController({
      starredSongs: [track],
      starredIds: new Set([track.id]),
    });
    const player = playerController();
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(player);

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Add to queue: Blue Hour" }));
    await user.click(screen.getByRole("button", { name: "Play Blue Hour from queue" }));

    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(1));
  });

  it("reloads an artist detail when backing out of its album", async () => {
    const user = userEvent.setup();
    const artistWithAlbums: Artist = { ...artist, album: [album] };
    const albumWithSongs: Album = { ...album, song: [track] };
    const controller = connectedController({ starredArtists: [artist] });
    controller.clearDetail = vi.fn(() => {
      controller.activeAlbum = undefined;
      controller.activeArtist = undefined;
      controller.activeGenre = undefined;
    });
    controller.openArtist = vi.fn(async () => {
      controller.activeAlbum = undefined;
      controller.activeArtist = artistWithAlbums;
      controller.activeGenre = undefined;
    });
    controller.openAlbum = vi.fn(async () => {
      controller.activeAlbum = albumWithSongs;
      controller.activeArtist = undefined;
      controller.activeGenre = undefined;
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockImplementation(() => controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));
    await screen.findByRole("heading", { name: "Signal Club", level: 1 });
    await user.click(screen.getByRole("button", { name: "Open album Night Signals" }));
    await screen.findByRole("heading", { name: "Night Signals", level: 1 });
    await user.click(screen.getByRole("button", { name: "Back to previous view" }));

    expect(controller.openArtist).toHaveBeenCalledTimes(2);
    expect(controller.openArtist).toHaveBeenLastCalledWith("artist-1");
    expect(await screen.findByRole("heading", { name: "Signal Club", level: 1 })).toBeInTheDocument();
  });

  it("does not relabel stale results as a repeated search", async () => {
    const oldResult = { song: [track], album: [], artist: [] };
    const commonProps = {
      starredIds: new Set<string>(),
      coverUrl: () => "",
      onSearch: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenArtist: vi.fn(),
      onPlay: vi.fn(),
      onAddToQueue: vi.fn(),
      onToggleStar: vi.fn(),
    };
    const { rerender } = render(
      <SearchView query="blue" result={oldResult} loading={false} {...commonProps} />,
    );
    expect(screen.getByText("Blue Hour")).toBeInTheDocument();

    rerender(<SearchView query="red" result={oldResult} loading {...commonProps} />);
    await waitFor(() =>
      expect(screen.getByText(/Searching the archive for red/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText("Blue Hour")).not.toBeInTheDocument();
    expect(screen.queryByText(/results for “red”/i)).not.toBeInTheDocument();

    rerender(
      <SearchView
        query="red"
        result={oldResult}
        loading={false}
        error="Archive offline"
        {...commonProps}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Archive offline");
    expect(screen.queryByText("Blue Hour")).not.toBeInTheDocument();
  });
});
