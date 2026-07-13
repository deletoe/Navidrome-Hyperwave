import { formatCount } from "../lib/format";
import type { Album, Artist, Track } from "../types";
import { AlbumShelf } from "./AlbumShelf";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";
import { HeroMedia, resolveHeroCovers } from "./HeroMedia";
import { TrackList } from "./TrackList";

export interface FavoritesViewProps {
  songs: Track[];
  albums: Album[];
  artists: Artist[];
  starredIds: ReadonlySet<string>;
  loading: boolean;
  error?: string;
  coverUrl: (coverArt?: string, size?: number) => string;
  themeAsset?: string;
  activeCoverUrl?: string;
  currentTrackId?: string;
  onRetry: () => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlay: (track: Track, index: number, tracks: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleStar: (track: Track) => void;
}
export function FavoritesView({
  songs,
  albums,
  artists,
  starredIds,
  loading,
  error,
  coverUrl,
  themeAsset = "",
  activeCoverUrl,
  currentTrackId,
  onRetry,
  onOpenAlbum,
  onOpenArtist,
  onPlay,
  onAddToQueue,
  onToggleStar,
}: FavoritesViewProps) {
  const total = songs.length + albums.length + artists.length;
  const heroCovers = resolveHeroCovers(activeCoverUrl, [albums, songs, artists], coverUrl);

  return (
    <div className="view view--favorites" aria-busy={loading}>
      <header className="view-hero">
        <div>
          <p className="eyebrow">Saved constellation</p>
          <h1>Your favorites</h1>
          <p>{formatCount(total)} saved songs, albums, and artists in this archive.</p>
        </div>
        <HeroMedia asset={themeAsset} covers={heroCovers} />
        <button className="button-with-icon" type="button" onClick={onRetry} disabled={loading}>
          <AppIcon name={loading ? "loading" : "refresh"} className={loading ? "is-spinning" : ""} />
          {loading ? "Refreshing…" : "Refresh favorites"}
        </button>
      </header>

      {loading ? <p role="status">Loading favorites…</p> : null}
      {error ? (
        <div className="inline-state inline-state--error" role="alert">
          <strong>Favorites are temporarily unavailable</strong>
          <p>{error}</p>
          <button className="button-with-icon" type="button" onClick={onRetry}>
            <AppIcon name="retry" />
            Retry favorites
          </button>
        </div>
      ) : null}
      {!loading && !error && total === 0 ? (
        <div className="empty-stage">
          <p className="eyebrow">A quiet constellation</p>
          <h2>No favorites yet</h2>
          <p>Use the Star action beside any song, then return here.</p>
          <button className="button-with-icon" type="button" onClick={onRetry}>
            <AppIcon name="refresh" />
            Check again
          </button>
        </div>
      ) : null}

      {songs.length > 0 ? (
        <TrackList
          title="Favorite songs"
          tracks={songs}
          starredIds={starredIds}
          currentTrackId={currentTrackId}
          coverUrl={coverUrl}
          onPlay={onPlay}
          onAddToQueue={onAddToQueue}
          onToggleStar={onToggleStar}
        />
      ) : null}
      {albums.length > 0 ? (
        <AlbumShelf
          title="Favorite albums"
          albums={albums}
          coverUrl={coverUrl}
          onOpenAlbum={onOpenAlbum}
        />
      ) : null}
      {artists.length > 0 ? (
        <section className="artist-results" aria-labelledby="favorite-artists-heading">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Pinned voices</p>
              <h2 id="favorite-artists-heading">Favorite artists</h2>
            </div>
          </header>
          <ul className="artist-grid">
            {artists.map((artist) => (
              <li key={artist.id}>
                <button
                  type="button"
                  aria-label={`Open artist ${artist.name}`}
                  onClick={() => onOpenArtist(artist)}
                >
                  <Artwork src={coverUrl(artist.coverArt, 320)} alt={`${artist.name} artwork`} />
                  <strong>{artist.name}</strong>
                  <span>{formatCount(artist.albumCount)} albums</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
