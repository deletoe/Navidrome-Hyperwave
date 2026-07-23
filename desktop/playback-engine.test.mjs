import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPlaybackEngine } = require("./playback-engine.cjs");

describe("playback engine adapter", () => {
  it("registers the lightweight native engine on macOS", () => {
    const engine = createPlaybackEngine({ onState: vi.fn() }, "darwin");
    expect(engine.constructor.name).toBe("NativePlaybackEngine");
  });

  it("keeps unsupported platforms behind the same adapter boundary", () => {
    expect(() => createPlaybackEngine({ onState: vi.fn() }, "linux"))
      .toThrow(/platform adapter/i);
  });
});
