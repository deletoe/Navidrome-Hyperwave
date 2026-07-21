import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { AudioPlayerController } from "../hooks/useAudioPlayer";
import type { AudioPreferencesController } from "../hooks/useAudioPreferences";
import type { VisualizerMode } from "../lib/visualPreferences";
import type { Track } from "../types";
import { AppIcon } from "./AppIcon";
import { AudioTuningPanel } from "./AudioTuningPanel";
import { Artwork } from "./Artwork";

export interface PlayerDockProps {
  currentTrack?: Track;
  player: AudioPlayerController;
  coverUrl: (coverArt?: string, size?: number) => string;
  queuePanelId: string;
  queueOpen: boolean;
  onToggleQueue: () => void;
  visualizer?: ReactNode;
  visualizerMode?: VisualizerMode;
  onSetVisualizerMode?: (mode: VisualizerMode) => void;
  audioSettings?: AudioPreferencesController;
  pageOpen?: boolean;
  onOpenNowPlaying?: () => void;
  audioSettingsRequest?: number;
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
  onToggleQueue,
  visualizer,
  visualizerMode = "hybrid",
  onSetVisualizerMode,
  audioSettings,
  pageOpen = false,
  onOpenNowPlaying,
  audioSettingsRequest = 0,
}: PlayerDockProps) {
  const [tuningOpen, setTuningOpen] = useState(false);
  const tuningId = useId();
  const tuningRef = useRef<HTMLDivElement>(null);
  const tuningCloseRef = useRef<HTMLButtonElement>(null);
  const tuningTriggerRef = useRef<HTMLButtonElement>(null);
  const lastAudioSettingsRequest = useRef(audioSettingsRequest);
  const openedFromPlayerPage = useRef(false);
  const restoreTuningFocus = useRef(false);
  const dockRef = useRef<HTMLElement>(null);
  const title = currentTrack?.title ?? "Nothing playing";
  const artist = currentTrack?.displayArtist || currentTrack?.artist || "Choose a track to begin";
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
  const portalTarget = typeof document === "undefined"
    ? null
    : dockRef.current?.closest(".app") ?? document.body;

  function closeTuning(restoreFocus: boolean): void {
    restoreTuningFocus.current = restoreFocus;
    setTuningOpen(false);
  }

  useEffect(() => {
    if (tuningOpen || !restoreTuningFocus.current) return;
    restoreTuningFocus.current = false;
    if (openedFromPlayerPage.current) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    } else {
      tuningTriggerRef.current?.focus();
    }
  }, [tuningOpen]);

  useEffect(() => {
    if (lastAudioSettingsRequest.current === audioSettingsRequest) return;
    lastAudioSettingsRequest.current = audioSettingsRequest;
    if (!audioSettings || audioSettingsRequest <= 0) return;
    openedFromPlayerPage.current = true;
    setTuningOpen(true);
  }, [audioSettings, audioSettingsRequest]);

  useEffect(() => {
    if (!tuningOpen || queueOpen) return;
    tuningCloseRef.current?.focus();
    function containFocus(event: KeyboardEvent): void {
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
      }
    }
    document.addEventListener("keydown", containFocus);
    return () => document.removeEventListener("keydown", containFocus);
  }, [queueOpen, tuningOpen]);

  useEffect(() => {
    if (queueOpen && tuningOpen) closeTuning(false);
  }, [queueOpen, tuningOpen]);

  return (
    <section
      ref={dockRef}
      className={`player-dock mini-player${pageOpen ? " player-dock--page-open" : ""}`}
      data-playing={player.isPlaying}
      data-has-track={Boolean(currentTrack)}
      data-visualizer-mode={visualizerMode}
      data-visualizer-status={player.visualizer.status}
      aria-label="Compact player"
    >
      {visualizer ? <div className="player-dock__visualizer-stage" aria-hidden="true">{visualizer}</div> : null}

      <button
        className="player-dock__track-link"
        type="button"
        aria-label={`Return to now playing: ${title}`}
        disabled={!currentTrack || !onOpenNowPlaying}
        onClick={onOpenNowPlaying}
      >
        <Artwork
          className="player-dock__artwork"
          src={coverUrl(currentTrack?.coverArt, 256)}
          alt=""
          eager
        />
        <span className="player-dock__identity">
          <strong>{title}</strong>
          <span>{artist}</span>
          <span>{currentTrack?.album || "Archive ready"}</span>
        </span>
      </button>

      <div className="player-controls" aria-label="Playback controls">
        <button className="icon-button" type="button" aria-label="Previous track" onClick={player.previous} disabled={!currentTrack}>
          <AppIcon name="previous" />
        </button>
        <button
          className="icon-button icon-button--primary"
          type="button"
          aria-label={`${player.isPlaying ? "Pause" : "Play"} ${title}`}
          onClick={() => void player.toggle()}
          disabled={!currentTrack}
        >
          <AppIcon name={player.isPlaying ? "pause" : "play"} />
        </button>
        <button className="icon-button" type="button" aria-label="Next track" onClick={player.next} disabled={!currentTrack}>
          <AppIcon name="next" />
        </button>
      </div>

      <div className="player-dock__actions">
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
            onClick={() => {
              openedFromPlayerPage.current = false;
              setTuningOpen(true);
            }}
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

      {player.error ? <p className="player-error" role="alert">{player.error}</p> : null}

      {tuningOpen && audioSettings && portalTarget ? createPortal((
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
      ), portalTarget) : null}

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
