import SparkMD5 from "spark-md5";
import { describe, expect, it, vi } from "vitest";

import {
  buildAuthParams,
  createSubsonicClient,
  SubsonicError,
  unwrapSubsonicResponse,
} from "./subsonic";
import type { AuthConfig } from "../types";

const auth: AuthConfig = { type: "password", username: "ada", password: "secret" };

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify({
      "subsonic-response": {
        status: status < 400 ? "ok" : "failed",
        version: "1.16.1",
        ...body,
      },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

describe("Subsonic authentication", () => {
  it("uses token and salt without exposing the password", () => {
    const params = buildAuthParams(auth, "fixed");

    expect(params).toMatchObject({ u: "ada", s: "fixed", v: "1.16.1", f: "json" });
    expect(params.t).toBe(SparkMD5.hash("secretfixed"));
    expect(Object.values(params)).not.toContain("secret");
  });

  it("supports API keys without password-auth fields", () => {
    const params = buildAuthParams({ type: "apiKey", apiKey: "key-1" }, "unused");

    expect(params).toMatchObject({ apiKey: "key-1", v: "1.16.1", f: "json" });
    expect(params).not.toHaveProperty("u");
    expect(params).not.toHaveProperty("t");
    expect(params).not.toHaveProperty("s");
  });
});

describe("Subsonic response handling", () => {
  it("rejects invalid and failed envelopes", () => {
    expect(() => unwrapSubsonicResponse({})).toThrow(/invalid/i);
    expect(() =>
      unwrapSubsonicResponse({
        "subsonic-response": {
          status: "failed",
          version: "1.16.1",
          error: { code: 40, message: "Wrong username or password" },
        },
      }),
    ).toThrowError(SubsonicError);
  });

  it("normalizes omitted response lists", async () => {
    const client = createSubsonicClient({
      serverUrl: "http://music.test",
      auth,
      fetcher: async () => response({ starred2: {} }),
      saltFactory: () => "fixed",
    });

    await expect(client.getStarred2()).resolves.toEqual({ song: [], album: [], artist: [] });
  });

  it("normalizes singleton search results and genre values", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ searchResult3: { song: { id: "song", title: "One" } } }),
      )
      .mockResolvedValueOnce(
        response({ genres: { genre: { value: "Rock", songCount: 4, albumCount: 1 } } }),
      );
    const client = createSubsonicClient({
      serverUrl: "http://music.test",
      auth,
      fetcher,
      saltFactory: () => "fixed",
    });

    await expect(client.search3("one")).resolves.toMatchObject({
      song: [{ id: "song", title: "One" }],
      album: [],
      artist: [],
    });
    await expect(client.getGenres()).resolves.toEqual([
      { value: "Rock", songCount: 4, albumCount: 1 },
    ]);
  });
});

describe("Subsonic endpoint client", () => {
  it("builds reverse-proxy-safe endpoint URLs without credentialed fetch mode", async () => {
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) =>
      response({ albumList2: { album: [] } }),
    );
    const client = createSubsonicClient({
      serverUrl: "http://music.test/navidrome/",
      auth,
      fetcher,
      saltFactory: () => "fixed",
    });

    await client.getAlbumList2("newest", 12, 24);

    const [input, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.pathname).toBe("/navidrome/rest/getAlbumList2.view");
    expect(url.searchParams.get("type")).toBe("newest");
    expect(url.searchParams.get("size")).toBe("12");
    expect(url.searchParams.get("offset")).toBe("24");
    expect(init).not.toMatchObject({ credentials: "include" });
  });

  it("creates authenticated cover and stream URLs", () => {
    const client = createSubsonicClient({
      serverUrl: "http://music.test",
      auth,
      fetcher: async () => response({}),
      saltFactory: () => "fixed",
    });

    const cover = new URL(client.coverArtUrl("cover 1", 512));
    const stream = new URL(client.streamUrl("song 1", 320));
    expect(cover.pathname).toBe("/rest/getCoverArt.view");
    expect(cover.searchParams.get("id")).toBe("cover 1");
    expect(cover.searchParams.get("size")).toBe("512");
    expect(stream.pathname).toBe("/rest/stream.view");
    expect(stream.searchParams.get("maxBitRate")).toBe("320");
    expect(stream.searchParams.get("t")).toBe(SparkMD5.hash("secretfixed"));
  });

  it("fetches a small CORS-clean cover without credential cookies or referrer data", async () => {
    const coverBody = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    const fetcher = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(coverBody, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(coverBody.size) },
      }),
    );
    const client = createSubsonicClient({
      serverUrl: "http://music.test",
      auth,
      fetcher,
      saltFactory: () => "fixed",
    });

    await expect(client.fetchCoverArt("cover 1", 64)).resolves.toHaveProperty(
      "type",
      "image/png",
    );
    const [input, init] = fetcher.mock.calls[0]!;
    expect(new URL(String(input)).pathname).toBe("/rest/getCoverArt.view");
    expect(init).toMatchObject({
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("rejects non-image cover responses without exposing the authenticated URL", async () => {
    const client = createSubsonicClient({
      serverUrl: "http://music.test",
      auth,
      fetcher: async () => new Response("not an image", { headers: { "content-type": "text/plain" } }),
      saltFactory: () => "fixed",
    });

    await expect(client.fetchCoverArt("cover 1")).rejects.toThrow("not an image");
    await expect(client.fetchCoverArt("cover 1")).rejects.not.toThrow(/secret|fixed|u=|t=/i);
  });
});
