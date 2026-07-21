import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackLyricsController } from "../hooks/useTrackLyrics";
import type { StructuredLyrics, Track } from "../types";
import { LyricsPlayer } from "./LyricsPlayer";

afterEach(cleanup);

const track: Track = {
  id: "song-1",
  title: "Blue Hour",
  artist: "Signal Club",
  album: "Night Signals",
};
const synced: StructuredLyrics = {
  lang: "eng",
  synced: true,
  line: [
    { start: 1000, value: "First light" },
    { start: 3000, value: "Blue hour" },
  ],
};

function controller(overrides: Partial<TrackLyricsController> = {}): TrackLyricsController {
  return {
    status: "ready",
    entries: [synced],
    selected: synced,
    selectedIndex: 0,
    load: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    select: vi.fn(),
    ...overrides,
  };
}

describe("LyricsPlayer", () => {
  it("highlights the current synchronized line and lets listeners seek by line", async () => {
    const user = userEvent.setup();
    const onSeek = vi.fn();
    const onShowArtwork = vi.fn();
    render(
      <LyricsPlayer
        track={track}
        artworkUrl=""
        lyrics={controller()}
        progress={3.2}
        playing
        onSeek={onSeek}
        onShowArtwork={onShowArtwork}
      />,
    );

    expect(screen.getByRole("button", { name: "Seek to 0:03: Blue hour" }))
      .toHaveAttribute("aria-current", "true");
    await user.click(screen.getByRole("button", { name: "Seek to 0:01: First light" }));
    expect(onSeek).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole("button", { name: "Show album artwork for Blue Hour" }));
    expect(onShowArtwork).toHaveBeenCalledOnce();
  });

  it("renders a language/version selector for alternate lyrics", async () => {
    const user = userEvent.setup();
    const plain: StructuredLyrics = { lang: "jpn", synced: false, line: [{ value: "青い時間" }] };
    const lyrics = controller({ entries: [synced, plain], select: vi.fn() });
    render(
      <LyricsPlayer
        track={track}
        artworkUrl=""
        lyrics={lyrics}
        progress={0}
        playing={false}
        onSeek={vi.fn()}
        onShowArtwork={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Lyrics version" }), "1");
    expect(lyrics.select).toHaveBeenCalledWith(1);
  });

  it("provides recoverable empty and error states", async () => {
    const user = userEvent.setup();
    const retry = vi.fn(async () => undefined);
    const view = render(
      <LyricsPlayer
        track={track}
        artworkUrl=""
        lyrics={controller({ status: "empty", entries: [], selected: undefined })}
        progress={0}
        playing={false}
        onSeek={vi.fn()}
        onShowArtwork={vi.fn()}
      />,
    );
    expect(screen.getByText("No lyrics for this recording")).toBeInTheDocument();

    view.rerender(
      <LyricsPlayer
        track={track}
        artworkUrl=""
        lyrics={controller({ status: "error", entries: [], selected: undefined, retry, error: "Unsupported" })}
        progress={0}
        playing={false}
        onSeek={vi.fn()}
        onShowArtwork={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Retry lyrics" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
