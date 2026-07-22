import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Keep server configuration tests independent from Electron startup by testing
// the equivalent pure environment contract here.
const require = createRequire(import.meta.url);
const { buildAuthParams, readConfiguration, streamUrl } = require("./output-server-config.cjs");

describe("standalone output server configuration", () => {
  it("accepts password and API-key server credentials without an installed app", () => {
    expect(readConfiguration({
      MY_NAVIDROME_URL: "https://music.test/",
      MY_NAVIDROME_USERNAME: "listener",
      MY_NAVIDROME_PASSWORD: "secret",
    })).toEqual({
      serverUrl: "https://music.test",
      auth: { type: "password", username: "listener", password: "secret" },
    });
    expect(readConfiguration({
      MY_NAVIDROME_URL: "https://music.test",
      MY_NAVIDROME_API_KEY: "key",
    }).auth).toEqual({ type: "apiKey", apiKey: "key" });
  });

  it("uses fresh salts for password-token stream URLs", () => {
    const auth = { type: "password", username: "listener", password: "secret" };
    const first = buildAuthParams(auth);
    const second = buildAuthParams(auth);
    expect(first.s).toHaveLength(24);
    expect(first.s).not.toBe(second.s);
    expect(first).not.toHaveProperty("password");
    const url = new URL(streamUrl({ serverUrl: "https://music.test", auth }, "track 1"));
    expect(url.pathname).toBe("/rest/stream.view");
    expect(url.searchParams.get("id")).toBe("track 1");
    expect(url.search).not.toContain("secret");
  });
});
