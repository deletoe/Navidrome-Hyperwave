import { useId, useMemo, useRef } from "react";

import { formatCount } from "../lib/format";
import type { Artist, ArtistDirectory } from "../types";
import { AppIcon } from "./AppIcon";
import { ArtistShelf } from "./ArtistShelf";
import { HeroMedia, resolveHeroCovers } from "./HeroMedia";

export interface ArtistsViewProps {
  directory?: ArtistDirectory;
  loading: boolean;
  error?: string;
  coverUrl: (coverArt?: string, size?: number) => string;
  themeAsset?: string;
  activeCoverUrl?: string;
  filter: string;
  onFilterChange: (filter: string) => void;
  onRetry: () => void;
  onOpenArtist: (artist: Artist) => void;
}

function normalizeFilter(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function ArtistsView({
  directory,
  loading,
  error,
  coverUrl,
  themeAsset = "",
  activeCoverUrl,
  filter,
  onFilterChange,
  onRetry,
  onOpenArtist,
}: ArtistsViewProps) {
  const filterId = useId();
  const headingId = useId();
  const filterRef = useRef<HTMLInputElement>(null);
  const normalizedFilter = normalizeFilter(filter);
  const groups = directory?.index ?? [];
  const totalArtists = groups.reduce((total, group) => total + group.artist.length, 0);
  const filteredGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          artist: normalizedFilter
            ? group.artist.filter((artist) =>
                artist.name.toLocaleLowerCase().includes(normalizedFilter),
              )
            : group.artist,
        }))
        .filter((group) => group.artist.length > 0),
    [groups, normalizedFilter],
  );
  const matchingArtists = filteredGroups.reduce(
    (total, group) => total + group.artist.length,
    0,
  );
  const heroCovers = resolveHeroCovers(
    activeCoverUrl,
    groups.map((group) => group.artist),
    coverUrl,
  );

  return (
    <div className="view view--artists" aria-busy={loading}>
      <header className="view-hero artists-hero">
        <div>
          <p className="eyebrow">Complete artist archive</p>
          <h1>Every voice, one index</h1>
          <p>Move through the library in its original server order, from headline names to hidden credits.</p>
        </div>
        <HeroMedia asset={themeAsset} covers={heroCovers} />
        <button
          className="button-with-icon"
          type="button"
          onClick={onRetry}
          disabled={loading}
        >
          <AppIcon
            name={loading ? "loading" : "refresh"}
            className={loading ? "is-spinning" : ""}
          />
          {loading ? "Loading artists…" : "Refresh artists"}
        </button>
      </header>

      <section className="artist-directory" aria-labelledby={headingId}>
        <header className="section-heading artist-directory__heading">
          <div>
            <p className="eyebrow">Alphabetical transmission</p>
            <h2 id={headingId}>Artist directory</h2>
          </div>
          <span>{formatCount(totalArtists)} total</span>
        </header>

        <div className="artist-directory__toolbar">
          <label className="artist-directory__filter" htmlFor={filterId}>
            <span>Filter artists</span>
            <span className="artist-directory__filter-field">
              <AppIcon name="search" />
              <input
                ref={filterRef}
                id={filterId}
                type="search"
                value={filter}
                placeholder="Type an artist name"
                autoComplete="off"
                onChange={(event) => onFilterChange(event.currentTarget.value)}
              />
            </span>
          </label>
          <p className="artist-directory__count" role="status" aria-live="polite">
            Showing {formatCount(matchingArtists)} of {formatCount(totalArtists)} artists
          </p>
        </div>

        {loading ? <p role="status">Loading the complete artist index…</p> : null}

        {error ? (
          <div className="inline-state inline-state--error" role="alert">
            <p>{error}</p>
            <button className="button-with-icon" type="button" onClick={onRetry}>
              <AppIcon name="retry" />
              Retry artists
            </button>
          </div>
        ) : null}

        {!loading && !error && totalArtists === 0 ? (
          <div className="inline-state inline-state--empty" role="status">
            <p>No artists were returned by this archive.</p>
            <button className="button-with-icon" type="button" onClick={onRetry}>
              <AppIcon name="refresh" />
              Refresh artists
            </button>
          </div>
        ) : null}

        {totalArtists > 0 && filteredGroups.length === 0 ? (
          <div className="inline-state inline-state--empty" role="status">
            <p>No artists match “{filter.trim()}”.</p>
            <button
              className="button-with-icon"
              type="button"
              onClick={() => {
                onFilterChange("");
                filterRef.current?.focus();
              }}
            >
              <AppIcon name="revise" />
              Clear filter
            </button>
          </div>
        ) : null}

        {filteredGroups.length > 0 ? (
          <div className="artist-directory__groups">
            {filteredGroups.map((group, index) => (
              <ArtistShelf
                key={`${group.name}:${index}`}
                title={group.name || "Other"}
                eyebrow="Artist index"
                artists={group.artist}
                coverUrl={coverUrl}
                onOpenArtist={onOpenArtist}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
