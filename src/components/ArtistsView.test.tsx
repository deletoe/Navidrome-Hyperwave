import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Artist, ArtistDirectory } from "../types";
import { ArtistsView, type ArtistsViewProps } from "./ArtistsView";

const beta: Artist = {
  id: "artist-beta",
  name: "Beta Signal",
  coverArt: "beta-cover",
  albumCount: 3,
};
const blue: Artist = {
  id: "artist-blue",
  name: "Blue Static",
  coverArt: "blue-cover",
  albumCount: 8,
};
const alpha: Artist = {
  id: "artist-alpha",
  name: "Alpha Waves",
  coverArt: "alpha-cover",
  albumCount: 2,
};
const amber: Artist = {
  id: "artist-amber",
  name: "Amber Choir",
  albumCount: 1,
};

const directory: ArtistDirectory = {
  ignoredArticles: "The El La Los Las Le Les",
  index: [
    { name: "B", artist: [beta, blue] },
    { name: "A", artist: [alpha, amber] },
  ],
};

function props(overrides: Partial<ArtistsViewProps> = {}): ArtistsViewProps {
  return {
    directory,
    loading: false,
    coverUrl: (coverArt, size) => (coverArt ? `/cover/${coverArt}?size=${size}` : ""),
    themeAsset: "/themes/prism.webp",
    activeCoverUrl: "/cover/active.webp",
    filter: "",
    onFilterChange: vi.fn(),
    onRetry: vi.fn(),
    onOpenArtist: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe("ArtistsView", () => {
  it("renders every server index and artist in the supplied order with total and match counts", () => {
    render(<ArtistsView {...props()} />);

    expect(screen.getByRole("heading", { name: "Every voice, one index" })).toBeInTheDocument();
    expect(screen.getByText("4 total")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4 artists")).toBeInTheDocument();

    const groupHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .filter((heading) => heading.textContent === "A" || heading.textContent === "B");
    expect(groupHeadings.map((heading) => heading.textContent)).toEqual(["B", "A"]);

    const buttons = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-label")?.startsWith("Open artist"));
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Open artist Beta Signal",
      "Open artist Blue Static",
      "Open artist Alpha Waves",
      "Open artist Amber Choir",
    ]);
  });

  it("filters locally without reordering groups and opens the original artist", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();
    function Harness() {
      const [filter, setFilter] = useState("");
      return (
        <ArtistsView
          {...props({ onOpenArtist })}
          filter={filter}
          onFilterChange={setFilter}
        />
      );
    }
    render(<Harness />);

    await user.type(screen.getByRole("searchbox", { name: "Filter artists" }), "bl");

    expect(screen.getByText("Showing 1 of 4 artists")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "B", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open artist Beta Signal" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open artist Blue Static" }));
    expect(onOpenArtist).toHaveBeenCalledWith(blue);
  });

  it("provides accessible loading, error, archive-empty, and filter-empty states", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <ArtistsView {...props({ directory: undefined, loading: true, onRetry })} />,
    );

    expect(screen.getByText("Loading the complete artist index…")).toHaveAttribute(
      "role",
      "status",
    );

    rerender(
      <ArtistsView
        {...props({ directory: undefined, loading: false, error: "Artist service offline", onRetry })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Artist service offline");
    await user.click(within(alert).getByRole("button", { name: "Retry artists" }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <ArtistsView
        {...props({ directory: { index: [] }, loading: false, error: undefined, onRetry })}
      />,
    );
    expect(
      screen.getByText("No artists were returned by this archive.").closest("div"),
    ).toHaveAttribute("role", "status");

    const onFilterChange = vi.fn();
    rerender(<ArtistsView {...props({ filter: "missing", onFilterChange, onRetry })} />);
    const emptyFilter = screen.getByText("No artists match “missing”.").closest("div");
    expect(emptyFilter).toHaveAttribute("role", "status");
    await user.click(within(emptyFilter as HTMLElement).getByRole("button", { name: "Clear filter" }));
    expect(onFilterChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("searchbox", { name: "Filter artists" })).toHaveFocus();
  });
});
