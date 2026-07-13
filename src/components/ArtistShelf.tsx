import { useId } from "react";

import { formatCount } from "../lib/format";
import type { Artist } from "../types";
import { Artwork } from "./Artwork";

export interface ArtistShelfProps {
  title: string;
  artists: Artist[];
  coverUrl: (coverArt?: string, size?: number) => string;
  onOpenArtist: (artist: Artist) => void;
  eyebrow?: string;
}

function albumCountLabel(count?: number): string {
  return `${formatCount(count)} ${count === 1 ? "album" : "albums"}`;
}

export function ArtistShelf({
  title,
  artists,
  coverUrl,
  onOpenArtist,
  eyebrow = "Artist index",
}: ArtistShelfProps) {
  const headingId = useId();

  return (
    <section className="artist-shelf artist-results" aria-labelledby={headingId}>
      <header className="section-heading artist-shelf__heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <span>
          {formatCount(artists.length)} {artists.length === 1 ? "artist" : "artists"}
        </span>
      </header>

      <ul className="artist-grid" aria-label={`${title} artists`}>
        {artists.map((artist) => (
          <li key={artist.id}>
            <button
              className="artist-card"
              type="button"
              aria-label={`Open artist ${artist.name}`}
              onClick={() => onOpenArtist(artist)}
            >
              <Artwork
                className="artist-card__artwork"
                src={coverUrl(artist.coverArt, 360)}
                alt={`${artist.name} artwork`}
              />
              <span className="artist-card__copy">
                <strong className="artist-card__name" title={artist.name}>
                  {artist.name}
                </strong>
                <span className="artist-card__meta">{albumCountLabel(artist.albumCount)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
