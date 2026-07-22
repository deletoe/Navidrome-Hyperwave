import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createPairingCode,
  safeStaticPath,
  sanitizeRemoteCommand,
} = require("./remote-server.cjs");

describe("remote playback server", () => {
  it("creates fixed-width numeric pairing codes", () => {
    expect(createPairingCode()).toMatch(/^\d{6}$/);
  });

  it("prevents traversal outside the static app directory", () => {
    const root = path.resolve("/tmp/my-navidrome-dist");
    expect(safeStaticPath(root, "/assets/app.js")).toBe(path.join(root, "assets/app.js"));
    expect(safeStaticPath(root, "/../secret")).toBeUndefined();
    expect(safeStaticPath(root, "/%2e%2e/secret")).toBeUndefined();
  });

  it("bounds and sanitizes remote queue commands", () => {
    expect(sanitizeRemoteCommand({
      type: "playQueue",
      tracks: [{ id: "track-1", title: "Song", password: "secret" }],
      startIndex: 99,
      position: -5,
      serverUrl: "https://music.test",
    })).toEqual({
      type: "playQueue",
      tracks: [{ id: "track-1", title: "Song" }],
      startIndex: 0,
      position: 0,
      autoplay: true,
      serverUrl: "https://music.test",
    });
    expect(sanitizeRemoteCommand({ type: "unknown" })).toBeUndefined();
  });
});
