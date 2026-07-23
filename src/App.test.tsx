import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { AudioPreferencesController } from "./hooks/useAudioPreferences";
import type { TrackLyricsController } from "./hooks/useTrackLyrics";
import * as navidromeModule from "./hooks/useNavidrome";
import type { NavidromeController } from "./hooks/useNavidrome";
import { DEFAULT_AUDIO_PREFERENCES } from "./lib/audioPreferences";
import type { QueueAction, QueueState } from "./state/playerQueue";
import type { Album, Artist, Track } from "./types";

const track: Track = {
  id: "track-1",
  title: "Blue Hour",
  artist: "Signal Club",
  artistId: "artist-1",
  album: "Night Signals",
  duration: 245,
};

const album: Album = {
  id: "album-1",
  name: "Night Signals",
  artist: "Signal Club",
  artistId: "artist-1",
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
    output: {
      supported: true,
      deviceId: "",
      label: "System default",
      devices: [],
      refreshDevices: vi.fn(async () => undefined),
      selectDevice: vi.fn(async () => undefined),
      useSystemDefault: vi.fn(async () => undefined),
    },
    visualizer: {
      supported: true,
      status: "waiting",
      error: undefined,
      activate: vi.fn(async () => undefined),
      readFrame: vi.fn(() => undefined),
    },
    audioProcessing: {
      supported: true,
      status: "off",
      error: undefined,
      activate: vi.fn(async () => undefined),
    },
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

function audioPreferencesController(): AudioPreferencesController {
  return {
    preferences: {
      ...DEFAULT_AUDIO_PREFERENCES,
      bandGains: [...DEFAULT_AUDIO_PREFERENCES.bandGains],
    },
    setEqEnabled: vi.fn(),
    setPreampDb: vi.fn(),
    setBandGain: vi.fn(),
    applyPreset: vi.fn(),
    setStereoBlend: vi.fn(),
    reset: vi.fn(),
  };
}

function lyricsController(
  overrides: Partial<TrackLyricsController> = {},
): TrackLyricsController {
  const entry = {
    synced: true,
    line: [
      { start: 1_000, value: "Night turns blue" },
      { start: 12_000, value: "Follow the signal" },
    ],
  };
  return {
    status: "ready",
    entries: [entry],
    selected: entry,
    selectedIndex: 0,
    load: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    select: vi.fn(),
    ...overrides,
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
    artistDirectory: undefined,
    artistsLoading: false,
    artistsError: undefined,
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
    activeArtistTracks: [],
    artistTracksLoading: false,
    artistTracksWarning: undefined,
    activeGenre: undefined,
    genreTracks: [],
    detailLoading: false,
    detailError: undefined,
    mutationError: undefined,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    refreshHome: vi.fn(async () => undefined),
    loadArtists: vi.fn(async () => undefined),
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

function installMemoryStorage(): void {
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
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  installMemoryStorage();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("application shell", () => {
  beforeEach(() => {
    installMemoryStorage();
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

  it("uses the reconciled favorite set instead of a stale track flag", () => {
    const staleTrack = { ...track, starred: "2026-07-13T00:00:00.000Z" };
    const { rerender } = render(
      <TrackList
        title="Songs"
        tracks={[staleTrack]}
        starredIds={new Set()}
        onPlay={vi.fn()}
        onAddToQueue={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Star Blue Hour" })).toBeInTheDocument();
    rerender(
      <TrackList
        title="Songs"
        tracks={[staleTrack]}
        starredIds={new Set([staleTrack.id])}
        onPlay={vi.fn()}
        onAddToQueue={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Unstar Blue Hour" })).toBeInTheDocument();
  });

  it("opens an identified artist from a track without triggering playback", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();
    const onPlay = vi.fn();

    render(
      <TrackList
        title="Songs"
        tracks={[track]}
        starredIds={new Set()}
        onPlay={onPlay}
        onAddToQueue={vi.fn()}
        onToggleStar={vi.fn()}
        onOpenArtist={onOpenArtist}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));

    expect(onOpenArtist).toHaveBeenCalledWith({ id: "artist-1", name: "Signal Club" });
    expect(onPlay).not.toHaveBeenCalled();
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
  it("uses the compact track surface as the return path to the player page", async () => {
    const user = userEvent.setup();
    const onOpenNowPlaying = vi.fn();
    const { container, rerender } = render(
      <PlayerDock
        currentTrack={track}
        player={playerController()}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        onToggleQueue={vi.fn()}
        onOpenNowPlaying={onOpenNowPlaying}
      />,
    );

    expect(screen.queryByRole("button", { name: "Open now playing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Return to now playing: Blue Hour" }));
    expect(onOpenNowPlaying).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("audio")).toHaveLength(1);

    rerender(
      <PlayerDock
        currentTrack={track}
        player={playerController()}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        pageOpen
        onToggleQueue={vi.fn()}
        onOpenNowPlaying={onOpenNowPlaying}
      />,
    );
    expect(container.querySelector(".player-dock")).toHaveClass("player-dock--page-open");
    expect(container.querySelectorAll("audio")).toHaveLength(1);
  });

  it("exposes playback and track state on the stable player dock", () => {
    const playing = playerController();
    playing.isPlaying = true;
    const paused = playerController();
    const { container, rerender } = render(
      <PlayerDock
        currentTrack={track}
        player={playing}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        onToggleQueue={vi.fn()}
      />,
    );

    expect(container.querySelector(".player-dock")).toHaveAttribute(
      "data-playing",
      "true",
    );
    expect(container.querySelector(".player-dock")).toHaveAttribute(
      "data-has-track",
      "true",
    );
    expect(container.querySelector("audio")).toHaveAttribute("crossorigin", "anonymous");

    rerender(
      <PlayerDock
        player={paused}
        coverUrl={() => ""}
        queuePanelId="playback-queue"
        queueOpen={false}
        onToggleQueue={vi.fn()}
      />,
    );

    expect(container.querySelector(".player-dock")).toHaveAttribute(
      "data-playing",
      "false",
    );
    expect(container.querySelector(".player-dock")).toHaveAttribute(
      "data-has-track",
      "false",
    );
  });

  it("opens audio tuning as a separate full-screen dialog and restores its trigger", async () => {
    const user = userEvent.setup();
    const view = render(
      <div className="app">
        <PlayerDock
          currentTrack={track}
          player={playerController()}
          coverUrl={() => ""}
          queuePanelId="playback-queue"
          queueOpen={false}
          onToggleQueue={vi.fn()}
          audioSettings={audioPreferencesController()}
        />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Open equalizer and stereo fusion" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Equalizer and stereo fusion" });
    expect(dialog).toHaveClass("audio-tuning-dialog");
    expect(dialog.parentElement).toBe(view.container.firstElementChild);
    expect(screen.queryByRole("dialog", { name: "Now playing" })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole("slider")).toHaveLength(12);
    const close = within(dialog).getByRole("button", { name: "Close audio settings" });
    const fusion = within(dialog).getByRole("slider", { name: "Stereo fusion" });
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(fusion).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Equalizer and stereo fusion" }))
      .not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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
    const queuedTrack = screen.getByRole("button", { name: "Play Blue Hour from queue" });
    const fallbackArtwork = queuedTrack.querySelector(".queue-list__artwork");
    const queueIndex = queuedTrack.querySelector(".queue-list__index");
    expect(fallbackArtwork).toHaveClass("artwork--fallback");
    expect(fallbackArtwork).not.toHaveClass("queue-list__index");
    expect(queueIndex).toHaveTextContent("01");
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

});

describe("state coordination regressions", () => {
  it("enters the player page on play, returns to browsing, and reopens from the compact bar", async () => {
    const user = userEvent.setup();
    const controller = connectedController({ starredSongs: [track] });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    const audio = document.querySelector(".player-dock audio");
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Play Blue Hour" }));

    expect(document.querySelector(".app")).toHaveAttribute("data-view", "nowPlaying");
    expect(screen.getByRole("heading", { name: "Blue Hour" })).toBeInTheDocument();
    expect(document.querySelector(".player-dock")).toHaveClass("player-dock--page-open");
    expect(document.querySelector(".player-dock audio")).toBe(audio);

    await user.click(screen.getByRole("button", { name: "Back to browsing" }));
    expect(document.querySelector(".app")).toHaveAttribute("data-view", "favorites");
    expect(screen.getByRole("heading", { name: "Your favorites" })).toBeInTheDocument();
    expect(document.querySelector(".player-dock")).not.toHaveClass("player-dock--page-open");

    await user.click(screen.getByRole("button", { name: "Return to now playing: Blue Hour" }));
    expect(document.querySelector(".app")).toHaveAttribute("data-view", "nowPlaying");
    expect(document.querySelector(".player-dock audio")).toBe(audio);
  });

  it("loads the complete artist index on demand from primary navigation", async () => {
    const user = userEvent.setup();
    const controller = connectedController();
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Artists" }));

    expect(controller.loadArtists).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Artists" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(document.querySelector(".app")).toHaveAttribute("data-view", "artists");
  });

  it("opens one artist with every album and aggregated song collection", async () => {
    const user = userEvent.setup();
    const artistWithAlbums: Artist = { ...artist, album: [album] };
    const controller = connectedController({
      artistDirectory: {
        ignoredArticles: "The An A",
        index: [{ name: "S", artist: [artist] }],
      },
    });
    controller.openArtist = vi.fn(async () => {
      controller.activeArtist = artistWithAlbums;
      controller.activeArtistTracks = [track];
      controller.activeAlbum = undefined;
      controller.activeGenre = undefined;
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockImplementation(() => controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Artists" }));
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));

    expect(await screen.findByRole("heading", { name: "Signal Club", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Signal Club albums" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All Signal Club songs" })).toBeInTheDocument();
    expect(screen.getByText("2 albums · 1 song")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play all songs" }));
    expect(screen.getByRole("button", { name: "Play Blue Hour from queue" })).toBeInTheDocument();
  });

  it("preserves the artist filter through detail navigation and focuses the new main view", async () => {
    const user = userEvent.setup();
    const artistWithAlbums: Artist = { ...artist, album: [album] };
    const controller = connectedController({
      artistDirectory: { index: [{ name: "S", artist: [artist] }] },
    });
    controller.openArtist = vi.fn(async () => {
      controller.activeArtist = artistWithAlbums;
      controller.activeArtistTracks = [track];
    });
    controller.clearDetail = vi.fn(() => {
      controller.activeArtist = undefined;
      controller.activeArtistTracks = [];
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockImplementation(() => controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Artists" }));
    const filter = screen.getByRole("searchbox", { name: "Filter artists" });
    await user.type(filter, "signal");
    const main = document.getElementById("main-content") as HTMLElement;
    main.scrollTop = 320;
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));

    expect(await screen.findByRole("heading", { name: "Signal Club", level: 1 })).toBeInTheDocument();
    expect(main).toHaveFocus();
    expect(main.scrollTop).toBe(0);
    await user.click(screen.getByRole("button", { name: "Back to previous view" }));
    expect(screen.getByRole("searchbox", { name: "Filter artists" })).toHaveValue("signal");
    expect(main.scrollTop).toBe(320);
  });

  it("does not add a duplicate history entry when the current artist is opened again", async () => {
    const user = userEvent.setup();
    const artistWithAlbums: Artist = { ...artist, album: [album] };
    const controller = connectedController({
      artistDirectory: { index: [{ name: "S", artist: [artist] }] },
    });
    controller.openArtist = vi.fn(async () => {
      controller.activeArtist = artistWithAlbums;
      controller.activeArtistTracks = [track];
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockImplementation(() => controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Artists" }));
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));
    await screen.findByRole("heading", { name: "All Signal Club songs" });
    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));

    expect(controller.openArtist).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Back to previous view" }));
    expect(screen.getByRole("searchbox", { name: "Filter artists" })).toBeInTheDocument();
  });

  it("forces a fresh album request when retrying a detail", async () => {
    const user = userEvent.setup();
    const controller = connectedController({
      starredAlbums: [album],
      detailError: "The cached album is incomplete",
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(screen.getByRole("button", { name: "Open album Night Signals" }));
    await user.click(screen.getByRole("button", { name: "Retry details" }));

    expect(controller.openAlbum).toHaveBeenNthCalledWith(1, "album-1");
    expect(controller.openAlbum).toHaveBeenNthCalledWith(2, "album-1", true);
  });

  it("connects Studio preferences without remounting the visualizer stage", async () => {
    const user = userEvent.setup();
    const electronic = {
      ...track,
      id: "studio-electronic",
      title: "Studio Circuit",
      genre: "Electronic",
    };
    const controller = connectedController({
      starredSongs: [electronic],
      home: {
        newest: [],
        random: [],
        frequent: [],
        genres: [{ value: "Electronic", songCount: 12 }],
        warnings: {},
        loading: false,
      },
    });
    const player = playerController();
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(player);

    render(<App />);
    const app = document.querySelector<HTMLElement>(".app")!;
    const visualizer = document.querySelector<HTMLCanvasElement>(".audio-visualizer")!;
    const dockVisualizer = document.querySelector<HTMLCanvasElement>(
      ".player-dock__visualizer-canvas",
    )!;

    expect(document.querySelectorAll(".audio-visualizer")).toHaveLength(2);
    expect(app).toHaveAttribute("data-visualizer-mode", "hybrid");
    expect(app).toHaveAttribute("data-visualizer-status", "waiting");
    expect(visualizer).toHaveAttribute("data-active", "false");
    expect(visualizer).toHaveAttribute("data-max-fps", "30");
    expect(visualizer).toHaveAttribute("data-max-pixel-count", "1800000");
    expect(visualizer).toHaveAttribute("data-max-device-pixel-ratio", "1.25");
    expect(dockVisualizer).toHaveAttribute("data-active", "false");
    expect(dockVisualizer).toHaveAttribute("data-max-fps", "45");
    expect(dockVisualizer).toHaveAttribute("data-max-pixel-count", "500000");
    expect(dockVisualizer).toHaveAttribute("data-max-device-pixel-ratio", "1.5");

    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Play Studio Circuit" }),
    );
    expect(player.visualizer.activate).toHaveBeenCalledOnce();
    expect(app).toHaveAttribute("data-theme", "cyber");

    await user.click(screen.getByRole("button", { name: "Studio" }));
    expect(screen.getByRole("heading", { name: "Theme studio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Studio" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Theme for Electronic" }), "rock");
    expect(app).toHaveAttribute("data-theme", "rock");
    expect(document.querySelector(".audio-visualizer")).toBe(visualizer);
    expect(document.querySelector(".player-dock__visualizer-canvas")).toBe(dockVisualizer);

    fireEvent.change(screen.getByRole("slider", { name: "Theme intensity" }), {
      target: { value: "37" },
    });
    expect(app.style.getPropertyValue("--visual-intensity")).toBe("0.37");

    await user.click(screen.getByRole("radio", { name: /^Particles/ }));
    expect(player.visualizer.activate).toHaveBeenCalledTimes(2);
    expect(app).toHaveAttribute("data-visualizer-mode", "particles");
    expect(visualizer).toHaveAttribute("data-mode", "particles");
    expect(dockVisualizer).toHaveAttribute("data-mode", "particles");

    await user.click(screen.getByRole("radio", { name: /Soft Bloom/ }));
    expect(app).toHaveAttribute("data-theme", "bloom");
    expect(document.querySelector(".audio-visualizer")).toBe(visualizer);
  });

  it("exposes the active view and playback state without replacing the app shell", async () => {
    const user = userEvent.setup();
    const controller = connectedController({ starredSongs: [track] });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    const app = document.querySelector(".app");
    const shell = document.querySelector(".app-shell");
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    await user.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Play Blue Hour" }),
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(document.querySelector(".app")).toBe(app);
    expect(document.querySelector(".app-shell")).toBe(shell);
    expect(app).toHaveAttribute("data-layout", "workstation");
    expect(app).toHaveAttribute("data-transition", "refract");
    expect(app).toHaveAttribute("data-view", "search");
    expect(app).toHaveAttribute("data-playing", "false");
    expect(app).toHaveAttribute("data-has-track", "true");
    expect(document.querySelectorAll(".theme-burst")).toHaveLength(1);
  });

  it("increments the burst sequence only when the resolved personality changes", async () => {
    const user = userEvent.setup();
    const circuitOne = { ...track, id: "cyber-1", title: "Circuit One", genre: "Electronic" };
    const circuitTwo = { ...track, id: "cyber-2", title: "Circuit Two", genre: "Techno" };
    const riot = { ...track, id: "rock-1", title: "Riot Signal", genre: "Rock" };
    const controller = connectedController({
      starredSongs: [circuitOne, circuitTwo, riot],
    });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    expect(document.querySelector(".theme-burst")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Favorites" }));

    const main = within(screen.getByRole("main"));
    await user.click(main.getByRole("button", { name: "Play Circuit One" }));
    expect(document.querySelector(".theme-burst")).toHaveAttribute("data-sequence", "1");
    await user.click(main.getByRole("button", { name: "Back to browsing" }));

    await user.click(main.getByRole("button", { name: "Play Circuit Two" }));
    expect(document.querySelector(".theme-burst")).toHaveAttribute("data-sequence", "1");
    await user.click(main.getByRole("button", { name: "Back to browsing" }));

    await user.click(main.getByRole("button", { name: "Play Riot Signal" }));
    expect(document.querySelector(".theme-burst")).toHaveAttribute("data-sequence", "2");
  });

  it("preserves the shell and audio node across player-page theme transitions", async () => {
    const user = userEvent.setup();
    const cyber = { ...track, id: "cyber-stable", title: "Night Circuit", genre: "Electronic" };
    const rock = { ...track, id: "rock-stable", title: "Live Wire", genre: "Rock" };
    const controller = connectedController({ starredSongs: [cyber, rock] });
    vi.spyOn(navidromeModule, "useNavidrome").mockReturnValue(controller);
    vi.spyOn(audioPlayerModule, "useAudioPlayer").mockReturnValue(playerController());

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Favorites" }));
    const main = within(screen.getByRole("main"));
    await user.click(main.getByRole("button", { name: "Play Night Circuit" }));

    const app = document.querySelector<HTMLElement>(".app")!;
    const shell = document.querySelector<HTMLElement>(".app-shell")!;
    const playerDock = document.querySelector<HTMLElement>(".player-dock")!;
    const audio = playerDock.querySelector<HTMLAudioElement>("audio")!;
    const oldBurst = document.querySelector<HTMLElement>(".theme-burst")!;
    expect(app).toHaveAttribute("data-theme", "cyber");
    expect(app).toHaveAttribute("data-view", "nowPlaying");

    await user.click(main.getByRole("button", { name: "Back to browsing" }));
    fireEvent.click(main.getByRole("button", { name: "Play Live Wire" }));
    await waitFor(() => expect(app).toHaveAttribute("data-theme", "rock"));

    const newBurst = document.querySelector<HTMLElement>(".theme-burst")!;
    expect(document.querySelector(".app")).toBe(app);
    expect(document.querySelector(".app-shell")).toBe(shell);
    expect(document.querySelector(".player-dock")).toBe(playerDock);
    expect(playerDock.querySelector("audio")).toBe(audio);
    expect(screen.getByRole("heading", { name: "Live Wire" })).toBeInTheDocument();
    expect(app).toHaveAttribute("data-view", "nowPlaying");
    expect(document.querySelectorAll(".theme-burst")).toHaveLength(1);
    expect(newBurst).not.toBe(oldBurst);
    expect(oldBurst).not.toBeInTheDocument();
  });

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

    await user.click(screen.getByRole("button", { name: "Star Blue Hour" }));

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
