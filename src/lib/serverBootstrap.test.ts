import { describe, expect, it, vi } from "vitest";

import { loadBoundConnection } from "./serverBootstrap";

describe("server-bound login bootstrap", () => {
  it("accepts a same-origin proxy session without exposing a password", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      configured: true,
      connection: {
        serverUrl: "http://music.local:5173/navidrome",
        auth: { type: "apiKey", apiKey: "proxy-session" },
      },
    }), { status: 200 }));
    await expect(loadBoundConnection(
      fetcher as typeof fetch,
      "http://music.local:5173",
    )).resolves.toEqual({
      serverUrl: "http://music.local:5173/navidrome",
      auth: { type: "apiKey", apiKey: "proxy-session" },
    });
  });

  it("rejects a bootstrap that points at another origin", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      configured: true,
      connection: {
        serverUrl: "http://unexpected.example/navidrome",
        auth: { type: "apiKey", apiKey: "proxy-session" },
      },
    }), { status: 200 }));
    await expect(loadBoundConnection(
      fetcher as typeof fetch,
      "http://music.local:5173",
    )).resolves.toBeUndefined();
  });
});
