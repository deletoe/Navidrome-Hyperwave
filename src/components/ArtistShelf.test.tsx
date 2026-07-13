import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Artist } from "../types";
import { ArtistShelf } from "./ArtistShelf";

const artists: Artist[] = [
  {
    id: "artist-1",
    name: "Signal Club",
    coverArt: "cover-1",
    albumCount: 1,
  },
  {
    id: "artist-2",
    name: "An Extremely Long Artist Name That Still Has A Complete Accessible Name",
    albumCount: 12,
  },
];

afterEach(cleanup);

describe("ArtistShelf", () => {
  it("renders explicit accessible artist cards with cover and album metadata", () => {
    const coverUrl = vi.fn((coverArt?: string, size?: number) =>
      coverArt ? `/cover/${coverArt}?size=${size}` : "",
    );

    render(
      <ArtistShelf
        title="S"
        eyebrow="Archive letter"
        artists={artists}
        coverUrl={coverUrl}
        onOpenArtist={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "S" })).toBeInTheDocument();
    expect(screen.getByText("Archive letter")).toBeInTheDocument();
    expect(screen.getByText("2 artists")).toBeInTheDocument();
    expect(screen.getByText("1 album")).toBeInTheDocument();
    expect(screen.getByText("12 albums")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Signal Club artwork" })).toHaveAttribute(
      "src",
      "/cover/cover-1?size=360",
    );
    expect(screen.getByRole("button", { name: "Open artist Signal Club" })).toHaveClass(
      "artist-card",
    );
    expect(coverUrl).toHaveBeenCalledWith("cover-1", 360);
  });

  it("opens the original artist object", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();

    render(
      <ArtistShelf
        title="Artists"
        artists={artists}
        coverUrl={() => ""}
        onOpenArtist={onOpenArtist}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open artist Signal Club" }));
    expect(onOpenArtist).toHaveBeenCalledWith(artists[0]);
  });
});
