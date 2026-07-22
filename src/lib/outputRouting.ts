export type OutputRoute = "local" | "remote";
export type RemoteConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface RemoteRendererState {
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
}

export type RemotePlaybackCommand =
  | { type: "playQueue"; tracks: import("../types").Track[]; startIndex: number; position: number; autoplay: boolean; serverUrl: string }
  | { type: "play" | "pause" | "next" | "previous" | "toggleMute" | "stop" | "refreshDevices" }
  | { type: "seek"; position: number }
  | { type: "volume"; volume: number }
  | { type: "selectDevice"; deviceId: string };

export function normalizeRemoteEndpoint(value: string, location?: Pick<Location, "protocol" | "hostname">): string {
  const trimmed = value.trim();
  const fallbackProtocol = location?.protocol === "https:" ? "https:" : "http:";
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `${fallbackProtocol}//${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The Mac playback address must use HTTP or HTTPS");
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function websocketUrl(endpoint: string): string {
  const url = new URL(normalizeRemoteEndpoint(endpoint));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/remote";
  return url.toString();
}

export function defaultRemoteEndpoint(location: Pick<Location, "protocol" | "hostname" | "port" | "origin">): string {
  if (location.port === "17856") return location.origin;
  const protocol = location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${location.hostname || "127.0.0.1"}:17856`;
}
