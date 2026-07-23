import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  bootstrapPayload,
  parseBoundNavidrome,
  upstreamUrl,
} = require("./bound-navidrome.cjs");

describe("bound Navidrome login", () => {
  it("parses one credentialed startup URL without retaining credentials in the server URL", () => {
    const config = parseBoundNavidrome([
      "--navidrome-login=http://family:p%40ss@music.lan:4533/base/",
    ], {});
    expect(config).toMatchObject({
      serverUrl: "http://music.lan:4533/base",
      username: "family",
      password: "p@ss",
    });
    expect(config.proxyToken).toHaveLength(48);
  });

  it("returns only proxy credentials to the browser", () => {
    const config = parseBoundNavidrome(["--navidrome-login=http://family:secret@music.lan"], {});
    const payload = bootstrapPayload(config, { headers: { host: "192.168.1.8:5173" } });
    expect(payload.connection.serverUrl).toBe("http://192.168.1.8:5173/navidrome");
    expect(JSON.stringify(payload)).not.toContain("family");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("replaces the proxy token with salted password authentication upstream", () => {
    const config = {
      serverUrl: "http://music.lan:4533",
      username: "family",
      password: "secret",
      proxyToken: "proxy-token",
    };
    const target = upstreamUrl(
      config,
      "/navidrome/rest/ping.view?apiKey=proxy-token&v=1.16.1&c=test&f=json",
    );
    expect(target.hostname).toBe("music.lan");
    expect(target.searchParams.get("u")).toBe("family");
    expect(target.searchParams.get("apiKey")).toBeNull();
    expect(target.searchParams.get("t")).toHaveLength(32);
    expect(target.toString()).not.toContain("secret");
  });
});
