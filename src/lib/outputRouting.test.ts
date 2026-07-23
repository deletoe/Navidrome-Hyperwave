import { describe, expect, it } from "vitest";

import {
  defaultServerEndpoint,
  normalizeServerEndpoint,
  serverEndpointCandidates,
  websocketUrl,
} from "./outputRouting";

describe("output routing URLs", () => {
  it("normalizes a server address without retaining paths or query strings", () => {
    expect(normalizeServerEndpoint("192.168.1.8:5173/path?secret=no", {
      protocol: "http:",
      hostname: "phone",
    })).toBe("http://192.168.1.8:5173");
  });

  it("builds secure and insecure server sockets", () => {
    expect(websocketUrl("http://server.local:5173")).toBe("ws://server.local:5173/audio-control");
    expect(websocketUrl("https://server.example")).toBe("wss://server.example/audio-control");
  });

  it("uses the page origin when the app is served by the output server", () => {
    expect(defaultServerEndpoint({
      protocol: "http:",
      hostname: "server.local",
      port: "5173",
      origin: "http://server.local:5173",
    })).toBe("http://server.local:5173");
  });

  it("tries the current Web origin before the default audio-server port", () => {
    expect(serverEndpointCandidates({
      protocol: "http:",
      hostname: "server.local",
      port: "18000",
      origin: "http://server.local:18000",
    })).toEqual([
      "http://server.local:18000",
      "http://server.local:5173",
    ]);
  });
});
