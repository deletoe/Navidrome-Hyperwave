import { describe, expect, it } from "vitest";

import { defaultRemoteEndpoint, normalizeRemoteEndpoint, websocketUrl } from "./outputRouting";

describe("output routing URLs", () => {
  it("normalizes a Mac address without retaining paths or query strings", () => {
    expect(normalizeRemoteEndpoint("192.168.1.8:17856/path?secret=no", {
      protocol: "http:",
      hostname: "phone",
    })).toBe("http://192.168.1.8:17856");
  });

  it("builds secure and insecure remote sockets", () => {
    expect(websocketUrl("http://mac.local:17856")).toBe("ws://mac.local:17856/remote");
    expect(websocketUrl("https://mac.example")).toBe("wss://mac.example/remote");
  });

  it("uses the page origin when the app is served by the output server", () => {
    expect(defaultRemoteEndpoint({
      protocol: "http:",
      hostname: "mac.local",
      port: "17856",
      origin: "http://mac.local:17856",
    })).toBe("http://mac.local:17856");
  });
});
