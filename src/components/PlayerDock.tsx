import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { AudioPlayerController } from "../hooks/useAudioPlayer";
import type { AudioPreferencesController } from "../hooks/useAudioPreferences";
import type { TrackLyricsController } from "../hooks/useTrackLyrics";
import { formatDuration } from "../lib/format";
import { VISUALIZER_MODES, type VisualizerMode } from "../lib/visualPreferences";
import type { Artist, Track } from "../types";
import { AppIcon } from "./AppIcon";
import { AudioTuningPanel } from "./AudioTuningPanel";
import { ArtistLinks } from "./ArtistLinks";
import { Artwork } from "./Artwork";
import { LyricsPlayer } from "./LyricsPlayer";

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
  visualizer?: ReactNode;
  visualizerMode?: VisualizerMode;
  onSetVisualizerMode?: (mode: VisualizerMode) => void;
  audioSettings?: AudioPreferencesController;
  lyrics?: TrackLyricsController;
}

const VISUALIZER_MODE_LABELS: Record<VisualizerMode, string> = {
  off: "Off",
  spectrum: "Spectrum",
  particles: "Particles",
  hybrid: "Hybrid",
};

const ACTIVE_VISUALIZER_MODES: VisualizerMode[] = ["spectrum", "particles", "hybrid"];
const MODAL_FOCUSABLE_SELECTOR = "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

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
  visualizer,
  visualizerMode = "hybrid",
  onSetVisualizerMode,
  audioSettings,
  lyrics,
}: PlayerDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [expandedView, setExpandedView] = useState<"artwork" | "lyrics">("artwork");
  const expandedId = useId();
  const tuningId = useId();
  const positionId = useId();
  const volumeId = useId();
  const visualizerName = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const tuningCloseRef = useRef<HTMLButtonElement>(null);
  const tuningTriggerRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const tuningRef = useRef<HTMLDivElement>(null);
  const restoreFocusOnClose = useRef(false);
  const restoreTuningFocusOnClose = useRef(false);
  const tuningOpenedFromSheet = useRef(false);
  const maximum = Math.max(player.duration || currentTrack?.duration || 0, 1);
  const position = Math.min(player.progress, maximum);
  const activeVisualizerIndex = ACTIVE_VISUALIZER_MODES.indexOf(visualizerMode);
  const nextVisualizerMode = visualizerMode === "off"
    ? "spectrum"
    : ACTIVE_VISUALIZER_MODES[(activeVisualizerIndex + 1) % ACTIVE_VISUALIZER_MODES.length]!;
  const visualizerSignal = getVisualizerSignal(
    visualizerMode,
    player.visualizer.status,
    player.visualizer.supported,
    player.isPlaying,
  );

  function closeExpanded(restoreFocus: boolean): void {
    restoreFocusOnClose.current = restoreFocus;
    setExpanded(false);
  }

  function closeTuning(restoreFocus: boolean): void {
    restoreTuningFocusOnClose.current = restoreFocus;
    setTuningOpen(false);
  }

  function openTuning(fromSheet: boolean): void {
    tuningOpenedFromSheet.current = fromSheet;
    closeExpanded(false);
    setTuningOpen(true);
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
        sheetRef.current?.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR) ?? [],
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
    if (!tuningOpen || queueOpen) return;
    tuningCloseRef.current?.focus();
    function containTuningFocus(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        closeTuning(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        tuningRef.current?.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR) ?? [],
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
      } else if (!tuningRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", containTuningFocus);
    return () => document.removeEventListener("keydown", containTuningFocus);
  }, [queueOpen, tuningOpen]);

  useEffect(() => {
    if (expanded || !restoreFocusOnClose.current) return;
    restoreFocusOnClose.current = false;
    expandRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (tuningOpen || !restoreTuningFocusOnClose.current) return;
    restoreTuningFocusOnClose.current = false;
    (tuningOpenedFromSheet.current ? expandRef.current : tuningTriggerRef.current)?.focus();
  }, [tuningOpen]);

  useEffect(() => {
    if (queueOpen && expanded) closeExpanded(false);
    if (queueOpen && tuningOpen) closeTuning(false);
  }, [expanded, queueOpen, tuningOpen]);

  useEffect(() => {
    if (!currentTrack) {
      closeExpanded(false);
      closeTuning(false);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!expanded || expandedView !== "lyrics" || !lyrics) return;
    void lyrics.load();
  }, [currentTrack?.id, expanded, expandedView, lyrics?.load]);

  const title = currentTrack?.title ?? "Nothing playing";
  const artist = currentTrack?.displayArtist || currentTrack?.artist || "Choose a track to begin";
  const sheetPortalTarget = typeof document === "undefined"
    ? null
    : dockRef.current?.closest(".app") ?? document.body;

  function openQueueFromSheet(): void {
    closeExpanded(true);
    onToggleQueue();
  }

  function openArtistFromSheet(artist: Artist): void {
    closeExpanded(false);
    onOpenArtist?.(artist);
  }

  function showLyrics(): void {
    setExpandedView("lyrics");
  }

  return (
    <section
      ref={dockRef}
      className="player-dock mini-player"
      data-playing={player.isPlaying}
      data-has-track={Boolean(currentTrack)}
      data-visualizer-mode={visualizerMode}
      data-visualizer-status={player.visualizer.status}
      aria-labelledby="now-playing-heading"
    >
      {visualizer ? (
        <div className="player-dock__visualizer-stage" aria-hidden="true">
          {visualizer}
        </div>
      ) : null}
      <header className="player-dock__heading">
        <div>
          <p className="eyebrow">Now playing</p>
          <h2 id="now-playing-heading">Playback signal</h2>
        </div>
        <div className="player-dock__heading-actions">
          {audioSettings ? (
            <button
              className="icon-button"
              ref={tuningTriggerRef}
              type="button"
              aria-expanded={tuningOpen}
              aria-controls={tuningId}
              aria-label="Open equalizer and stereo fusion"
              title="Equalizer and stereo fusion"
              disabled={!currentTrack}
              onClick={() => openTuning(false)}
            >
              <AppIcon name="equalizer" />
            </button>
          ) : null}
          <button
            className="player-dock__visualizer-toggle"
            type="button"
            aria-label={`${visualizerSignal}. Switch to ${VISUALIZER_MODE_LABELS[nextVisualizerMode]} visualizer`}
            title={`${visualizerSignal}. Switch to ${VISUALIZER_MODE_LABELS[nextVisualizerMode]}`}
            disabled={!player.visualizer.supported || !onSetVisualizerMode}
            onClick={() => onSetVisualizerMode?.(nextVisualizerMode)}
          >
            <AppIcon name="visualizer" />
            <span>{visualizerSignal}</span>
          </button>
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
        </div>
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

      {expanded && sheetPortalTarget ? createPortal((
        <div
          ref={sheetRef}
          className={`player-sheet${expandedView === "lyrics" ? " player-sheet--lyrics" : ""}`}
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
          {expandedView === "lyrics" && lyrics && currentTrack ? (
            <LyricsPlayer
              track={currentTrack}
              artworkUrl={coverUrl(currentTrack.coverArt, 512)}
              lyrics={lyrics}
              progress={player.progress}
              playing={player.isPlaying}
              onShowArtwork={() => setExpandedView("artwork")}
              onSeek={player.seek}
            />
          ) : (
            <>
              {lyrics ? (
                <button
                  className="player-sheet__artwork-toggle"
                  type="button"
                  aria-label={`Show lyrics for ${title}`}
                  title="Show lyrics"
                  onClick={showLyrics}
                >
                  <Artwork
                    className="player-sheet__artwork"
                    src={coverUrl(currentTrack?.coverArt, 960)}
                    alt={`${title} cover`}
                    eager
                  />
                  <span><AppIcon name="lyrics" /> Lyrics</span>
                </button>
              ) : (
                <Artwork
                  className="player-sheet__artwork"
                  src={coverUrl(currentTrack?.coverArt, 960)}
                  alt={`${title} cover`}
                  eager
                />
              )}
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
              {onSetVisualizerMode ? (
                <fieldset className="player-sheet__visualizer">
                  <legend>Live visualizer</legend>
                  <p role="status">{visualizerSignal}</p>
                  <div>
                    {VISUALIZER_MODES.map((mode) => (
                      <label key={mode}>
                        <input
                          type="radio"
                          name={visualizerName}
                          value={mode}
                          checked={visualizerMode === mode}
                          disabled={!player.visualizer.supported && mode !== "off"}
                          onChange={() => onSetVisualizerMode(mode)}
                        />
                        <span>{VISUALIZER_MODE_LABELS[mode]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          )}
          {audioSettings ? (
            <button
              className="player-sheet__audio-settings button-with-icon"
              type="button"
              onClick={() => openTuning(true)}
            >
              <AppIcon name="equalizer" />
              Open audio settings
            </button>
          ) : null}
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
      ), sheetPortalTarget) : null}

      {tuningOpen && audioSettings && sheetPortalTarget ? createPortal((
        <div
          ref={tuningRef}
          className="audio-tuning-dialog"
          id={tuningId}
          role="dialog"
          aria-modal="true"
          aria-label="Equalizer and stereo fusion"
        >
          <div className="audio-tuning-dialog__topbar">
            <div>
              <p className="eyebrow">Audio settings</p>
              <strong>{title}</strong>
              <span>{artist}</span>
            </div>
            <button
              className="icon-button"
              ref={tuningCloseRef}
              type="button"
              aria-label="Close audio settings"
              title="Close audio settings"
              onClick={() => closeTuning(true)}
            >
              <AppIcon name="close" />
            </button>
          </div>
          <AudioTuningPanel settings={audioSettings} processing={player.audioProcessing} />
        </div>
      ), sheetPortalTarget) : null}

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

function getVisualizerSignal(
  mode: VisualizerMode,
  status: AudioPlayerController["visualizer"]["status"],
  supported: boolean,
  playing: boolean,
): string {
  const label = VISUALIZER_MODE_LABELS[mode].toUpperCase();
  if (mode === "off") return "VIZ · OFF";
  if (!supported || status === "unavailable") return "VIZ · UNAVAILABLE";
  if (status === "waiting") return `ARMED · ${label}`;
  return `${playing ? "LIVE" : "READY"} · ${label}`;
}
