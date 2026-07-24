import SparkMD5 from "spark-md5";

import type {
  Album,
  Artist,
  ArtistDirectory,
  ArtistIndex,
  AuthConfig,
  Genre,
  SearchResult,
  ServerInfo,
  StructuredLyrics,
  StarredResult,
  Track,
} from "../types";
import { normalizeServerUrl } from "./format";

export const SUBSONIC_VERSION = "1.16.1";
export const CLIENT_NAME = "my-navidrome-5-6";

export interface SubsonicErrorPayload {
  code: number;
  message?: string;
  helpUrl?: string;
}

export class SubsonicError extends Error {
  readonly code: number;
  readonly helpUrl?: string;

  constructor(payload: SubsonicErrorPayload) {
    super(payload.message || `Subsonic error ${payload.code}`);
    this.name = "SubsonicError";
    this.code = payload.code;
    this.helpUrl = payload.helpUrl;
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface CreateSubsonicClientOptions {
  serverUrl: string;
  auth: AuthConfig;
  fetcher?: Fetcher;
  saltFactory?: () => string;
}

type UnknownRecord = Record<string, unknown>;

type RawSubsonicRoot<T extends UnknownRecord = UnknownRecord> = T & {
  status: "ok" | "failed";
  version: string;
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
  error?: SubsonicErrorPayload;
};

type SubsonicEnvelope<T extends UnknownRecord = UnknownRecord> = {
  "subsonic-response": RawSubsonicRoot<T>;
};

type SubsonicRoot<T extends UnknownRecord = UnknownRecord> = T & ServerInfo;

export function randomSalt(): string {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function buildAuthParams(auth: AuthConfig, salt = randomSalt()): Record<string, string> {
  const common = { v: SUBSONIC_VERSION, c: CLIENT_NAME, f: "json" };
  if (auth.type === "apiKey") return { ...common, apiKey: auth.apiKey };
  return {
    ...common,
    u: auth.username,
    s: salt,
    t: SparkMD5.hash(`${auth.password}${salt}`),
  };
}

export function unwrapSubsonicResponse<T extends UnknownRecord>(payload: unknown): SubsonicRoot<T> {
  const root = (payload as Partial<SubsonicEnvelope<T>> | undefined)?.["subsonic-response"];
  if (!root || (root.status !== "ok" && root.status !== "failed")) {
    throw new SubsonicError({ code: 0, message: "Invalid Subsonic response" });
  }
  if (root.status === "failed") {
    throw new SubsonicError(root.error ?? { code: 0, message: "Subsonic request failed" });
  }
  return root as SubsonicRoot<T>;
}

function asArray<T>(value?: T | T[]): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function appendParams(
  url: URL,
  params: Record<string, string | number | boolean | undefined>,
): void {
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
}

function endpointUrl(
  serverUrl: string,
  endpoint: string,
  auth: AuthConfig,
  params: Record<string, string | number | boolean | undefined>,
  saltFactory: () => string,
): string {
  const url = new URL(`${normalizeServerUrl(serverUrl)}/rest/${endpoint}.view`);
  appendParams(url, buildAuthParams(auth, saltFactory()));
  appendParams(url, params);
  return url.toString();
}

export interface SubsonicClient {
  ping(): Promise<ServerInfo>;
  getAlbumList2(
    type: "newest" | "random" | "frequent" | "recent" | "alphabeticalByName",
    size?: number,
    offset?: number,
  ): Promise<Album[]>;
  getAlbum(id: string, signal?: AbortSignal): Promise<Album>;
  getArtists(musicFolderId?: string, signal?: AbortSignal): Promise<ArtistDirectory>;
  getArtist(id: string, signal?: AbortSignal): Promise<Artist>;
  getGenres(): Promise<Genre[]>;
  getSongsByGenre(
    genre: string,
    count?: number,
    offset?: number,
    signal?: AbortSignal,
  ): Promise<Track[]>;
  getLyricsBySongId(id: string, signal?: AbortSignal): Promise<StructuredLyrics[]>;
  search3(query: string): Promise<SearchResult>;
  getStarred2(): Promise<StarredResult>;
  star(id: string): Promise<void>;
  unstar(id: string): Promise<void>;
  scrobble(id: string, submission: boolean): Promise<void>;
  fetchCoverArt(id: string, size?: number, signal?: AbortSignal): Promise<Blob>;
  coverArtUrl(id: string, size?: number): string;
  streamUrl(id: string, maxBitRate?: number, format?: "opus"): string;
}

export function createSubsonicClient(options: CreateSubsonicClientOptions): SubsonicClient {
  const fetcher = options.fetcher ?? fetch.bind(globalThis);
  const saltFactory = options.saltFactory ?? randomSalt;

  async function request<T extends UnknownRecord = UnknownRecord>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    signal?: AbortSignal,
  ): Promise<SubsonicRoot<T>> {
    const url = endpointUrl(options.serverUrl, endpoint, options.auth, params, saltFactory);
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Request aborted", "AbortError");
      }
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      const detail = error instanceof Error ? error.message : "Network request failed";
      throw new SubsonicError({
        code: 0,
        message: `Could not reach Navidrome. Check the address, protocol, browser CORS, and local-network access. ${detail}`,
      });
    }
    if (!response.ok) {
      throw new SubsonicError({
        code: response.status,
        message: `Navidrome returned HTTP ${response.status} ${response.statusText}`.trim(),
      });
    }
    try {
      return unwrapSubsonicResponse<T>(await response.json());
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Request aborted", "AbortError");
      }
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof SubsonicError) throw error;
      throw new SubsonicError({ code: 0, message: "Navidrome returned invalid JSON" });
    }
  }

  return {
    async ping() {
      return request("ping");
    },
    async getAlbumList2(type, size = 24, offset = 0) {
      const root = await request<{ albumList2?: { album?: Album | Album[] } }>("getAlbumList2", {
        type,
        size,
        offset,
      });
      return asArray(root.albumList2?.album);
    },
    async getAlbum(id, signal) {
      const root = await request<{ album?: Album }>("getAlbum", { id }, signal);
      if (!root.album) throw new SubsonicError({ code: 70, message: "Album not found" });
      return { ...root.album, song: asArray(root.album.song) };
    },
    async getArtists(musicFolderId, signal) {
      type RawArtistIndex = Omit<ArtistIndex, "artist"> & {
        artist?: Artist | Artist[];
      };
      const root = await request<{
        artists?: {
          ignoredArticles?: string;
          index?: RawArtistIndex | RawArtistIndex[];
        };
      }>("getArtists", { musicFolderId }, signal);
      const index = asArray(root.artists?.index).map((entry) => ({
        ...entry,
        artist: asArray(entry.artist),
      }));
      return root.artists?.ignoredArticles === undefined
        ? { index }
        : { ignoredArticles: root.artists.ignoredArticles, index };
    },
    async getArtist(id, signal) {
      const root = await request<{ artist?: Artist }>("getArtist", { id }, signal);
      if (!root.artist) throw new SubsonicError({ code: 70, message: "Artist not found" });
      return { ...root.artist, album: asArray(root.artist.album) };
    },
    async getGenres() {
      const root = await request<{ genres?: { genre?: Genre | Genre[] } }>("getGenres");
      return asArray(root.genres?.genre);
    },
    async getSongsByGenre(genre, count = 60, offset = 0, signal) {
      const root = await request<{ songsByGenre?: { song?: Track | Track[] } }>("getSongsByGenre", {
        genre,
        count,
        offset,
      }, signal);
      return asArray(root.songsByGenre?.song);
    },
    async getLyricsBySongId(id, signal) {
      const root = await request<{
        lyricsList?: { structuredLyrics?: unknown };
      }>("getLyricsBySongId", { id }, signal);
      return normalizeStructuredLyrics(root.lyricsList?.structuredLyrics);
    },
    async search3(query) {
      const root = await request<{
        searchResult3?: {
          song?: Track | Track[];
          album?: Album | Album[];
          artist?: Artist | Artist[];
        };
      }>("search3", { query, songCount: 60, albumCount: 20, artistCount: 20 });
      return {
        song: asArray(root.searchResult3?.song),
        album: asArray(root.searchResult3?.album),
        artist: asArray(root.searchResult3?.artist),
      };
    },
    async getStarred2() {
      const root = await request<{
        starred2?: {
          song?: Track | Track[];
          album?: Album | Album[];
          artist?: Artist | Artist[];
        };
      }>("getStarred2");
      return {
        song: asArray(root.starred2?.song),
        album: asArray(root.starred2?.album),
        artist: asArray(root.starred2?.artist),
      };
    },
    async star(id) {
      await request("star", { id });
    },
    async unstar(id) {
      await request("unstar", { id });
    },
    async scrobble(id, submission) {
      await request("scrobble", { id, submission });
    },
    async fetchCoverArt(id, size = 64, signal) {
      const url = endpointUrl(options.serverUrl, "getCoverArt", options.auth, { id, size }, saltFactory);
      let response: Response;
      try {
        response = await fetcher(url, {
          method: "GET",
          headers: { Accept: "image/*" },
          mode: "cors",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new SubsonicError({ code: 0, message: "Cover colors are unavailable" });
      }
      if (!response.ok) {
        throw new SubsonicError({ code: response.status, message: "Cover colors are unavailable" });
      }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
      if (!contentType.startsWith("image/")) {
        throw new SubsonicError({ code: 0, message: "Cover response was not an image" });
      }
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > 5_000_000) {
        throw new SubsonicError({ code: 0, message: "Cover image was too large to analyze" });
      }
      const blob = await response.blob();
      if (blob.size > 5_000_000) {
        throw new SubsonicError({ code: 0, message: "Cover image was too large to analyze" });
      }
      return blob;
    },
    coverArtUrl(id, size = 512) {
      return endpointUrl(options.serverUrl, "getCoverArt", options.auth, { id, size }, saltFactory);
    },
    streamUrl(id, maxBitRate, format) {
      return endpointUrl(
        options.serverUrl,
        "stream",
        options.auth,
        { id, maxBitRate, format },
        saltFactory,
      );
    },
  };
}

function normalizeStructuredLyrics(value: unknown): StructuredLyrics[] {
  const entries = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return entries.flatMap((candidate) => {
    if (!isUnknownRecord(candidate)) return [];
    const rawLines = Array.isArray(candidate.line)
      ? candidate.line
      : candidate.line === undefined || candidate.line === null
        ? []
        : [candidate.line];
    const line = rawLines.flatMap((rawLine) => {
      if (!isUnknownRecord(rawLine) || typeof rawLine.value !== "string") return [];
      const value = rawLine.value.replace(/\r\n?/g, "\n").trim();
      if (!value) return [];
      const start = typeof rawLine.start === "number" && Number.isFinite(rawLine.start)
        ? Math.max(0, Math.round(rawLine.start))
        : undefined;
      return [{ ...(start === undefined ? {} : { start }), value }];
    });
    if (line.length === 0) return [];
    const displayArtist = typeof candidate.displayArtist === "string"
      ? candidate.displayArtist.trim()
      : undefined;
    const displayTitle = typeof candidate.displayTitle === "string"
      ? candidate.displayTitle.trim()
      : undefined;
    const lang = typeof candidate.lang === "string" && !["", "xxx", "und"].includes(candidate.lang.trim().toLowerCase())
      ? candidate.lang.trim()
      : undefined;
    const offset = typeof candidate.offset === "number" && Number.isFinite(candidate.offset)
      ? Math.round(candidate.offset)
      : undefined;
    const synced = candidate.synced === true && line.some((entry) => entry.start !== undefined);
    return [{
      ...(displayArtist ? { displayArtist } : {}),
      ...(displayTitle ? { displayTitle } : {}),
      ...(lang ? { lang } : {}),
      ...(offset === undefined ? {} : { offset }),
      synced,
      line,
    }];
  });
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
