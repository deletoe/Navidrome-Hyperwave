import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AudioPlayerController } from "../hooks/useAudioPlayer";
import type { TrackLyricsController } from "../hooks/useTrackLyrics";
import type { Track } from "../types";
import { NowPlayingView } from "./NowPlayingView";

const track: Track = {
  id: "song-1",
  title: "Blue Hour",
  artist: "Signal Club",
  artistId: "artist-1",
  album: "Night Signals",
  duration: 245,
};

function player(): AudioPlayerController {
  return {
    audioRef: { current: null },
    isPlaying: true,
    progress: 12,
    duration: 245,
    volume: 0.8,
    muted: false,
    error: undefined,
    visualizer: { supported: true, status: "ready", activate: vi.fn(), readFrame: vi.fn() },
    audioProcessing: { supported: true, status: "ready", activate: vi.fn() },
    play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), next: vi.fn(), previous: vi.fn(),
    seek: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(), reset: vi.fn(),
    handleTimeUpdate: vi.fn(), handleLoadedMetadata: vi.fn(), handleEnded: vi.fn(), handleError: vi.fn(),
  };
}

function lyrics(): TrackLyricsController {
  const entry = {
    synced: true,
    line: [
      { start: 1_000, value: "First light" },
      { start: 12_000, value: "Blue hour" },
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
  };
}

describe("NowPlayingView", () => {
  it("is a navigable page with persistent transport controls and a lyrics surface", async () => {
    const user = userEvent.setup();
    const activePlayer = player();
    const activeLyrics = lyrics();
    const onBack = vi.fn();
    render(
      <NowPlayingView
        track={track}
        player={activePlayer}
        lyrics={activeLyrics}
        coverUrl={() => "/cover.jpg"}
        isStarred={false}
        queueOpen={false}
        visualizerMode="hybrid"
        onBack={onBack}
        onToggleStar={vi.fn()}
        onOpenArtist={vi.fn()}
        onToggleQueue={vi.fn()}
        onOpenAudioSettings={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Blue Hour" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Now playing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show lyrics for Blue Hour" }));
    expect(activeLyrics.load).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Show album artwork for Blue Hour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seek to 0:12: Blue hour" })).toHaveAttribute("aria-current", "true");
    expect(within(screen.getByLabelText("Playback controls")).getByRole("button", { name: "Pause playback" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to browsing" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
