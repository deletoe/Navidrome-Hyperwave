import { formatCount, formatDuration } from "../lib/format";
import type { Album, Artist, Track } from "../types";
import { AlbumShelf } from "./AlbumShelf";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";
import { TrackList } from "./TrackList";

export type DetailKind = "album" | "artist" | "genre";

export interface EntityDetailProps {
  kind: DetailKind;
  album?: Album;
  artist?: Artist;
  genre?: string;
  genreTracks: Track[];
  loading: boolean;
  error?: string;
  starredIds: ReadonlySet<string>;
  currentTrackId?: string;
  coverUrl: (coverArt?: string, size?: number) => string;
  onBack: () => void;
  onRetry: () => void;
  onOpenAlbum: (album: Album) => void;
  onPlay: (track: Track, index: number, tracks: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleStar: (track: Track) => void;
  onPlayCollection: (tracks: Track[]) => void;
  onAddCollection: (tracks: Track[]) => void;
}

export function EntityDetail({
  kind,
  album,
  artist,
  genre,
  genreTracks,
  loading,
  error,
  starredIds,
  currentTrackId,
  coverUrl,
  onBack,
  onRetry,
  onOpenAlbum,
  onPlay,
  onAddToQueue,
  onToggleStar,
  onPlayCollection,
  onAddCollection,
}: EntityDetailProps) {
  const albumTracks = album?.song ?? [];
  const missing =
    !loading &&
    !error &&
    ((kind === "album" && !album) ||
      (kind === "artist" && !artist) ||
      (kind === "genre" && !genre));

  return (
    <div className="view view--detail" aria-busy={loading}>
      <button className="detail-back button-with-icon" type="button" onClick={onBack}>
        <AppIcon name="back" />
        Back to previous view
      </button>

      {loading ? (
        <div className="detail-state" role="status">
          <p className="eyebrow">Resolving archive index</p>
          <h1>Loading details…</h1>
          <p>The previous view is still one step away.</p>
          <button className="button-with-icon" type="button" onClick={onBack}>
            <AppIcon name="back" />
            Cancel and go back
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="detail-state inline-state--error" role="alert">
          <p className="eyebrow">Detail request failed</p>
          <h1>This archive entry could not be opened</h1>
          <p>{error}</p>
          <button className="button-with-icon" type="button" onClick={onRetry}>
            <AppIcon name="retry" />
            Retry details
          </button>
        </div>
      ) : null}
      {missing ? (
        <div className="detail-state inline-state--empty">
          <p className="eyebrow">Entry unavailable</p>
          <h1>No details were returned</h1>
          <p>The archive may have changed since this item was listed.</p>
          <button className="button-with-icon" type="button" onClick={onRetry}>
            <AppIcon name="retry" />
            Try this entry again
          </button>
        </div>
      ) : null}

      {!loading && !error && kind === "album" && album ? (
        <>
          <header className="entity-hero entity-hero--album">
            <Artwork
              className="entity-hero__artwork"
              src={coverUrl(album.coverArt, 720)}
              alt={`${album.name} cover`}
              eager
            />
            <div>
              <p className="eyebrow">Album detail</p>
              <h1>{album.name}</h1>
              <p>{album.displayArtist || album.artist || "Unknown artist"}</p>
              <p>
                {album.year ? `${album.year} · ` : ""}
                {formatCount(album.songCount ?? albumTracks.length)} tracks
                {album.duration ? ` · ${formatDuration(album.duration)}` : ""}
              </p>
              <div className="collection-actions">
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onPlayCollection(albumTracks)}
                  disabled={albumTracks.length === 0}
                >
                  <AppIcon name="playCircle" />
                  Play album
                </button>
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onAddCollection(albumTracks)}
                  disabled={albumTracks.length === 0}
                >
                  <AppIcon name="queueAdd" />
                  Add album to queue
                </button>
              </div>
            </div>
          </header>
          <TrackList
            title="Album tracks"
            tracks={albumTracks}
            starredIds={starredIds}
            currentTrackId={currentTrackId}
            emptyMessage="This album did not include a song list."
            onRetry={onRetry}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onToggleStar={onToggleStar}
          />
        </>
      ) : null}

      {!loading && !error && kind === "artist" && artist ? (
        <>
          <header className="entity-hero entity-hero--artist">
            <Artwork
              className="entity-hero__artwork"
              src={coverUrl(artist.coverArt, 720)}
              alt={`${artist.name} artwork`}
              eager
            />
            <div>
              <p className="eyebrow">Artist detail</p>
              <h1>{artist.name}</h1>
              <p>{formatCount(artist.albumCount ?? artist.album?.length)} albums in this archive.</p>
            </div>
          </header>
          <AlbumShelf
            title={`${artist.name} albums`}
            albums={artist.album ?? []}
            coverUrl={coverUrl}
            onOpenAlbum={onOpenAlbum}
            emptyMessage="No albums were returned for this artist."
            onRetry={onRetry}
          />
        </>
      ) : null}

      {!loading && !error && kind === "genre" && genre ? (
        <>
          <header className="entity-hero entity-hero--genre">
            <div>
              <p className="eyebrow">Genre channel</p>
              <h1>{genre}</h1>
              <p>{formatCount(genreTracks.length)} songs selected from this archive.</p>
              <div className="collection-actions">
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onPlayCollection(genreTracks)}
                  disabled={genreTracks.length === 0}
                >
                  <AppIcon name="playCircle" />
                  Play genre
                </button>
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onAddCollection(genreTracks)}
                  disabled={genreTracks.length === 0}
                >
                  <AppIcon name="queueAdd" />
                  Add genre to queue
                </button>
              </div>
            </div>
          </header>
          <TrackList
            title={`${genre} songs`}
            tracks={genreTracks}
            starredIds={starredIds}
            currentTrackId={currentTrackId}
            emptyMessage="No songs were returned for this genre."
            onRetry={onRetry}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onToggleStar={onToggleStar}
          />
        </>
      ) : null}
    </div>
  );
}
