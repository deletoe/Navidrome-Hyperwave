import { useId } from "react";

import { formatDuration } from "../lib/format";
import type { Artist, Track } from "../types";
import { AppIcon } from "./AppIcon";
import { ArtistLinks } from "./ArtistLinks";
import { Artwork } from "./Artwork";

export interface TrackListProps {
  title: string;
  tracks: Track[];
  starredIds: ReadonlySet<string>;
  onPlay: (track: Track, index: number, tracks: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleStar: (track: Track) => void;
  onOpenArtist?: (artist: Artist) => void;
  currentTrackId?: string;
  coverUrl?: (coverArt?: string, size?: number) => string;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  onRetry?: () => void;
}

export function TrackList({
  title,
  tracks,
  starredIds,
  onPlay,
  onAddToQueue,
  onToggleStar,
  onOpenArtist,
  currentTrackId,
  coverUrl,
  loading = false,
  error,
  emptyMessage = "No songs are available here yet.",
  onRetry,
}: TrackListProps) {
  const headingId = useId();

  return (
    <section className="track-list" aria-labelledby={headingId}>
      <header className="section-heading">
        <div>
          <p className="eyebrow">Track register</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <span>{tracks.length} tracks</span>
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
      {!loading && !error && tracks.length === 0 ? (
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

      {tracks.length > 0 ? (
        <ol className="track-list__rows">
          {tracks.map((track, index) => {
            const isStarred = starredIds.has(track.id);
            const artist = track.displayArtist || track.artist || "Unknown artist";
            return (
              <li
                className="track-row"
                data-current={currentTrackId === track.id || undefined}
                key={track.id}
              >
                <span className="track-row__visual" aria-hidden="true">
                  <Artwork
                    className="track-row__artwork"
                    src={coverUrl?.(track.coverArt, 128)}
                    alt=""
                    decorative
                  />
                  <span className="track-row__number">{track.track ?? index + 1}</span>
                </span>
                <span className="track-row__identity">
                  <strong>{track.title}</strong>
                  <span className="track-row__meta">
                    {onOpenArtist ? (
                      <ArtistLinks entity={track} onOpenArtist={onOpenArtist} />
                    ) : (
                      artist
                    )}
                    {track.album ? <span> · {track.album}</span> : null}
                  </span>
                </span>
                <time className="track-row__duration" dateTime={`PT${track.duration ?? 0}S`}>
                  {formatDuration(track.duration)}
                </time>
                <span className="track-row__actions">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Play ${track.title}`}
                    title={`Play ${track.title}`}
                    onClick={() => onPlay(track, index, tracks)}
                  >
                    <AppIcon name="play" />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Add to queue: ${track.title}`}
                    title={`Add ${track.title} to queue`}
                    onClick={() => onAddToQueue(track)}
                  >
                    <AppIcon name="queueAdd" />
                  </button>
                  <button
                    className={`icon-button${isStarred ? " is-starred" : ""}`}
                    type="button"
                    aria-pressed={isStarred}
                    aria-label={`${isStarred ? "Unstar" : "Star"} ${track.title}`}
                    title={`${isStarred ? "Unstar" : "Star"} ${track.title}`}
                    onClick={() => onToggleStar(track)}
                  >
                    <AppIcon name="favorite" filled={isStarred} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
