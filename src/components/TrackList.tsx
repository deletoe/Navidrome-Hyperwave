import { useId } from "react";

import { formatDuration } from "../lib/format";
import type { Track } from "../types";

export interface TrackListProps {
  title: string;
  tracks: Track[];
  starredIds: ReadonlySet<string>;
  onPlay: (track: Track, index: number, tracks: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleStar: (track: Track) => void;
  currentTrackId?: string;
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
  currentTrackId,
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
            <button type="button" onClick={onRetry}>
              Retry {title}
            </button>
          ) : null}
        </div>
      ) : null}
      {!loading && !error && tracks.length === 0 ? (
        <div className="inline-state inline-state--empty">
          <p>{emptyMessage}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Refresh {title}
            </button>
          ) : null}
        </div>
      ) : null}

      {tracks.length > 0 ? (
        <ol className="track-list__rows">
          {tracks.map((track, index) => {
            const isStarred = starredIds.has(track.id) || Boolean(track.starred);
            const artist = track.displayArtist || track.artist || "Unknown artist";
            return (
              <li
                className="track-row"
                data-current={currentTrackId === track.id || undefined}
                key={track.id}
              >
                <span className="track-row__number" aria-hidden="true">
                  {track.track ?? index + 1}
                </span>
                <span className="track-row__identity">
                  <strong>{track.title}</strong>
                  <span>
                    {artist}
                    {track.album ? ` · ${track.album}` : ""}
                  </span>
                </span>
                <time className="track-row__duration" dateTime={`PT${track.duration ?? 0}S`}>
                  {formatDuration(track.duration)}
                </time>
                <span className="track-row__actions">
                  <button
                    type="button"
                    aria-label={`Play ${track.title}`}
                    onClick={() => onPlay(track, index, tracks)}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    aria-label={`Add to queue: ${track.title}`}
                    onClick={() => onAddToQueue(track)}
                  >
                    Add to queue
                  </button>
                  <button
                    className={isStarred ? "is-starred" : undefined}
                    type="button"
                    aria-pressed={isStarred}
                    aria-label={`${isStarred ? "Unstar" : "Star"} ${track.title}`}
                    onClick={() => onToggleStar(track)}
                  >
                    {isStarred ? "Unstar" : "Star"}
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
