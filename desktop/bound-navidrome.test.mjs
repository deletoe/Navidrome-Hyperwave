import { createServer } from "node:http";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  bootstrapPayload,
  parseBoundNavidrome,
  proxyNavidromeRequest,
  upstreamUrl,
} = require("./bound-navidrome.cjs");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

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

  it("does not forward a compressed length after fetch decompresses the upstream body", async () => {
    const body = JSON.stringify({ genres: ["Ambient", "Rock", "Jazz"] });
    const compressed = gzipSync(body);
    let observedAcceptEncoding = "";
    const upstream = createServer((request, response) => {
      observedAcceptEncoding = request.headers["accept-encoding"] || "";
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": String(compressed.length),
      });
      response.end(compressed);
    });
    const upstreamPort = await listen(upstream);
    const config = {
      serverUrl: `http://127.0.0.1:${upstreamPort}`,
      username: "family",
      password: "secret",
      proxyToken: "proxy-token",
    };
    const proxy = createServer((request, response) => {
      void proxyNavidromeRequest(config, request, response).catch((error) => {
        if (!response.destroyed) response.destroy(error);
      });
    });
    const proxyPort = await listen(proxy);

    try {
      const response = await fetch(
        `http://127.0.0.1:${proxyPort}/navidrome/rest/getGenres.view?apiKey=proxy-token`,
      );
      expect(await response.text()).toBe(body);
      expect(response.headers.get("content-length")).toBeNull();
      expect(observedAcceptEncoding).toBe("identity");
    } finally {
      await close(proxy);
      await close(upstream);
    }
  });
});
