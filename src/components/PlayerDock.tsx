import { useEffect, useId, useRef, useState } from "react";

import type { AudioPlayerController } from "../hooks/useAudioPlayer";
import { formatDuration } from "../lib/format";
import type { Artist, Track } from "../types";
import { AppIcon } from "./AppIcon";
import { ArtistLinks } from "./ArtistLinks";
import { Artwork } from "./Artwork";

export interface PlayerDockProps {
  currentTrack?: Track;
  player: AudioPlayerController;
  coverUrl: (coverArt?: string, size?: number) => string;
  queuePanelId: string;
  queueOpen: boolean;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onOpenArtist?: (artist: Artist) => void;
  onToggleQueue: () => void;
}

export function PlayerDock({
  currentTrack,
  player,
  coverUrl,
  queuePanelId,
  queueOpen,
  isStarred = false,
  onToggleStar,
  onOpenArtist,
  onToggleQueue,
}: PlayerDockProps) {
  const [expanded, setExpanded] = useState(false);
  const expandedId = useId();
  const positionId = useId();
  const volumeId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreFocusOnClose = useRef(false);
  const maximum = Math.max(player.duration || currentTrack?.duration || 0, 1);
  const position = Math.min(player.progress, maximum);

  function closeExpanded(restoreFocus: boolean): void {
    restoreFocusOnClose.current = restoreFocus;
    setExpanded(false);
  }

  useEffect(() => {
    if (!expanded || queueOpen) return;
    closeRef.current?.focus();
    function containKeyboardFocus(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeExpanded(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!sheetRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", containKeyboardFocus);
    return () => document.removeEventListener("keydown", containKeyboardFocus);
  }, [expanded, queueOpen]);

  useEffect(() => {
    if (expanded || !restoreFocusOnClose.current) return;
    restoreFocusOnClose.current = false;
    expandRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (queueOpen && expanded) closeExpanded(false);
  }, [expanded, queueOpen]);

  useEffect(() => {
    if (!currentTrack) closeExpanded(false);
  }, [currentTrack]);

  const title = currentTrack?.title ?? "Nothing playing";
  const artist = currentTrack?.displayArtist || currentTrack?.artist || "Choose a track to begin";

  function openQueueFromSheet(): void {
    closeExpanded(true);
    onToggleQueue();
  }

  function openArtistFromSheet(artist: Artist): void {
    closeExpanded(false);
    onOpenArtist?.(artist);
  }

  return (
    <section
      className="player-dock mini-player"
      data-playing={player.isPlaying}
      data-has-track={Boolean(currentTrack)}
      aria-labelledby="now-playing-heading"
    >
      <header className="player-dock__heading">
        <div>
          <p className="eyebrow">Now playing</p>
          <h2 id="now-playing-heading">Playback signal</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-expanded={queueOpen}
          aria-controls={queuePanelId}
          aria-label={`${queueOpen ? "Close" : "Open"} playback queue`}
          title={`${queueOpen ? "Close" : "Open"} playback queue`}
          onClick={onToggleQueue}
        >
          <AppIcon name="queue" />
        </button>
      </header>

      <div className="player-dock__track">
        <Artwork
          className="player-dock__artwork"
          src={coverUrl(currentTrack?.coverArt, 512)}
          alt={`${title} cover`}
          eager
        />
        <div>
          <strong>{title}</strong>
          <span>{artist}</span>
          <span>{currentTrack?.album || "Archive ready"}</span>
        </div>
        <button
          className={`player-dock__favorite icon-button${isStarred ? " is-starred" : ""}`}
          type="button"
          aria-pressed={isStarred}
          aria-label={`${isStarred ? "Unstar" : "Star"} ${title}`}
          title={`${isStarred ? "Unstar" : "Star"} ${title}`}
          disabled={!currentTrack || !onToggleStar}
          onClick={onToggleStar}
        >
          <AppIcon name="favorite" filled={isStarred} />
        </button>
        <button
          className="icon-button"
          ref={expandRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={expandedId}
          aria-label="Open now playing"
          title="Open now playing"
          disabled={!currentTrack}
          onClick={() => setExpanded(true)}
        >
          <AppIcon name="expand" />
        </button>
      </div>

      <div className="player-controls" aria-label="Playback controls">
        <button
          className="icon-button"
          type="button"
          aria-label="Previous track"
          title="Previous track"
          onClick={player.previous}
          disabled={!currentTrack}
        >
          <AppIcon name="previous" />
        </button>
        <button
          className="icon-button icon-button--primary"
          type="button"
          aria-label={`${player.isPlaying ? "Pause" : "Play"} ${title}`}
          title={`${player.isPlaying ? "Pause" : "Play"} ${title}`}
          onClick={() => void player.toggle()}
          disabled={!currentTrack}
        >
          <AppIcon name={player.isPlaying ? "pause" : "play"} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Next track"
          title="Next track"
          onClick={player.next}
          disabled={!currentTrack}
        >
          <AppIcon name="next" />
        </button>
      </div>

      <div className="player-sliders">
        <label htmlFor={positionId}>Playback position</label>
        <input
          id={positionId}
          type="range"
          min="0"
          max={maximum}
          step="1"
          value={position}
          aria-valuetext={`${formatDuration(position)} of ${formatDuration(maximum)}`}
          disabled={!currentTrack}
          onChange={(event) => player.seek(event.currentTarget.valueAsNumber)}
        />
        <output htmlFor={positionId}>
          {formatDuration(position)} / {formatDuration(maximum)}
        </output>

        <label htmlFor={volumeId}>Volume</label>
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
        <button
          className="icon-button"
          type="button"
          aria-pressed={player.muted}
          aria-label={player.muted ? "Unmute" : "Mute"}
          title={player.muted ? "Unmute" : "Mute"}
          onClick={player.toggleMute}
        >
          <AppIcon name={player.muted ? "mute" : "volume"} />
        </button>
      </div>

      {player.error ? (
        <div className="player-error" role="alert">
          <p>{player.error}</p>
          <button
            className="button-with-icon"
            type="button"
            onClick={player.next}
            disabled={!currentTrack}
          >
            <AppIcon name="next" />
            Try next track
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div
          ref={sheetRef}
          className="player-sheet"
          id={expandedId}
          role="dialog"
          aria-modal="true"
          aria-label="Now playing"
        >
          <button
            className="icon-button"
            ref={closeRef}
            type="button"
            aria-label="Close now playing"
            title="Close now playing"
            onClick={() => closeExpanded(true)}
          >
            <AppIcon name="close" />
          </button>
          <Artwork
            className="player-sheet__artwork"
            src={coverUrl(currentTrack?.coverArt, 960)}
            alt={`${title} cover`}
            eager
          />
          <p className="eyebrow">Full signal</p>
          <h2>{title}</h2>
          {currentTrack && onOpenArtist ? (
            <ArtistLinks
              className="player-sheet__artist-links"
              entity={currentTrack}
              onOpenArtist={openArtistFromSheet}
            />
          ) : (
            <p>{artist}</p>
          )}
          <p>{currentTrack?.album || "Unknown album"}</p>
          <button
            className={`player-sheet__favorite icon-button${isStarred ? " is-starred" : ""}`}
            type="button"
            aria-pressed={isStarred}
            aria-label={`${isStarred ? "Unstar" : "Star"} ${title}`}
            title={`${isStarred ? "Unstar" : "Star"} ${title}`}
            disabled={!currentTrack || !onToggleStar}
            onClick={onToggleStar}
          >
            <AppIcon name="favorite" filled={isStarred} />
          </button>
          <div className="player-sheet__controls" aria-label="Expanded playback controls">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous track"
              title="Previous track"
              onClick={player.previous}
            >
              <AppIcon name="previous" />
            </button>
            <button
              className="icon-button icon-button--primary"
              type="button"
              aria-label={player.isPlaying ? "Pause playback" : "Start playback"}
              title={player.isPlaying ? "Pause playback" : "Start playback"}
              onClick={() => void player.toggle()}
            >
              <AppIcon name={player.isPlaying ? "pause" : "play"} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Next track"
              title="Next track"
              onClick={player.next}
            >
              <AppIcon name="next" />
            </button>
          </div>
          <button
            className="button-with-icon"
            type="button"
            aria-expanded={queueOpen}
            aria-controls={queuePanelId}
            onClick={openQueueFromSheet}
          >
            <AppIcon name="queue" />
            {queueOpen ? "Close queue" : "Open queue"}
          </button>
        </div>
      ) : null}

      <audio
        ref={player.audioRef}
        crossOrigin="anonymous"
        preload="metadata"
        onTimeUpdate={player.handleTimeUpdate}
        onLoadedMetadata={player.handleLoadedMetadata}
        onEnded={player.handleEnded}
        onError={player.handleError}
      />
    </section>
  );
}
