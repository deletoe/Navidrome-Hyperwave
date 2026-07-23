import type { Track } from "../types";

export type OutputRoute = "local" | "server";
export type ServerConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ServerRendererState {
  connected: boolean;
  title: string;
  artist: string;
  trackId: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  muted: boolean;
  serverUrl: string;
  outputDevices: Array<{ deviceId: string; label: string }>;
  selectedOutputDeviceId: string;
  outputError: string;
  platform: string;
  deviceBackend: string;
  canSelectOutputDevice: boolean;
}

export type ServerPlaybackTrack = Track & { streamUrl: string };

export type ServerPlaybackCommand =
  | { type: "playQueue"; tracks: ServerPlaybackTrack[]; startIndex: number; position: number; autoplay: boolean; serverUrl: string }
  | { type: "play" | "pause" | "next" | "previous" | "toggleMute" | "stop" | "refreshDevices" }
  | { type: "seek"; position: number }
  | { type: "volume"; volume: number }
  | { type: "selectDevice"; deviceId: string };

export function normalizeServerEndpoint(value: string, location?: Pick<Location, "protocol" | "hostname">): string {
  const trimmed = value.trim();
  const fallbackProtocol = location?.protocol === "https:" ? "https:" : "http:";
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `${fallbackProtocol}//${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server audio endpoint must use HTTP or HTTPS");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function websocketUrl(endpoint: string): string {
  const url = new URL(normalizeServerEndpoint(endpoint));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/audio-control";
  return url.toString();
}

export function defaultServerEndpoint(location: Pick<Location, "protocol" | "hostname" | "port" | "origin">): string {
  if (location.port === "5173") return location.origin;
  const protocol = location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${location.hostname || "127.0.0.1"}:5173`;
}

export function serverEndpointCandidates(
  location: Pick<Location, "protocol" | "hostname" | "port" | "origin">,
): string[] {
  return [...new Set([location.origin, defaultServerEndpoint(location)])];
}
