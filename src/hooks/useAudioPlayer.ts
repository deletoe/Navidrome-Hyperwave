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
import type { AudioVisualizerFrame } from "../lib/visualizerRenderer";
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
  visualizerEnabled?: boolean;
}

export type AudioVisualizerStatus = "off" | "waiting" | "ready" | "unavailable";

export interface AudioVisualizerController {
  supported: boolean;
  status: AudioVisualizerStatus;
  error?: string;
  activate(): Promise<void>;
  readFrame(): AudioVisualizerFrame | undefined;
}

export interface AudioPlayerController {
  audioRef: RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  error?: string;
  visualizer: AudioVisualizerController;
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

interface AudioGraph {
  audio: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  analyser?: AnalyserNode;
  frequency?: Uint8Array<ArrayBuffer>;
  waveform?: Uint8Array<ArrayBuffer>;
}

const VISUALIZER_RESUME_TIMEOUT_MS = 600;

export function getScrobbleThreshold(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(duration * 0.5, 240);
}

export function useAudioPlayer({
  client,
  currentTrack,
  queueState,
  dispatch,
  visualizerEnabled = false,
}: UseAudioPlayerOptions): AudioPlayerController {
  const audioRef = useRef<HTMLAudioElement>(null);
  const loadedOccurrenceKey = useRef<number | string | undefined>(undefined);
  const loadedClient = useRef<SubsonicClient | undefined>(undefined);
  const playingRef = useRef(false);
  const startedForLoad = useRef(false);
  const submittedForLoad = useRef(false);
  const audioGraph = useRef<AudioGraph | undefined>(undefined);
  const pendingAudioGraph = useRef<{
    audio: HTMLAudioElement;
    promise: Promise<void>;
  } | undefined>(undefined);
  const playbackAttempt = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.86);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string>();
  const [visualizerStatus, setVisualizerStatus] = useState<AudioVisualizerStatus>(
    visualizerEnabled ? "waiting" : "off",
  );
  const [visualizerError, setVisualizerError] = useState<string>();
  const currentOccurrenceKey = getCurrentOccurrenceKey(queueState);
  const AudioContextConstructor = getAudioContextConstructor();

  useEffect(() => {
    if (!visualizerEnabled) {
      setVisualizerStatus("off");
      return;
    }
    if (audioGraph.current && !audioGraph.current.analyser) {
      setVisualizerStatus("unavailable");
      return;
    }
    setVisualizerStatus(
      audioGraph.current?.analyser && String(audioGraph.current.context.state) === "running"
        ? "ready"
        : "waiting",
    );
  }, [visualizerEnabled]);

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
    playbackAttempt.current += 1;
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

    playbackAttempt.current += 1;
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
      const attempt = ++playbackAttempt.current;
      void audio
        .play()
        .then(() => {
          if (!isCurrentPlaybackAttempt(attempt, audio, loadKey, client)) return;
          setIsPlaying(true);
          submitStartScrobble(client, currentTrack);
        })
        .catch((playError: unknown) => {
          if (!isCurrentPlaybackAttempt(attempt, audio, loadKey, client)) return;
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
    const loadKey = loadedOccurrenceKey.current ?? currentOccurrenceKey ?? currentTrack.id;
    const attempt = ++playbackAttempt.current;
    setError(undefined);
    try {
      if (visualizerEnabled) {
        // Web Audio is an enhancement. Some browsers leave context.resume()
        // pending until a later gesture, so playback must never wait for it.
        void activateVisualizer().catch(() => undefined);
      } else if (audioGraph.current?.context.state === "suspended") {
        void audioGraph.current.context.resume().catch(() => undefined);
      }
      await audio.play();
      if (!isCurrentPlaybackAttempt(attempt, audio, loadKey, client)) return;
      playingRef.current = true;
      setIsPlaying(true);
      submitStartScrobble(client, currentTrack);
    } catch (playError) {
      if (!isCurrentPlaybackAttempt(attempt, audio, loadKey, client)) return;
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
    playbackAttempt.current += 1;
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
      setProgress(0);
      startedForLoad.current = false;
      submittedForLoad.current = false;
      if (!client || !currentTrack) {
        playbackAttempt.current += 1;
        playingRef.current = false;
        setIsPlaying(false);
        return;
      }
      // Reuse the guarded playback path so a rejected repeat or a late promise
      // from the previous occurrence cannot leave the player looking active.
      void play();
      return;
    }
    const atEnd = queueState.currentIndex >= queueState.tracks.length - 1;
    if (atEnd && queueState.repeatMode === "off") {
      playbackAttempt.current += 1;
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
    playbackAttempt.current += 1;
    playingRef.current = false;
    setIsPlaying(false);
    setError(messages[mediaError?.code ?? 0] ?? "The track could not be played");
  }

  async function activateVisualizer(): Promise<void> {
    const audio = audioRef.current;
    if (!audio) {
      setVisualizerStatus("waiting");
      return;
    }
    if (!AudioContextConstructor) {
      setVisualizerStatus("unavailable");
      setVisualizerError("Web Audio is not available in this browser");
      return;
    }
    const existing = audioGraph.current;
    if (existing?.audio === audio) {
      if (!existing.analyser) {
        setVisualizerStatus("unavailable");
        setVisualizerError("The audio stream could not be connected to Web Audio");
        return;
      }
      const contextState = await resumeAudioContext(existing.context);
      if (contextState === "running") {
        setVisualizerStatus("ready");
        setVisualizerError(undefined);
      } else if (contextState === "closed") {
        setVisualizerStatus("unavailable");
        setVisualizerError("The browser closed the live audio analyser");
      } else {
        setVisualizerStatus("waiting");
        setVisualizerError(undefined);
      }
      return;
    }
    const pending = pendingAudioGraph.current;
    if (pending?.audio === audio) return pending.promise;
    if (existing && existing.audio !== audio) {
      void existing.context.close().catch(() => undefined);
      audioGraph.current = undefined;
    }

    const promise = buildAudioGraph(audio, AudioContextConstructor);
    pendingAudioGraph.current = { audio, promise };
    try {
      await promise;
    } finally {
      if (pendingAudioGraph.current?.promise === promise) {
        pendingAudioGraph.current = undefined;
      }
    }
  }

  async function buildAudioGraph(
    audio: HTMLAudioElement,
    ContextConstructor: typeof AudioContext,
  ): Promise<void> {
    let context: AudioContext | undefined;
    let source: MediaElementAudioSourceNode | undefined;
    try {
      context = new ContextConstructor();
      const contextState = await resumeAudioContext(context);
      if (contextState !== "running") {
        void context.close().catch(() => undefined);
        setVisualizerStatus("waiting");
        setVisualizerError(undefined);
        return;
      }
      if (audioRef.current !== audio) {
        void context.close().catch(() => undefined);
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const frequency: Uint8Array<ArrayBuffer> = new Uint8Array(analyser.frequencyBinCount);
      const waveform: Uint8Array<ArrayBuffer> = new Uint8Array(analyser.fftSize);
      source = context.createMediaElementSource(audio);
      try {
        source.connect(analyser);
        analyser.connect(context.destination);
      } catch {
        // Once a media element has been claimed by Web Audio it must keep a live
        // route to the destination, even when visual analysis cannot be attached.
        try {
          source.disconnect();
        } catch {
          // The failed connection may not have registered an edge to remove.
        }
        try {
          source.connect(context.destination);
        } catch {
          // Preserve the claimed graph so later activation never claims it twice.
        }
        audioGraph.current = { audio, context, source };
        setVisualizerStatus("unavailable");
        setVisualizerError("The audio stream could not be connected to Web Audio");
        return;
      }
      const graph: AudioGraph = {
        audio,
        context,
        source,
        analyser,
        frequency,
        waveform,
      };
      audioGraph.current = graph;
      context.onstatechange = () => publishAudioGraphStatus(graph);
      publishAudioGraphStatus(graph);
    } catch {
      // Closing is safe only before createMediaElementSource has rerouted the
      // element. A claimed source must stay connected to a running destination.
      if (context && !source) void context.close().catch(() => undefined);
      setVisualizerStatus("unavailable");
      setVisualizerError("The audio stream could not be connected to Web Audio");
    }
  }

  function readVisualizerFrame(): AudioVisualizerFrame | undefined {
    const graph = audioGraph.current;
    if (
      !graph ||
      !graph.analyser ||
      !graph.frequency ||
      !graph.waveform ||
      graph.context.state !== "running"
    ) return undefined;
    graph.analyser.getByteFrequencyData(graph.frequency);
    graph.analyser.getByteTimeDomainData(graph.waveform);
    return { frequency: graph.frequency, waveform: graph.waveform };
  }

  function publishAudioGraphStatus(graph: AudioGraph): void {
    if (audioGraph.current !== graph) return;
    const contextState = String(graph.context.state);
    if (!graph.analyser) {
      setVisualizerStatus("unavailable");
      setVisualizerError("The audio stream could not be connected to Web Audio");
    } else if (contextState === "running") {
      setVisualizerStatus("ready");
      setVisualizerError(undefined);
    } else if (contextState === "closed") {
      setVisualizerStatus("unavailable");
      setVisualizerError("The browser closed the live audio analyser");
    } else {
      setVisualizerStatus("waiting");
      setVisualizerError(undefined);
    }
  }

  function isCurrentPlaybackAttempt(
    attempt: number,
    audio: HTMLAudioElement,
    loadKey: number | string,
    activeClient: SubsonicClient,
  ): boolean {
    return playbackAttempt.current === attempt
      && audioRef.current === audio
      && loadedOccurrenceKey.current === loadKey
      && loadedClient.current === activeClient;
  }

  return {
    audioRef,
    isPlaying,
    progress,
    duration,
    volume,
    muted,
    error,
    visualizer: {
      supported: Boolean(AudioContextConstructor),
      status: visualizerEnabled ? visualizerStatus : "off",
      error: visualizerError,
      activate: activateVisualizer,
      readFrame: readVisualizerFrame,
    },
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

async function resumeAudioContext(context: AudioContext): Promise<string> {
  const initialState = String(context.state);
  if (initialState === "running" || initialState === "closed") return initialState;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      context.resume().then(
        () => "settled" as const,
        () => "rejected" as const,
      ),
      new Promise<"timeout">((resolve) => {
        timeoutId = setTimeout(() => resolve("timeout"), VISUALIZER_RESUME_TIMEOUT_MS);
      }),
    ]);
    if (outcome === "timeout" || outcome === "rejected") return String(context.state);
    return String(context.state);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

type AudioContextGlobal = typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContextConstructor(): typeof AudioContext | undefined {
  const scope = globalThis as AudioContextGlobal;
  return scope.AudioContext ?? scope.webkitAudioContext;
}
