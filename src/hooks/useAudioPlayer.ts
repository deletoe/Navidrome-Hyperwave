import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
} from "react";

import { createStableMediaUrlResolver } from "../lib/mediaUrls";
import type { SubsonicClient } from "../lib/subsonic";
import {
  getCurrentOccurrenceKey,
  type QueueAction,
  type QueueState,
} from "../state/playerQueue";
import type { Track } from "../types";

export interface UseAudioPlayerOptions {
  client?: SubsonicClient;
  currentTrack?: Track;
  queueState: QueueState;
  dispatch: Dispatch<QueueAction>;
}

export interface AudioPlayerController {
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  error?: string;
  play(): Promise<void>;
  pause(): void;
  toggle(): Promise<void>;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  toggleMute(): void;
  reset(): void;
  handleTimeUpdate(): void;
  handleLoadedMetadata(): void;
  handleEnded(): void;
  handleError(): void;
}

export function getScrobbleThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration * 0.5, 240);
}

export function useAudioPlayer({
  client,
  currentTrack,
  queueState,
  dispatch,
}: UseAudioPlayerOptions): AudioPlayerController {
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedOccurrenceKey = useRef<number | string | undefined>(undefined);
  const loadedClient = useRef<SubsonicClient | undefined>(undefined);
  const playingRef = useRef(false);
  const startedForLoad = useRef(false);
  const submittedForLoad = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.86);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string>();
  const currentOccurrenceKey = getCurrentOccurrenceKey(queueState);

  const mediaUrls = useMemo(
    () =>
      client
        ? createStableMediaUrlResolver((kind, id, size) =>
            kind === "cover" ? client.coverArtUrl(id, size) : client.streamUrl(id),
          )
        : undefined,
    [client],
  );

  const reset = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    loadedOccurrenceKey.current = undefined;
    loadedClient.current = undefined;
    playingRef.current = false;
    startedForLoad.current = false;
    submittedForLoad.current = false;
    mediaUrls?.clear();
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);
    setError(undefined);
  }, [mediaUrls]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!client || !currentTrack || !mediaUrls) {
      reset();
      return;
    }
    const loadKey = currentOccurrenceKey ?? currentTrack.id;
    if (loadedOccurrenceKey.current === loadKey && loadedClient.current === client) return;

    audio.src = mediaUrls.stream(currentTrack.id);
    audio.load();
    loadedOccurrenceKey.current = loadKey;
    loadedClient.current = client;
    startedForLoad.current = false;
    submittedForLoad.current = false;
    setProgress(0);
    setDuration(currentTrack.duration ?? 0);
    setError(undefined);

    if (playingRef.current) {
      void audio
        .play()
        .then(() => submitStartScrobble(client, currentTrack))
        .catch((playError: unknown) => {
          playingRef.current = false;
          setIsPlaying(false);
          setError(playError instanceof Error ? playError.message : "Playback could not continue");
        });
    }
  }, [client, currentOccurrenceKey, currentTrack, mediaUrls, reset]);

  useEffect(() => {
    if (!currentTrack || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const artwork = currentTrack.coverArt && mediaUrls
      ? [{ src: mediaUrls.cover(currentTrack.coverArt, 512), sizes: "512x512" }]
      : [];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.displayArtist || currentTrack.artist || "Unknown artist",
        album: currentTrack.album || "",
        artwork,
      });
      navigator.mediaSession.setActionHandler("play", () => void play());
      navigator.mediaSession.setActionHandler("pause", pause);
      navigator.mediaSession.setActionHandler("previoustrack", previous);
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (typeof details.seekTime === "number") seek(details.seekTime);
      });
    } catch {
      // Media Session is optional and some browsers expose only part of the API.
    }
    return () => {
      try {
        navigator.mediaSession.metadata = null;
        const actions: MediaSessionAction[] = [
          "play",
          "pause",
          "previoustrack",
          "nexttrack",
          "seekto",
        ];
        actions.forEach((action) => navigator.mediaSession.setActionHandler(action, null));
      } catch {
        // Ignore partial implementations during teardown.
      }
    };
    // Action callbacks intentionally refresh with the current queue and track.
  }, [currentTrack?.id, mediaUrls, queueState]);

  async function play(): Promise<void> {
    const audio = audioRef.current;
    if (!audio || !client || !currentTrack) return;
    setError(undefined);
    try {
      await audio.play();
      playingRef.current = true;
      setIsPlaying(true);
      submitStartScrobble(client, currentTrack);
    } catch (playError) {
      playingRef.current = false;
      setIsPlaying(false);
      setError(playError instanceof Error ? playError.message : "Playback was blocked by the browser");
    }
  }

  function submitStartScrobble(activeClient: SubsonicClient, track: Track): void {
    if (startedForLoad.current) return;
    startedForLoad.current = true;
    void activeClient.scrobble(track.id, false).catch(() => undefined);
  }

  function pause(): void {
    audioRef.current?.pause();
    playingRef.current = false;
    setIsPlaying(false);
  }

  async function toggle(): Promise<void> {
    if (playingRef.current) pause();
    else await play();
  }

  function next(): void {
    dispatch({ type: "next" });
  }

  function previous(): void {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setProgress(0);
      return;
    }
    dispatch({ type: "previous" });
  }

  function seek(seconds: number): void {
    const audio = audioRef.current;
    if (!audio) return;
    const maximum = Number.isFinite(audio.duration) ? audio.duration : duration;
    const value = Math.min(Math.max(seconds, 0), maximum || 0);
    audio.currentTime = value;
    setProgress(value);
  }

  function setVolume(value: number): void {
    const normalized = Math.min(Math.max(value, 0), 1);
    setVolumeState(normalized);
    if (normalized > 0) setMuted(false);
  }

  function toggleMute(): void {
    setMuted((value) => !value);
  }

  function handleLoadedMetadata(): void {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(Number.isFinite(audio.duration) ? audio.duration : currentTrack?.duration ?? 0);
  }

  function handleTimeUpdate(): void {
    const audio = audioRef.current;
    if (!audio || !client || !currentTrack) return;
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : currentTrack.duration ?? 0;
    setProgress(audio.currentTime);
    setDuration(nextDuration);
    const threshold = getScrobbleThreshold(nextDuration);
    if (
      threshold > 0 &&
      audio.currentTime >= threshold &&
      !submittedForLoad.current
    ) {
      submittedForLoad.current = true;
      void client.scrobble(currentTrack.id, true).catch(() => undefined);
    }
  }

  function handleEnded(): void {
    const audio = audioRef.current;
    if (queueState.repeatMode === "one" && audio) {
      audio.currentTime = 0;
      startedForLoad.current = false;
      submittedForLoad.current = false;
      if (client && currentTrack) {
        void audio.play().then(() => submitStartScrobble(client, currentTrack));
      } else {
        void audio.play();
      }
      return;
    }
    const atEnd = queueState.currentIndex >= queueState.tracks.length - 1;
    if (atEnd && queueState.repeatMode === "off") {
      playingRef.current = false;
      setIsPlaying(false);
      return;
    }
    dispatch({ type: "next" });
  }

  function handleError(): void {
    const mediaError = audioRef.current?.error;
    const messages: Record<number, string> = {
      1: "Playback was aborted",
      2: "The audio stream was interrupted",
      3: "The browser could not decode this track",
      4: "This audio source is not supported or authentication expired",
    };
    playingRef.current = false;
    setIsPlaying(false);
    setError(messages[mediaError?.code ?? 0] ?? "The track could not be played");
  }

  return {
    audioRef,
    isPlaying,
    progress,
    duration,
    volume,
    muted,
    error,
    play,
    pause,
    toggle,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    reset,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
    handleError,
  };
}
