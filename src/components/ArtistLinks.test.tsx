import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Album, Track } from "../types";
import { ArtistLinks } from "./ArtistLinks";

afterEach(cleanup);

const track = (overrides: Partial<Track> = {}): Track => ({
  id: "track-1",
  title: "Track",
  ...overrides,
});

const album = (overrides: Partial<Album> = {}): Album => ({
  id: "album-1",
  name: "Album",
  ...overrides,
});

describe("ArtistLinks", () => {
  it("renders every identified artist as an accessible button", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();
    const { container } = render(
      <ArtistLinks
        entity={track({
          artists: [
            { id: "artist-a", name: "Alpha" },
            { id: "artist-b", name: "Beta" },
          ],
        })}
        onOpenArtist={onOpenArtist}
      />,
    );

    const alpha = screen.getByRole("button", { name: "Open artist Alpha" });
    const beta = screen.getByRole("button", { name: "Open artist Beta" });
    expect(container).toHaveTextContent("Alpha, Beta");
    await user.click(alpha);
    await user.click(beta);

    expect(onOpenArtist).toHaveBeenNthCalledWith(1, { id: "artist-a", name: "Alpha" });
    expect(onOpenArtist).toHaveBeenNthCalledWith(2, { id: "artist-b", name: "Beta" });
  });

  it("renders unlinked credits as text without an interactive role", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();
    render(
      <ArtistLinks
        entity={track({
          artists: [{ name: "Guest Voice" }, { id: "band", name: "House Band" }],
        })}
        onOpenArtist={onOpenArtist}
      />,
    );

    expect(screen.getByText("Guest Voice")).toHaveClass("artist-link--plain");
    expect(screen.queryByRole("button", { name: /Guest Voice/i })).not.toBeInTheDocument();
    await user.click(screen.getByText("Guest Voice"));
    expect(onOpenArtist).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open artist House Band" }));
    expect(onOpenArtist).toHaveBeenCalledWith({ id: "band", name: "House Band" });
  });

  it("uses artistId fallback, deduplicates entries, and preserves custom classes", () => {
    const onOpenArtist = vi.fn();
    const { container, rerender } = render(
      <ArtistLinks
        entity={album({ artistId: "solo", displayArtist: "Solo Artist" })}
        className="track-credit"
        onOpenArtist={onOpenArtist}
      />,
    );

    expect(container.querySelector(".artist-links")).toHaveClass("track-credit");
    expect(screen.getAllByRole("button", { name: "Open artist Solo Artist" })).toHaveLength(1);

    rerender(
      <ArtistLinks
        entity={album({
          artists: [
            { id: "solo", name: "Solo Artist" },
            { id: "solo", name: "Duplicate" },
          ],
        })}
        className="track-credit"
        onOpenArtist={onOpenArtist}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
  });

  it("shows a non-interactive fallback when no artist metadata exists", () => {
    render(<ArtistLinks entity={track()} onOpenArtist={vi.fn()} />);

    expect(screen.getByText("Unknown artist")).toHaveClass("artist-link--plain");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
