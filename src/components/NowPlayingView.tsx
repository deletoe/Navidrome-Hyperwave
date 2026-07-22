import { useEffect, useId, useState, type ReactNode } from "react";

import type { AudioPlayerController } from "../hooks/useAudioPlayer";
import type { TrackLyricsController } from "../hooks/useTrackLyrics";
import { formatDuration } from "../lib/format";
import type { VisualizerMode } from "../lib/visualPreferences";
import type { Artist, Track } from "../types";
import { AppIcon } from "./AppIcon";
import { ArtistLinks } from "./ArtistLinks";
import { Artwork } from "./Artwork";
import { LyricsPlayer } from "./LyricsPlayer";

export interface NowPlayingViewProps {
  track: Track;
  player: AudioPlayerController;
  lyrics: TrackLyricsController;
  coverUrl: (coverArt?: string, size?: number) => string;
  isStarred: boolean;
  queueOpen: boolean;
  visualizerMode: VisualizerMode;
  visualizer?: ReactNode;
  onBack(): void;
  onToggleStar(): void;
  onOpenArtist(artist: Artist): void;
  onToggleQueue(): void;
  onOpenAudioSettings(): void;
  onOpenOutputSettings(): void;
}

export function NowPlayingView({
  track,
  player,
  lyrics,
  coverUrl,
  isStarred,
  queueOpen,
  visualizerMode,
  visualizer,
  onBack,
  onToggleStar,
  onOpenArtist,
  onToggleQueue,
  onOpenAudioSettings,
  onOpenOutputSettings,
}: NowPlayingViewProps) {
  const [surface, setSurface] = useState<"artwork" | "lyrics">("artwork");
  const positionId = useId();
  const volumeId = useId();
  const maximum = Math.max(player.duration || track.duration || 0, 1);
  const position = Math.min(player.progress, maximum);
  const artist = track.displayArtist || track.artist || "Unknown artist";

  useEffect(() => {
    if (surface === "lyrics") void lyrics.load();
  }, [lyrics.load, surface, track.id]);

  return (
    <section
      className={`now-playing-view${surface === "lyrics" ? " now-playing-view--lyrics" : ""}`}
      aria-labelledby="now-playing-title"
      data-playing={player.isPlaying}
      data-surface={surface}
      data-visualizer-mode={visualizerMode}
    >
      <header className="now-playing-view__topbar">
        <button className="button-with-icon" type="button" onClick={onBack}>
          <AppIcon name="back" />
          Back to browsing
        </button>
        <div className="now-playing-view__topbar-actions">
          <button
            className={`icon-button${isStarred ? " is-starred" : ""}`}
            type="button"
            aria-pressed={isStarred}
            aria-label={`${isStarred ? "Unstar" : "Star"} ${track.title}`}
            title={`${isStarred ? "Unstar" : "Star"} ${track.title}`}
            onClick={onToggleStar}
          >
            <AppIcon name="favorite" filled={isStarred} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Open audio output settings"
            title="Audio output"
            onClick={onOpenOutputSettings}
          >
            <AppIcon name="output" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Open equalizer and stereo fusion"
            title="Equalizer and stereo fusion"
            onClick={onOpenAudioSettings}
          >
            <AppIcon name="equalizer" />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-expanded={queueOpen}
            aria-label={`${queueOpen ? "Close" : "Open"} playback queue`}
            title={`${queueOpen ? "Close" : "Open"} playback queue`}
            onClick={onToggleQueue}
          >
            <AppIcon name="queue" />
          </button>
        </div>
      </header>

      <div className="now-playing-view__stage">
        {visualizer ? <div className="now-playing-view__visualizer" aria-hidden="true">{visualizer}</div> : null}
        {surface === "lyrics" ? (
          <LyricsPlayer
            track={track}
            artworkUrl={coverUrl(track.coverArt, 512)}
            lyrics={lyrics}
            progress={player.progress}
            playing={player.isPlaying}
            onShowArtwork={() => setSurface("artwork")}
            onSeek={player.seek}
          />
        ) : (
          <div className="now-playing-view__artwork-surface">
            <button
              className="now-playing-view__artwork-toggle"
              type="button"
              aria-label={`Show lyrics for ${track.title}`}
              title="Show lyrics"
              onClick={() => setSurface("lyrics")}
            >
              <Artwork
                className="now-playing-view__artwork"
                src={coverUrl(track.coverArt, 960)}
                alt={`${track.title} cover`}
                eager
              />
              <span><AppIcon name="lyrics" /> Lyrics</span>
            </button>
            <div className="now-playing-view__identity">
              <p className="eyebrow">Now playing</p>
              <h1 id="now-playing-title">{track.title}</h1>
              <ArtistLinks entity={track} onOpenArtist={onOpenArtist} />
              <p>{artist} · {track.album || "Unknown album"}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="now-playing-view__transport">
        <div className="now-playing-view__timeline">
          <label htmlFor={positionId}>Playback position</label>
          <input
            id={positionId}
            type="range"
            min="0"
            max={maximum}
            step="1"
            value={position}
            aria-valuetext={`${formatDuration(position)} of ${formatDuration(maximum)}`}
            onChange={(event) => player.seek(event.currentTarget.valueAsNumber)}
          />
          <output htmlFor={positionId}>{formatDuration(position)} / {formatDuration(maximum)}</output>
        </div>
        <div className="now-playing-view__controls" aria-label="Playback controls">
          <button className="icon-button" type="button" aria-label="Previous track" onClick={player.previous}>
            <AppIcon name="previous" />
          </button>
          <button
            className="icon-button icon-button--primary"
            type="button"
            aria-label={player.isPlaying ? "Pause playback" : "Start playback"}
            onClick={() => void player.toggle()}
          >
            <AppIcon name={player.isPlaying ? "pause" : "play"} />
          </button>
          <button className="icon-button" type="button" aria-label="Next track" onClick={player.next}>
            <AppIcon name="next" />
          </button>
        </div>
        <div className="now-playing-view__volume">
          <button
            className="icon-button"
            type="button"
            aria-pressed={player.muted}
            aria-label={player.muted ? "Unmute" : "Mute"}
            onClick={player.toggleMute}
          >
            <AppIcon name={player.muted ? "mute" : "volume"} />
          </button>
          <label className="sr-only" htmlFor={volumeId}>Volume</label>
          <input
            id={volumeId}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={player.muted ? 0 : player.volume}
            aria-valuetext={`${Math.round((player.muted ? 0 : player.volume) * 100)} percent`}
            onChange={(event) => player.setVolume(event.currentTarget.valueAsNumber)}
          />
        </div>
      </footer>
    </section>
  );
}
