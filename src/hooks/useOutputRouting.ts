import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";

import type { AudioPlayerController } from "./useAudioPlayer";
import {
  defaultRemoteEndpoint,
  normalizeRemoteEndpoint,
  websocketUrl,
  type OutputRoute,
  type RemoteConnectionStatus,
  type RemotePlaybackCommand,
  type RemoteRendererState,
} from "../lib/outputRouting";
import { getCurrentTrack, type QueueAction, type QueueState } from "../state/playerQueue";

export interface OutputRoutingController {
  route: OutputRoute;
  endpoint: string;
  pairingCode: string;
  connectionStatus: RemoteConnectionStatus;
  remoteState?: RemoteRendererState;
  remoteName?: string;
  error?: string;
  player: AudioPlayerController;
  setEndpoint(value: string): void;
  setPairingCode(value: string): void;
  connect(): void;
  disconnect(): void;
  useLocalOutput(): void;
  useRemoteOutput(): void;
  refreshRemoteDevices(): void;
  selectRemoteDevice(deviceId: string): void;
}

export interface UseOutputRoutingOptions {
  localPlayer: AudioPlayerController;
  queueState: QueueState;
  dispatch: Dispatch<QueueAction>;
  serverUrl: string;
}

const REMOTE_VISUALIZER: AudioPlayerController["visualizer"] = {
  supported: false,
  status: "unavailable",
  error: "Visualization runs on the Mac playback device",
  async activate() {},
  readFrame() { return undefined; },
};

const REMOTE_PROCESSING: AudioPlayerController["audioProcessing"] = {
  supported: false,
  status: "unavailable",
  error: "EQ and stereo fusion are controlled by the Mac playback device",
  async activate() {},
};

function emptyRemoteState(): RemoteRendererState {
  return {
    connected: false,
    title: "",
    artist: "",
    trackId: "",
    isPlaying: false,
    progress: 0,
    duration: 0,
    volume: 0.86,
    muted: false,
    serverUrl: "",
    outputDevices: [],
    selectedOutputDeviceId: "",
    outputError: "",
  };
}

export function useOutputRouting({
  localPlayer,
  queueState,
  dispatch,
  serverUrl,
}: UseOutputRoutingOptions): OutputRoutingController {
  const [route, setRoute] = useState<OutputRoute>("local");
  const [endpoint, setEndpointState] = useState(() => defaultRemoteEndpoint(window.location));
  const [pairingCode, setPairingCodeState] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<RemoteConnectionStatus>("disconnected");
  const [remoteState, setRemoteState] = useState<RemoteRendererState>();
  const [remoteName, setRemoteName] = useState<string>();
  const [error, setError] = useState<string>();
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const routeRef = useRef<OutputRoute>(route);
  const remoteStateRef = useRef<RemoteRendererState>(emptyRemoteState());
  routeRef.current = route;
  remoteStateRef.current = remoteState ?? emptyRemoteState();

  function sendCommand(command: RemotePlaybackCommand): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || connectionStatus !== "connected") {
      setError("Connect and pair with the Mac playback service first");
      return;
    }
    socket.send(JSON.stringify({ type: "command", command }));
  }

  function connect(): void {
    let normalizedEndpoint: string;
    try {
      normalizedEndpoint = normalizeRemoteEndpoint(endpoint, window.location);
    } catch (endpointError) {
      setConnectionStatus("error");
      setError(endpointError instanceof Error ? endpointError.message : "The Mac address is invalid");
      return;
    }
    if (!/^\d{6}$/.test(pairingCode)) {
      setConnectionStatus("error");
      setError("Enter the six-digit pairing code shown by the output server");
      return;
    }
    socketRef.current?.close();
    setEndpointState(normalizedEndpoint);
    setConnectionStatus("connecting");
    setError(undefined);
    const socket = new WebSocket(websocketUrl(normalizedEndpoint));
    socketRef.current = socket;
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "pair", pin: pairingCode }));
    });
    socket.addEventListener("message", (event) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
      if (message.type === "hello") {
        const renderer = message.renderer as { hostname?: unknown } | undefined;
        if (typeof renderer?.hostname === "string") setRemoteName(renderer.hostname);
        return;
      }
      if (message.type === "paired") {
        setConnectionStatus("connected");
        setError(undefined);
        return;
      }
      if (message.type === "state") {
        const state = message.state as Partial<RemoteRendererState> | undefined;
        if (!state) return;
        const nextState: RemoteRendererState = {
          connected: Boolean(state.connected),
          title: typeof state.title === "string" ? state.title : "",
          artist: typeof state.artist === "string" ? state.artist : "",
          trackId: typeof state.trackId === "string" ? state.trackId : "",
          isPlaying: Boolean(state.isPlaying),
          progress: Math.max(0, Number(state.progress) || 0),
          duration: Math.max(0, Number(state.duration) || 0),
          volume: Math.min(Math.max(Number(state.volume) || 0, 0), 1),
          muted: Boolean(state.muted),
          serverUrl: typeof state.serverUrl === "string" ? state.serverUrl : "",
          outputDevices: Array.isArray(state.outputDevices)
            ? state.outputDevices.flatMap((device) => {
              if (!device || typeof device.deviceId !== "string") return [];
              return [{
                deviceId: device.deviceId,
                label: typeof device.label === "string" ? device.label : "Mac audio output",
              }];
            })
            : [],
          selectedOutputDeviceId: typeof state.selectedOutputDeviceId === "string"
            ? state.selectedOutputDeviceId
            : "",
          outputError: typeof state.outputError === "string" ? state.outputError : "",
        };
        remoteStateRef.current = nextState;
        setRemoteState(nextState);
        return;
      }
      if (message.type === "error") {
        setError(typeof message.message === "string" ? message.message : "The Mac playback service rejected the request");
        if (message.code === "PAIRING_FAILED") setConnectionStatus("error");
      }
    });
    socket.addEventListener("close", () => {
      if (socketRef.current !== socket) return;
      setConnectionStatus("disconnected");
      if (routeRef.current === "remote") setRoute("local");
    });
    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) return;
      setConnectionStatus("error");
      setError("Could not reach the Mac playback service on the local network");
    });
  }

  function disconnect(): void {
    socketRef.current?.close();
    socketRef.current = undefined;
    setRoute("local");
    setConnectionStatus("disconnected");
    setRemoteState(undefined);
    setError(undefined);
  }

  function useLocalOutput(): void {
    if (route === "remote" && remoteStateRef.current.isPlaying) sendCommand({ type: "pause" });
    setRoute("local");
  }

  function useRemoteOutput(): void {
    if (connectionStatus !== "connected") {
      setError("Pair with the Mac playback service before selecting it");
      return;
    }
    localPlayer.pause();
    setRoute("remote");
  }

  useEffect(() => () => socketRef.current?.close(), []);

  useEffect(() => {
    if (!remoteState?.trackId || route !== "remote") return;
    const index = queueState.tracks.findIndex((track) => track.id === remoteState.trackId);
    if (index >= 0 && index !== queueState.currentIndex) dispatch({ type: "select", index });
  }, [dispatch, queueState.currentIndex, queueState.tracks, remoteState?.trackId, route]);

  function playRemoteQueue(): void {
    if (queueState.tracks.length === 0) return;
    sendCommand({
      type: "playQueue",
      tracks: queueState.tracks,
      startIndex: Math.max(0, queueState.currentIndex),
      position: remoteStateRef.current.trackId === getCurrentTrack(queueState)?.id
        ? remoteStateRef.current.progress
        : 0,
      autoplay: true,
      serverUrl,
    });
  }

  const remotePlayer = useMemo<AudioPlayerController>(() => ({
    audioRef: localPlayer.audioRef,
    isPlaying: remoteState?.isPlaying ?? false,
    progress: remoteState?.progress ?? 0,
    duration: remoteState?.duration ?? getCurrentTrack(queueState)?.duration ?? 0,
    volume: remoteState?.volume ?? 0.86,
    muted: remoteState?.muted ?? false,
    error,
    output: localPlayer.output,
    visualizer: REMOTE_VISUALIZER,
    audioProcessing: REMOTE_PROCESSING,
    async play() {
      playRemoteQueue();
    },
    pause() { sendCommand({ type: "pause" }); },
    async toggle() {
      if (remoteStateRef.current.isPlaying) sendCommand({ type: "pause" });
      else if (remoteStateRef.current.trackId === getCurrentTrack(queueState)?.id) sendCommand({ type: "play" });
      else playRemoteQueue();
    },
    next() {
      dispatch({ type: "next" });
      sendCommand({ type: "next" });
    },
    previous() {
      if (remoteStateRef.current.progress > 3) sendCommand({ type: "seek", position: 0 });
      else {
        dispatch({ type: "previous" });
        sendCommand({ type: "previous" });
      }
    },
    seek(position) { sendCommand({ type: "seek", position }); },
    setVolume(volume) { sendCommand({ type: "volume", volume }); },
    toggleMute() { sendCommand({ type: "toggleMute" }); },
    reset() { sendCommand({ type: "stop" }); },
    handleTimeUpdate() {},
    handleLoadedMetadata() {},
    handleEnded() {},
    handleError() {},
  }), [dispatch, error, localPlayer.audioRef, localPlayer.output, queueState, remoteState, serverUrl]);

  return {
    route,
    endpoint,
    pairingCode,
    connectionStatus,
    remoteState,
    remoteName,
    error,
    player: route === "remote" ? remotePlayer : localPlayer,
    setEndpoint: setEndpointState,
    setPairingCode: (value) => setPairingCodeState(value.replace(/\D/g, "").slice(0, 6)),
    connect,
    disconnect,
    useLocalOutput,
    useRemoteOutput,
    refreshRemoteDevices: () => sendCommand({ type: "refreshDevices" }),
    selectRemoteDevice: (deviceId) => sendCommand({ type: "selectDevice", deviceId }),
  };
}
