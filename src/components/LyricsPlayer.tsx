import { useEffect, useMemo, useRef } from "react";

import type { TrackLyricsController } from "../hooks/useTrackLyrics";
import { formatDuration } from "../lib/format";
import {
  getActiveLyricLineIndex,
  lyricLanguageLabel,
  lyricTimestampMs,
} from "../lib/lyrics";
import type { Track } from "../types";
import { AppIcon } from "./AppIcon";
import { Artwork } from "./Artwork";

export interface LyricsPlayerProps {
  track: Track;
  artworkUrl: string;
  lyrics: TrackLyricsController;
  progress: number;
  playing: boolean;
  onShowArtwork(): void;
  onSeek(seconds: number): void;
}

export function LyricsPlayer({
  track,
  artworkUrl,
  lyrics,
  progress,
  playing,
  onShowArtwork,
  onSeek,
}: LyricsPlayerProps) {
  const activeIndex = getActiveLyricLineIndex(lyrics.selected, progress);
  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const artist = track.displayArtist || track.artist || "Unknown artist";
  const languageOptions = useMemo(
    () => lyrics.entries.map((entry, index) => lyricLanguageLabel(entry, index)),
    [lyrics.entries],
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView?.({
      block: "center",
      behavior: playing ? "smooth" : "auto",
    });
  }, [activeIndex, playing]);

  return (
    <div
      className="lyrics-player"
      data-status={lyrics.status}
      data-synced={lyrics.selected?.synced ?? false}
      data-playing={playing}
    >
      <header className="lyrics-player__header">
        <button
          className="lyrics-player__cover-toggle"
          type="button"
          aria-label={`Show album artwork for ${track.title}`}
          title="Show album artwork"
          onClick={onShowArtwork}
        >
          <Artwork
            className="lyrics-player__thumbnail"
            src={artworkUrl}
            alt={`${track.title} cover`}
            eager
          />
          <span aria-hidden="true"><AppIcon name="lyrics" /></span>
        </button>
        <div>
          <p className="eyebrow">Lyrics signal</p>
          <h2>{track.title}</h2>
          <p>{artist} · {track.album || "Unknown album"}</p>
        </div>
        {lyrics.entries.length > 1 ? (
          <label className="lyrics-player__language">
            <span>Lyrics version</span>
            <select
              value={lyrics.selectedIndex}
              onChange={(event) => lyrics.select(Number(event.currentTarget.value))}
            >
              {languageOptions.map((label, index) => (
                <option key={`${label}-${index}`} value={index}>{label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <div className="lyrics-player__stage" aria-label={`Lyrics for ${track.title}`}>
        {lyrics.status === "loading" || lyrics.status === "idle" ? (
          <div className="lyrics-player__state" role="status">
            <AppIcon name="loading" />
            <strong>Finding lyrics in your archive</strong>
            <span>Checking embedded tags and sidecar lyric files…</span>
          </div>
        ) : null}
        {lyrics.status === "empty" ? (
          <div className="lyrics-player__state">
            <AppIcon name="lyrics" />
            <strong>No lyrics for this recording</strong>
            <span>The cover view and all playback controls are still available.</span>
            <button className="button-with-icon" type="button" onClick={onShowArtwork}>
              <AppIcon name="back" />
              Return to artwork
            </button>
          </div>
        ) : null}
        {lyrics.status === "error" ? (
          <div className="lyrics-player__state" role="alert">
            <AppIcon name="lyrics" />
            <strong>Lyrics are unavailable</strong>
            <span>{lyrics.error || "This server may not support structured lyrics."}</span>
            <button className="button-with-icon" type="button" onClick={() => void lyrics.retry()}>
              <AppIcon name="retry" />
              Retry lyrics
            </button>
          </div>
        ) : null}
        {lyrics.status === "ready" && lyrics.selected ? (
          <div
            className="lyrics-player__lines"
            aria-live="off"
            data-active-line={activeIndex}
          >
            {lyrics.selected.line.map((line, index) => {
              const timestamp = lyricTimestampMs(line.start, lyrics.selected?.offset ?? 0);
              const active = index === activeIndex;
              if (timestamp === undefined) {
                return (
                  <p className="lyrics-player__line" data-active={active} key={`${index}-${line.value}`}>
                    {line.value}
                  </p>
                );
              }
              return (
                <button
                  ref={(element) => { lineRefs.current[index] = element; }}
                  className="lyrics-player__line"
                  type="button"
                  data-active={active}
                  aria-current={active ? "true" : undefined}
                  aria-label={`Seek to ${formatDuration(timestamp / 1000)}: ${line.value}`}
                  key={`${timestamp}-${index}-${line.value}`}
                  onClick={() => onSeek(timestamp / 1000)}
                >
                  <span>{line.value}</span>
                  <time>{formatDuration(timestamp / 1000)}</time>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
