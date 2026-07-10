import { formatCount } from "../lib/format";
import type { HomeSection, HomeState } from "../hooks/useNavidrome";
import type { Album } from "../types";
import { AlbumShelf } from "./AlbumShelf";

export interface HomeViewProps {
  home: HomeState;
  coverUrl: (coverArt?: string, size?: number) => string;
  onOpenAlbum: (album: Album) => void;
  onOpenGenre: (genre: string) => void;
  onRetry: (section?: Exclude<HomeSection, "starred">) => void;
}

export function HomeView({
  home,
  coverUrl,
  onOpenAlbum,
  onOpenGenre,
  onRetry,
}: HomeViewProps) {
  const loadingSections = home.loadingSections ?? {};
  const anySectionLoading = Object.values(loadingSections).some(Boolean);

  return (
    <div className="view view--home" aria-busy={home.loading || anySectionLoading}>
      <header className="view-hero">
        <div>
          <p className="eyebrow">Library signal / online</p>
          <h1>Your archive, in motion</h1>
          <p>Move between recent arrivals, deep cuts, familiar records, and every genre channel.</p>
        </div>
        <button type="button" onClick={() => onRetry()} disabled={home.loading}>
          {home.loading ? "Refreshing…" : "Refresh archive"}
        </button>
      </header>

      {home.loading ? <p role="status">Loading your archive sections…</p> : null}

      <AlbumShelf
        title="Newest transmissions"
        albums={home.newest}
        coverUrl={coverUrl}
        onOpenAlbum={onOpenAlbum}
        loading={Boolean(loadingSections.newest) || (home.loading && home.newest.length === 0)}
        error={home.warnings.newest}
        emptyMessage="No recent albums were returned by this server."
        onRetry={() => onRetry("newest")}
      />
      <AlbumShelf
        title="Random access"
        albums={home.random}
        coverUrl={coverUrl}
        onOpenAlbum={onOpenAlbum}
        loading={Boolean(loadingSections.random) || (home.loading && home.random.length === 0)}
        error={home.warnings.random}
        emptyMessage="The random shelf is empty right now."
        onRetry={() => onRetry("random")}
      />
      <AlbumShelf
        title="Frequent frequencies"
        albums={home.frequent}
        coverUrl={coverUrl}
        onOpenAlbum={onOpenAlbum}
        loading={
          Boolean(loadingSections.frequent) || (home.loading && home.frequent.length === 0)
        }
        error={home.warnings.frequent}
        emptyMessage="Play a few records and your frequent shelf will appear here."
        onRetry={() => onRetry("frequent")}
      />

      <section className="genre-section" aria-labelledby="genre-heading">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Browse by wavelength</p>
            <h2 id="genre-heading">Genre channels</h2>
          </div>
          <span>{formatCount(home.genres.length)} channels</span>
        </header>
        {(loadingSections.genres || (home.loading && home.genres.length === 0)) ? (
          <p role="status">Loading genre channels…</p>
        ) : null}
        {home.warnings.genres ? (
          <div className="inline-state inline-state--error" role="alert">
            <p>{home.warnings.genres}</p>
            <button type="button" onClick={() => onRetry("genres")}>
              Retry genres
            </button>
          </div>
        ) : null}
        {!home.loading &&
        !loadingSections.genres &&
        !home.warnings.genres &&
        home.genres.length === 0 ? (
          <div className="inline-state inline-state--empty">
            <p>No genres were returned by this archive.</p>
            <button type="button" onClick={() => onRetry("genres")}>
              Refresh genres
            </button>
          </div>
        ) : null}
        {home.genres.length > 0 ? (
          <ul className="genre-grid" aria-label="Genre channels">
            {home.genres.map((genre, index) => (
              <li key={genre.value}>
                <button
                  type="button"
                  aria-label={`Open genre ${genre.value}`}
                  onClick={() => onOpenGenre(genre.value)}
                >
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{genre.value}</strong>
                  <span>
                    {formatCount(genre.songCount)} songs · {formatCount(genre.albumCount)} albums
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
