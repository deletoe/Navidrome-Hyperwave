import { useEffect, useState, type FormEvent } from "react";

import { formatCount } from "../lib/format";
import type { Album, Artist, SearchResult, Track } from "../types";
import { AlbumShelf } from "./AlbumShelf";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";
import { TrackList } from "./TrackList";

export interface SearchViewProps {
  query: string;
  result?: SearchResult;
  loading: boolean;
  error?: string;
  starredIds: ReadonlySet<string>;
  coverUrl: (coverArt?: string, size?: number) => string;
  currentTrackId?: string;
  onSearch: (query: string) => void;
  onOpenAlbum: (album: Album) => void;
  onOpenArtist: (artist: Artist) => void;
  onPlay: (track: Track, index: number, tracks: Track[]) => void;
  onAddToQueue: (track: Track) => void;
  onToggleStar: (track: Track) => void;
}

export function SearchView({
  query,
  result,
  loading,
  error,
  starredIds,
  coverUrl,
  currentTrackId,
  onSearch,
  onOpenAlbum,
  onOpenArtist,
  onPlay,
  onAddToQueue,
  onToggleStar,
}: SearchViewProps) {
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSearch(draft);
  }

  const resultCount = result
    ? result.song.length + result.album.length + result.artist.length
    : 0;
  const showResult = Boolean(result) && !loading && !error;

  return (
    <div className="view view--search" aria-busy={loading}>
      <header className="view-hero view-hero--search">
        <div>
          <p className="eyebrow">Archive index</p>
          <h1>Search every signal</h1>
          <p>Find songs, records, and artists without leaving the current listening session.</p>
        </div>
      </header>

      <form className="search-form" role="search" onSubmit={submit}>
        <label htmlFor="archive-search">Search songs, albums, and artists</label>
        <div>
          <input
            id="archive-search"
            type="search"
            value={draft}
            placeholder="Song, album, artist…"
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <button className="button-with-icon" type="submit" disabled={loading || !draft.trim()}>
            <AppIcon name={loading ? "loading" : "search"} className={loading ? "is-spinning" : ""} />
            {loading ? "Searching…" : "Search archive"}
          </button>
        </div>
      </form>

      {loading ? <p role="status">Searching the archive for {draft || "your query"}…</p> : null}
      {error ? (
        <div className="inline-state inline-state--error" role="alert">
          <strong>Search could not be completed</strong>
          <p>{error}</p>
          <button
            className="button-with-icon"
            type="button"
            onClick={() => onSearch(draft)}
            disabled={!draft.trim()}
          >
            <AppIcon name="retry" />
            Retry search
          </button>
        </div>
      ) : null}
      {!loading && !error && !query && !result ? (
        <div className="empty-stage">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start with a title, artist, or album</h2>
          <p>Your results will stay grouped by songs, albums, and artists.</p>
          <button
            className="button-with-icon"
            type="button"
            onClick={() => document.getElementById("archive-search")?.focus()}
          >
            <AppIcon name="search" />
            Focus search
          </button>
        </div>
      ) : null}
      {showResult && result && resultCount === 0 ? (
        <div className="empty-stage">
          <p className="eyebrow">No match</p>
          <h2>Nothing found for “{query}”</h2>
          <p>Try fewer words, a different spelling, or an artist name.</p>
          <button
            className="button-with-icon"
            type="button"
            onClick={() => document.getElementById("archive-search")?.focus()}
          >
            <AppIcon name="revise" />
            Revise search
          </button>
        </div>
      ) : null}

      {showResult && result && resultCount > 0 ? (
        <div className="search-results">
          <p role="status">
            {formatCount(resultCount)} results for “{query}”
          </p>
          {result.song.length > 0 ? (
            <TrackList
              title="Songs"
              tracks={result.song}
              starredIds={starredIds}
              currentTrackId={currentTrackId}
              onPlay={onPlay}
              onAddToQueue={onAddToQueue}
              onToggleStar={onToggleStar}
            />
          ) : null}
          {result.album.length > 0 ? (
            <AlbumShelf
              title="Albums"
              albums={result.album}
              coverUrl={coverUrl}
              onOpenAlbum={onOpenAlbum}
            />
          ) : null}
          {result.artist.length > 0 ? (
            <section className="artist-results" aria-labelledby="artist-results-heading">
              <header className="section-heading">
                <div>
                  <p className="eyebrow">People and projects</p>
                  <h2 id="artist-results-heading">Artists</h2>
                </div>
              </header>
              <ul className="artist-grid">
                {result.artist.map((artist) => (
                  <li key={artist.id}>
                    <button
                      type="button"
                      aria-label={`Open artist ${artist.name}`}
                      onClick={() => onOpenArtist(artist)}
                    >
                      <Artwork
                        src={coverUrl(artist.coverArt, 320)}
                        alt={`${artist.name} artwork`}
                      />
                      <strong>{artist.name}</strong>
                      <span>{formatCount(artist.albumCount)} albums</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
