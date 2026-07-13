import { Fragment } from "react";

import { resolveLinkedArtists } from "../lib/artistLinks";
import type { Album, Artist, Track } from "../types";

export interface ArtistLinksProps {
  entity: Track | Album;
  onOpenArtist: (artist: Artist) => void;
  className?: string;
}

export function ArtistLinks({
  entity,
  onOpenArtist,
  className = "",
}: ArtistLinksProps) {
  const artists = resolveLinkedArtists(entity);

  return (
    <span className={`artist-links${className ? ` ${className}` : ""}`}>
      {artists.map((artist, index) => {
        const artistId = artist.id;
        return (
          <Fragment key={artistId ? `id:${artistId}` : `name:${artist.name.toLowerCase()}`}>
            {index > 0 ? ", " : null}
            {artistId ? (
              <button
                className="artist-link"
                type="button"
                aria-label={`Open artist ${artist.name}`}
                title={`Open artist ${artist.name}`}
                onClick={() => onOpenArtist({ id: artistId, name: artist.name })}
              >
                {artist.name}
              </button>
            ) : (
              <span className="artist-link artist-link--plain">{artist.name}</span>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}
