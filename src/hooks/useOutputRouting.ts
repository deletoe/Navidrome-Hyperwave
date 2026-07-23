import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";

import type { AudioPlayerController } from "./useAudioPlayer";
import {
  serverEndpointCandidates,
  websocketUrl,
  type OutputRoute,
  type ServerConnectionStatus,
  type ServerPlaybackCommand,
  type ServerRendererState,
} from "../lib/outputRouting";
import { getCurrentTrack, type QueueAction, type QueueState } from "../state/playerQueue";

export interface OutputRoutingController {
  route: OutputRoute;
  connectionStatus: ServerConnectionStatus;
  serverState?: ServerRendererState;
  serverName?: string;
  error?: string;
  player: AudioPlayerController;
  reconnect(): void;
  disconnect(): void;
  useLocalOutput(): void;
  useServerOutput(): void;
  refreshServerDevices(): void;
  selectServerDevice(deviceId: string): void;
}

export interface UseOutputRoutingOptions {
  localPlayer: AudioPlayerController;
  queueState: QueueState;
  dispatch: Dispatch<QueueAction>;
  serverUrl: string;
  streamUrlForTrack(id: string): string;
}

const SERVER_VISUALIZER: AudioPlayerController["visualizer"] = {
  supported: false,
  status: "unavailable",
  error: "Visualization runs on the server playback device",
  async activate() {},
  readFrame() { return undefined; },
};

const SERVER_PROCESSING: AudioPlayerController["audioProcessing"] = {
  supported: false,
  status: "unavailable",
  error: "EQ and stereo fusion are controlled by the server playback device",
  async activate() {},
};

function emptyServerState(): ServerRendererState {
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
    platform: "",
    deviceBackend: "",
    canSelectOutputDevice: false,
  };
}

export function useOutputRouting({
  localPlayer,
  queueState,
  dispatch,
  serverUrl,
  streamUrlForTrack,
}: UseOutputRoutingOptions): OutputRoutingController {
  const [route, setRoute] = useState<OutputRoute>("local");
  const [connectionStatus, setConnectionStatus] = useState<ServerConnectionStatus>("disconnected");
  const [serverState, setServerState] = useState<ServerRendererState>();
  const [serverName, setServerName] = useState<string>();
  const [error, setError] = useState<string>();
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const routeRef = useRef<OutputRoute>(route);
  const serverStateRef = useRef<ServerRendererState>(emptyServerState());
  const connectionGeneration = useRef(0);
  routeRef.current = route;
  serverStateRef.current = serverState ?? emptyServerState();

  function sendCommand(command: ServerPlaybackCommand): void {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || connectionStatus !== "connected") {
      setError("The server audio renderer is not available");
      return;
    }
    socket.send(JSON.stringify({ type: "command", command }));
  }

  function connect(): void {
    const generation = ++connectionGeneration.current;
    socketRef.current?.close();
    setConnectionStatus("connecting");
    setError(undefined);
    void (async () => {
      let lastError: unknown;
      for (const endpoint of serverEndpointCandidates(window.location)) {
        try {
          const response = await fetch(`${endpoint}/api/audio/session`, {
            method: "GET",
            headers: { Accept: "application/json" },
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
          if (!response.ok) throw new Error(`Server audio session failed (${response.status})`);
          const { token } = await response.json() as { token?: unknown };
          if (typeof token !== "string" || !token) throw new Error("Server audio session token is missing");
          return { endpoint, token };
        } catch (candidateError) {
          lastError = candidateError;
        }
      }
      throw lastError instanceof Error ? lastError : new Error("Server audio is unavailable");
    })()
      .then(({ endpoint, token }) => {
        if (generation !== connectionGeneration.current) return;
        const socketAddress = new URL(websocketUrl(endpoint));
        socketAddress.searchParams.set("token", token);
        const socket = new WebSocket(socketAddress);
        socketRef.current = socket;
        socket.addEventListener("message", (event) => {
          let message: Record<string, unknown>;
          try { message = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
          if (message.type === "hello") {
            const renderer = message.renderer as { hostname?: unknown } | undefined;
            if (typeof renderer?.hostname === "string") setServerName(renderer.hostname);
            setConnectionStatus("connected");
            setError(undefined);
            return;
          }
          if (message.type === "state") {
            const state = message.state as Partial<ServerRendererState> | undefined;
            if (!state) return;
            const nextState: ServerRendererState = {
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
                    label: typeof device.label === "string" ? device.label : "Server audio output",
                  }];
                })
                : [],
              selectedOutputDeviceId: typeof state.selectedOutputDeviceId === "string"
                ? state.selectedOutputDeviceId
                : "",
              outputError: typeof state.outputError === "string" ? state.outputError : "",
              platform: typeof state.platform === "string" ? state.platform : "",
              deviceBackend: typeof state.deviceBackend === "string" ? state.deviceBackend : "",
              canSelectOutputDevice: Boolean(state.canSelectOutputDevice),
            };
            serverStateRef.current = nextState;
            setServerState(nextState);
            return;
          }
          if (message.type === "error") {
            setError(typeof message.message === "string" ? message.message : "The server rejected the playback request");
          }
        });
        socket.addEventListener("close", () => {
          if (generation !== connectionGeneration.current || socketRef.current !== socket) return;
          setConnectionStatus("disconnected");
          if (routeRef.current === "server") setRoute("local");
        });
        socket.addEventListener("error", () => {
          if (generation !== connectionGeneration.current || socketRef.current !== socket) return;
          setConnectionStatus("error");
          setError("The built-in server audio renderer could not be reached");
        });
      })
      .catch((sessionError) => {
        if (generation !== connectionGeneration.current) return;
        setConnectionStatus("error");
        setError(sessionError instanceof Error ? sessionError.message : "Server audio is unavailable");
      });
  }

  function disconnect(): void {
    connectionGeneration.current += 1;
    socketRef.current?.close();
    socketRef.current = undefined;
    setRoute("local");
    setConnectionStatus("disconnected");
    setServerState(undefined);
    setError(undefined);
  }

  function useLocalOutput(): void {
    const wasPlaying = route === "server" && serverStateRef.current.isPlaying;
    const resumeAt = serverStateRef.current.progress;
    if (route === "server") sendCommand({ type: "pause" });
    setRoute("local");
    if (route === "server") {
      localPlayer.seek(resumeAt);
      if (wasPlaying) void localPlayer.play();
    }
  }

  function useServerOutput(): void {
    if (connectionStatus !== "connected" || !serverStateRef.current.connected) {
      setError("Server audio is not ready");
      return;
    }
    const wasPlaying = localPlayer.isPlaying;
    const resumeAt = localPlayer.progress;
    localPlayer.pause();
    setRoute("server");
    playServerQueue(resumeAt, wasPlaying);
  }

  useEffect(() => {
    connect();
    return () => {
      connectionGeneration.current += 1;
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!serverState?.trackId || route !== "server") return;
    const index = queueState.tracks.findIndex((track) => track.id === serverState.trackId);
    if (index >= 0 && index !== queueState.currentIndex) dispatch({ type: "select", index });
  }, [dispatch, queueState.currentIndex, queueState.tracks, route, serverState?.trackId]);

  function playServerQueue(positionOverride?: number, autoplay = true): void {
    if (queueState.tracks.length === 0) return;
    sendCommand({
      type: "playQueue",
      tracks: queueState.tracks.map((track) => ({
        ...track,
        streamUrl: streamUrlForTrack(track.id),
      })),
      startIndex: Math.max(0, queueState.currentIndex),
      position: positionOverride ?? (
        serverStateRef.current.trackId === getCurrentTrack(queueState)?.id
          ? serverStateRef.current.progress
          : 0
      ),
      autoplay,
      serverUrl,
    });
  }

  const serverPlayer = useMemo<AudioPlayerController>(() => ({
    audioRef: localPlayer.audioRef,
    isPlaying: serverState?.isPlaying ?? false,
    progress: serverState?.progress ?? 0,
    duration: serverState?.duration ?? getCurrentTrack(queueState)?.duration ?? 0,
    volume: serverState?.volume ?? 0.86,
    muted: serverState?.muted ?? false,
    error,
    output: localPlayer.output,
    visualizer: SERVER_VISUALIZER,
    audioProcessing: SERVER_PROCESSING,
    async play() { playServerQueue(); },
    pause() { sendCommand({ type: "pause" }); },
    async toggle() {
      if (serverStateRef.current.isPlaying) sendCommand({ type: "pause" });
      else if (serverStateRef.current.trackId === getCurrentTrack(queueState)?.id) sendCommand({ type: "play" });
      else playServerQueue();
    },
    next() {
      dispatch({ type: "next" });
      sendCommand({ type: "next" });
    },
    previous() {
      if (serverStateRef.current.progress > 3) sendCommand({ type: "seek", position: 0 });
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
  }), [dispatch, error, localPlayer.audioRef, localPlayer.output, queueState, serverState, serverUrl, streamUrlForTrack]);

  return {
    route,
    connectionStatus,
    serverState,
    serverName,
    error,
    player: route === "server" ? serverPlayer : localPlayer,
    reconnect: connect,
    disconnect,
    useLocalOutput,
    useServerOutput,
    refreshServerDevices: () => sendCommand({ type: "refreshDevices" }),
    selectServerDevice: (deviceId) => sendCommand({ type: "selectDevice", deviceId }),
  };
}
