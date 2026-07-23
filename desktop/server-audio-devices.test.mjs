import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createServerAudioDeviceAdapter } = require("./server-audio-devices.cjs");

describe("server audio device adapters", () => {
  it("keeps Linux and Windows on the same platform-neutral contract", async () => {
    for (const platform of ["linux", "win32"]) {
      const adapter = createServerAudioDeviceAdapter(platform);
      expect(adapter).toMatchObject({ platform, canSelect: false });
      await expect(adapter.list()).resolves.toEqual([{
        deviceId: "system-default",
        label: "Server system default",
        selected: true,
      }]);
      await expect(adapter.select("system-default")).resolves.toHaveLength(1);
    }
  });

  it("registers CoreAudio as the current macOS adapter", () => {
    expect(createServerAudioDeviceAdapter("darwin")).toMatchObject({
      platform: "darwin",
      backend: "coreaudio",
      canSelect: true,
    });
  });
});
