import { useId } from "react";

import { formatCount, formatDuration } from "../lib/format";
import type { Album } from "../types";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";

export interface AlbumShelfProps {
  title: string;
  albums: Album[];
  coverUrl: (coverArt?: string, size?: number) => string;
  onOpenAlbum: (album: Album) => void;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  onRetry?: () => void;
}
export function AlbumShelf({
  title,
  albums,
  coverUrl,
  onOpenAlbum,
  loading = false,
  error,
  emptyMessage = "No albums are available in this section yet.",
  onRetry,
}: AlbumShelfProps) {
  const headingId = useId();

  return (
    <section className="album-shelf" aria-labelledby={headingId}>
      <header className="section-heading">
        <div>
          <p className="eyebrow">Album transmission</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        {albums.length > 0 ? <span>{formatCount(albums.length)} records</span> : null}
      </header>

      {loading ? <p role="status">Loading {title.toLowerCase()}…</p> : null}
      {error ? (
        <div className="inline-state inline-state--error" role="alert">
          <p>{error}</p>
          {onRetry ? (
            <button className="button-with-icon" type="button" onClick={onRetry}>
              <AppIcon name="retry" />
              Retry {title}
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && albums.length === 0 ? (
        <div className="inline-state inline-state--empty">
          <p>{emptyMessage}</p>
          {onRetry ? (
            <button className="button-with-icon" type="button" onClick={onRetry}>
              <AppIcon name="refresh" />
              Refresh {title}
            </button>
          ) : null}
        </div>
      ) : null}

      {albums.length > 0 ? (
        <ul className="album-grid" aria-label={title}>
          {albums.map((album) => (
            <li key={album.id}>
              <button
                className="album-card"
                type="button"
                aria-label={`Open album ${album.name}`}
                onClick={() => onOpenAlbum(album)}
              >
                <Artwork
                  className="album-card__artwork"
                  src={coverUrl(album.coverArt, 420)}
                  alt={`${album.name} cover`}
                />
                <span className="album-card__copy">
                  <strong>{album.name}</strong>
                  <span>{album.displayArtist || album.artist || "Unknown artist"}</span>
                  <span className="album-card__meta">
                    {album.year ? `${album.year} · ` : ""}
                    {formatCount(album.songCount)} tracks
                    {album.duration ? ` · ${formatDuration(album.duration)}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
