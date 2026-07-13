import { describe, expect, it } from "vitest";

import type { Album, Track } from "../types";
import { resolveLinkedArtists } from "./artistLinks";

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

describe("resolveLinkedArtists", () => {
  it("prefers the ordered artists list and preserves each supplied id", () => {
    expect(
      resolveLinkedArtists(track({
        artistId: "ignored-top-level",
        displayArtist: "Combined Credit",
        artists: [
          { id: "artist-a", name: "Alpha" },
          { id: "artist-b", name: "Beta" },
          { name: "Guest Vocal" },
        ],
      })),
    ).toEqual([
      { id: "artist-a", name: "Alpha" },
      { id: "artist-b", name: "Beta" },
      { name: "Guest Vocal" },
    ]);
  });

  it("deduplicates stable ids and normalized unlinked names", () => {
    expect(
      resolveLinkedArtists(album({
        artists: [
          { name: "  Signal   Club " },
          { id: "signal", name: "Signal Club" },
          { id: "signal", name: "Signal Club duplicate" },
          { name: "Guest" },
          { name: " guest " },
          { id: "other-signal", name: "Signal Club" },
        ],
      })),
    ).toEqual([
      { id: "signal", name: "Signal Club" },
      { name: "Guest" },
      { id: "other-signal", name: "Signal Club" },
    ]);
  });

  it("falls back from an empty artists list to the top-level artist id and label", () => {
    expect(
      resolveLinkedArtists(track({
        artists: [],
        artistId: " primary-artist ",
        displayArtist: "  Primary   Artist ",
        artist: "Legacy Artist",
      })),
    ).toEqual([{ id: "primary-artist", name: "Primary Artist" }]);

    expect(
      resolveLinkedArtists(album({ artistId: "legacy", artist: "Legacy Artist" })),
    ).toEqual([{ id: "legacy", name: "Legacy Artist" }]);
  });

  it("keeps artists without ids as plain labels and never invents an id", () => {
    expect(resolveLinkedArtists(album({ displayArtist: "Unlinked Credit" }))).toEqual([
      { name: "Unlinked Credit" },
    ]);
    expect(
      resolveLinkedArtists(track({
        artistId: "top-level-is-not-applied-to-a-list",
        artists: [{ name: "First" }, { name: "Second" }],
      })),
    ).toEqual([{ name: "First" }, { name: "Second" }]);
  });

  it("returns a stable plain fallback for missing or malformed credits", () => {
    expect(resolveLinkedArtists(track())).toEqual([{ name: "Unknown artist" }]);
    expect(resolveLinkedArtists(album({ artists: [{ id: undefined, name: "  " }] }))).toEqual([
      { name: "Unknown artist" },
    ]);
  });
});
