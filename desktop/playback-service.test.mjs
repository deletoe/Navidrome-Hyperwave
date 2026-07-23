import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createControllerToken,
  PlaybackService,
  safeStaticPath,
  sanitizePlaybackCommand,
} = require("./playback-service.cjs");

describe("built-in server playback service", () => {
  it("issues one-use controller sessions automatically", () => {
    expect(createControllerToken()).toMatch(/^[a-f0-9]{48}$/);
    const server = new PlaybackService({ distPath: "/tmp", onCommand() {} });
    const token = server.issueControllerToken();
    expect(server.consumeControllerToken(token)).toBe(true);
    expect(server.consumeControllerToken(token)).toBe(false);
  });

  it("issues automatic sessions only to the same host origin", async () => {
    const server = new PlaybackService({
      distPath: "/tmp",
      onCommand() {},
      port: 0,
      hostname: "test-server",
    });
    const info = await server.start();
    try {
      const sameHost = await fetch(`http://127.0.0.1:${info.port}/api/audio/session`, {
        headers: { Origin: "http://127.0.0.1:5173" },
      });
      expect(sameHost.status).toBe(200);
      await expect(sameHost.json()).resolves.toMatchObject({ token: expect.any(String) });

      const foreignHost = await fetch(`http://127.0.0.1:${info.port}/api/audio/session`, {
        headers: { Origin: "https://attacker.example" },
      });
      expect(foreignHost.status).toBe(403);
    } finally {
      server.stop();
    }
  });

  it("prevents traversal outside the static app directory", () => {
    const root = path.resolve("/tmp/my-navidrome-dist");
    expect(safeStaticPath(root, "/assets/app.js")).toBe(path.join(root, "assets/app.js"));
    expect(safeStaticPath(root, "/../secret")).toBeUndefined();
    expect(safeStaticPath(root, "/%2e%2e/secret")).toBeUndefined();
  });

  it("bounds and sanitizes server playback commands", () => {
    expect(sanitizePlaybackCommand({
      type: "playQueue",
      tracks: [{
        id: "track-1",
        title: "Song",
        password: "secret",
        streamUrl: "https://music.test/rest/stream.view?id=track-1&t=signed",
      }],
      startIndex: 99,
      position: -5,
      serverUrl: "https://music.test",
    })).toEqual({
      type: "playQueue",
      tracks: [{
        id: "track-1",
        title: "Song",
        streamUrl: "https://music.test/rest/stream.view?id=track-1&t=signed",
      }],
      startIndex: 0,
      position: 0,
      autoplay: true,
      serverUrl: "https://music.test",
    });
    expect(sanitizePlaybackCommand({
      type: "playQueue",
      tracks: [{ id: "track-1", title: "Song", streamUrl: "file:///etc/passwd" }],
    })).toBeUndefined();
    expect(sanitizePlaybackCommand({ type: "unknown" })).toBeUndefined();
  });
});
