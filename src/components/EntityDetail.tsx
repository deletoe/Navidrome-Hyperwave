import { formatCount, formatDuration } from "../lib/format";
import type { Album, Artist, Track } from "../types";
import { AlbumShelf } from "./AlbumShelf";
import { AppIcon } from "./AppIcon";
import { ArtistLinks } from "./ArtistLinks";
import { Artwork } from "./Artwork";
import { HeroMedia, resolveHeroCovers } from "./HeroMedia";
import { TrackList } from "./TrackList";

export type DetailKind = "album" | "artist" | "genre";

export interface EntityDetailProps {
  kind: DetailKind;
  album?: Album;
  artist?: Artist;
  artistTracks: Track[];
  artistTracksLoading: boolean;
  artistTracksWarning?: string;
  genre?: string;
  genreTracks: Track[];
  loading: boolean;
  error?: string;
  starredIds: ReadonlySet<string>;
  currentTrackId?: string;
  coverUrl: (coverArt?: string, size?: number) => string;
  themeAsset?: string;
  activeCoverUrl?: string;
  onBack: () => void;
  onRetry: () => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
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
  artistTracks,
  artistTracksLoading,
  artistTracksWarning,
  genre,
  genreTracks,
  loading,
  error,
  starredIds,
  currentTrackId,
  coverUrl,
  themeAsset = "",
  activeCoverUrl,
  onBack,
  onRetry,
  onOpenAlbum,
  onOpenArtist,
  onPlay,
  onAddToQueue,
  onToggleStar,
  onPlayCollection,
  onAddCollection,
}: EntityDetailProps) {
  const albumTracks = album?.song ?? [];
  const artistAlbumCount = artist?.albumCount ?? artist?.album?.length ?? 0;
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
            <div className="entity-hero__media">
              <HeroMedia
                asset={themeAsset}
                covers={resolveHeroCovers(activeCoverUrl, [albumTracks], coverUrl)}
                className="hero-media--entity"
              />
              <Artwork
                className="entity-hero__artwork"
                src={coverUrl(album.coverArt, 720)}
                alt={`${album.name} cover`}
                eager
              />
            </div>
            <div>
              <p className="eyebrow">Album detail</p>
              <h1>{album.name}</h1>
              <p>
                <ArtistLinks entity={album} onOpenArtist={onOpenArtist} />
              </p>
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
            coverUrl={coverUrl}
            emptyMessage="This album did not include a song list."
            onRetry={onRetry}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onToggleStar={onToggleStar}
            onOpenArtist={onOpenArtist}
          />
        </>
      ) : null}

      {!loading && !error && kind === "artist" && artist ? (
        <>
          <header className="entity-hero entity-hero--artist">
            <div className="entity-hero__media">
              <HeroMedia
                asset={themeAsset}
                covers={resolveHeroCovers(activeCoverUrl, [artist.album ?? []], coverUrl)}
                className="hero-media--entity"
              />
              <Artwork
                className="entity-hero__artwork"
                src={coverUrl(artist.coverArt, 720)}
                alt={`${artist.name} artwork`}
                eager
              />
            </div>
            <div className="entity-hero__copy">
              <p className="eyebrow">Artist detail</p>
              <h1>{artist.name}</h1>
              <p>
                {formatCount(artistAlbumCount)} {artistAlbumCount === 1 ? "album" : "albums"}
                {artistTracksLoading
                  ? " · collecting every song…"
                  : ` · ${formatCount(artistTracks.length)} ${artistTracks.length === 1 ? "song" : "songs"}`}
              </p>
              <div className="collection-actions">
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onPlayCollection(artistTracks)}
                  disabled={artistTracks.length === 0}
                >
                  <AppIcon name="playCircle" />
                  {artistTracksLoading ? "Play loaded songs" : "Play all songs"}
                </button>
                <button
                  className="button-with-icon"
                  type="button"
                  onClick={() => onAddCollection(artistTracks)}
                  disabled={artistTracks.length === 0}
                >
                  <AppIcon name="queueAdd" />
                  {artistTracksLoading ? "Add loaded to queue" : "Add all to queue"}
                </button>
              </div>
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
          <TrackList
            title={`All ${artist.name} songs`}
            tracks={artistTracks}
            starredIds={starredIds}
            currentTrackId={currentTrackId}
            coverUrl={coverUrl}
            loading={artistTracksLoading}
            error={artistTracksWarning}
            emptyMessage="No songs were returned from this artist's albums."
            onRetry={onRetry}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onToggleStar={onToggleStar}
            onOpenArtist={onOpenArtist}
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
            <HeroMedia
              asset={themeAsset}
              covers={resolveHeroCovers(activeCoverUrl, [genreTracks], coverUrl)}
            />
          </header>
          <TrackList
            title={`${genre} songs`}
            tracks={genreTracks}
            starredIds={starredIds}
            currentTrackId={currentTrackId}
            coverUrl={coverUrl}
            emptyMessage="No songs were returned for this genre."
            onRetry={onRetry}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onToggleStar={onToggleStar}
            onOpenArtist={onOpenArtist}
          />
        </>
      ) : null}
    </div>
  );
}
