import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeServerUrl } from "../lib/format";
import { createStableMediaUrlResolver, type StableMediaUrlResolver } from "../lib/mediaUrls";
import {
  DEFAULT_STREAMING_PREFERENCES,
  maxBitRateForTrack,
  normalizeStreamingPreferences,
  type ConnectionRoute,
  type StreamingMode,
  type StreamingPreferences,
} from "../lib/streamingPreferences";
import {
  createSubsonicClient,
  SubsonicError,
  type SubsonicClient,
} from "../lib/subsonic";
import type {
  Album,
  Artist,
  ArtistDirectory,
  AuthConfig,
  Genre,
  SearchResult,
  ServerInfo,
  Track,
} from "../types";

export type HomeSection = "newest" | "random" | "frequent" | "genres" | "starred";

export interface HomeState {
  newest: Album[];
  random: Album[];
  frequent: Album[];
  genres: Genre[];
  warnings: Partial<Record<HomeSection, string>>;
  loading: boolean;
  loadingSections?: Partial<Record<HomeSection, boolean>>;
}

export interface ConnectionInput {
  internalServerUrl?: string;
  externalServerUrl?: string;
  /** Compatibility with bound and previously saved single-address connections. */
  serverUrl?: string;
  auth: AuthConfig;
}

export interface UseNavidromeOptions {
  clientFactory?: typeof createSubsonicClient;
}

const EMPTY_HOME: HomeState = {
  newest: [],
  random: [],
  frequent: [],
  genres: [],
  warnings: {},
  loading: false,
  loadingSections: {},
};

const ARTIST_ALBUM_CONCURRENCY = 5;
const ALBUM_REQUEST_TIMEOUT_MS = 15_000;
const ARTIST_REQUEST_TIMEOUT_MS = 15_000;
const CONNECTION_PROBE_TIMEOUT_MS = 4_000;
const BACKGROUND_PROBE_TIMEOUT_MS = 2_500;
const INTERNAL_PROBE_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const;
const INTERNAL_ROUTE_CONFIRMATION_MS = 3_000;
const INTERNAL_ROUTE_COOLDOWN_MS = 30_000;
const STALE_DETAIL_REQUEST = new Error("Detail request is no longer active");

function withAbortableTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason ?? STALE_DETAIL_REQUEST);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(timeoutMessage, "TimeoutError"));
  }, timeoutMs);

  return new Promise<T>((resolve, reject) => {
    const rejectForAbort = () => {
      reject(timedOut ? new Error(timeoutMessage) : STALE_DETAIL_REQUEST);
    };
    controller.signal.addEventListener("abort", rejectForAbort, { once: true });
    if (controller.signal.aborted) rejectForAbort();

    Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return task(controller.signal);
      })
      .then(resolve, reject);
  }).finally(() => {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  });
}

function collectArtistTracks(
  results: readonly (PromiseSettledResult<Album> | undefined)[],
): Track[] {
  const seenTrackIds = new Set<string>();
  const tracks: Track[] = [];
  results.forEach((result) => {
    if (!result || result.status === "rejected") return;
    (result.value.song ?? []).forEach((track) => {
      if (seenTrackIds.has(track.id)) return;
      seenTrackIds.add(track.id);
      tracks.push(track);
    });
  });
  return tracks;
}

async function settleWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
  onSettled?: (result: PromiseSettledResult<R>, index: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      let result: PromiseSettledResult<R>;
      try {
        result = { status: "fulfilled", value: await task(items[index]!, index) };
      } catch (reason) {
        result = { status: "rejected", reason };
      }
      results[index] = result;
      onSettled?.(result, index);
    }
  }

  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed";
}

async function pingWithTimeout(client: SubsonicClient, route: ConnectionRoute): Promise<ServerInfo> {
  return pingWithDeadline(client, route, CONNECTION_PROBE_TIMEOUT_MS);
}

async function pingWithDeadline(
  client: SubsonicClient,
  route: ConnectionRoute,
  timeoutMs: number,
): Promise<ServerInfo> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${route === "internal" ? "Internal" : "External"} address timed out`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function isReachabilityError(error: unknown): boolean {
  if (error === STALE_DETAIL_REQUEST) return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof SubsonicError) {
    return error.code === 0 || error.code === 408 || error.code === 429 || error.code >= 500;
  }
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return /network|fetch|timed out|timeout|unreachable|connection|offline/i.test(error.message);
}

type RouteClients = Partial<Record<ConnectionRoute, SubsonicClient>>;

function createDynamicSubsonicClient(
  getActiveClient: () => SubsonicClient | undefined,
  invoke: (method: keyof SubsonicClient, args: unknown[]) => Promise<unknown>,
): SubsonicClient {
  const directMethods = new Set<keyof SubsonicClient>([
    "coverArtUrl",
    "streamUrl",
    "fetchCoverArt",
  ]);
  return new Proxy({} as SubsonicClient, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      const method = property as keyof SubsonicClient;
      return (...args: unknown[]) => {
        const activeClient = getActiveClient();
        if (!activeClient) throw new Error("Navidrome is not connected");
        if (directMethods.has(method)) {
          const direct = activeClient[method] as (...values: unknown[]) => unknown;
          return direct.apply(activeClient, args);
        }
        return invoke(method, args);
      };
    },
  });
}

function readStoredOptional(key: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return undefined;
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function readStored(key: string): string {
  return readStoredOptional(key) ?? "";
}

function store(key: string, value: string): void {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private browser session may reject storage; the live session still works.
  }
}

function readStreamingPreferences(): StreamingPreferences {
  const stored = readStored("mn56.streamingPreferences");
  if (!stored) return DEFAULT_STREAMING_PREFERENCES;
  try {
    return normalizeStreamingPreferences(JSON.parse(stored) as Partial<StreamingPreferences>);
  } catch {
    return DEFAULT_STREAMING_PREFERENCES;
  }
}

function markTrack(track: Track, starred: boolean): Track {
  return { ...track, starred: starred ? track.starred || new Date().toISOString() : undefined };
}

function updateTrackList(tracks: Track[], id: string, starred: boolean): Track[] {
  return tracks.map((track) => (track.id === id ? markTrack(track, starred) : track));
}

function restoreTrackStarredValue(
  tracks: Track[],
  id: string,
  starred: string | undefined,
): Track[] {
  return tracks.map((track) => (track.id === id ? { ...track, starred } : track));
}

export function useNavidrome(options: UseNavidromeOptions = {}) {
  const clientFactory = options.clientFactory ?? createSubsonicClient;
  const connectionGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const detailGeneration = useRef(0);
  const artistDirectoryGeneration = useRef(0);
  const detailAbortController = useRef<AbortController | undefined>(undefined);
  const artistDirectoryAbortController = useRef<AbortController | undefined>(undefined);
  const albumCache = useRef(new Map<string, Album>());
  const streamUrlCache = useRef(new Map<string, string>());
  const routeClients = useRef<RouteClients>({});
  const routeUrls = useRef<Partial<Record<ConnectionRoute, string>>>({});
  const activeRouteRef = useRef<ConnectionRoute | undefined>(undefined);
  const mediaUrlsRef = useRef<StableMediaUrlResolver | undefined>(undefined);
  const routeSwitchPromise = useRef<Promise<boolean> | undefined>(undefined);
  const internalRouteCooldownUntil = useRef(0);
  const favoriteVersions = useRef(new Map<string, number>());
  const favoriteRefreshGeneration = useRef(0);
  const favoriteWriteSequence = useRef(0);
  const pendingFavoriteWrites = useRef(new Set<number>());
  const favoriteReconcileNeeded = useRef(false);
  const [client, setClient] = useState<SubsonicClient>();
  const [mediaUrls, setMediaUrls] = useState<StableMediaUrlResolver>();
  const [serverInfo, setServerInfo] = useState<ServerInfo>();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string>();
  const [home, setHome] = useState<HomeState>(EMPTY_HOME);
  const [artistDirectory, setArtistDirectory] = useState<ArtistDirectory>();
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistsError, setArtistsError] = useState<string>();
  const [starredSongs, setStarredSongs] = useState<Track[]>([]);
  const [starredAlbums, setStarredAlbums] = useState<Album[]>([]);
  const [starredArtists, setStarredArtists] = useState<Artist[]>([]);
  const [searchResult, setSearchResult] = useState<SearchResult>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [activeAlbum, setActiveAlbum] = useState<Album>();
  const [activeArtist, setActiveArtist] = useState<Artist>();
  const [activeArtistTracks, setActiveArtistTracks] = useState<Track[]>([]);
  const [artistTracksLoading, setArtistTracksLoading] = useState(false);
  const [artistTracksWarning, setArtistTracksWarning] = useState<string>();
  const [activeGenre, setActiveGenre] = useState<string>();
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [mutationError, setMutationError] = useState<string>();
  const [rememberedServerUrl, setRememberedServerUrl] = useState(() =>
    readStored("mn56.serverUrl"),
  );
  const [rememberedInternalServerUrl, setRememberedInternalServerUrl] = useState(() =>
    readStoredOptional("mn56.internalServerUrl") ?? readStored("mn56.serverUrl"),
  );
  const [rememberedExternalServerUrl, setRememberedExternalServerUrl] = useState(() =>
    readStored("mn56.externalServerUrl"),
  );
  const [rememberedUsername, setRememberedUsername] = useState(() =>
    readStored("mn56.username"),
  );
  const [activeRoute, setActiveRoute] = useState<ConnectionRoute>();
  const [activeServerUrl, setActiveServerUrl] = useState("");
  const [routeStatus, setRouteStatus] = useState<"stable" | "probing" | "switching">("stable");
  const [routeNotice, setRouteNotice] = useState<string>();
  const [streamingPreferences, setStreamingPreferences] = useState(readStreamingPreferences);

  const starredIds = useMemo(() => new Set(starredSongs.map(({ id }) => id)), [starredSongs]);

  function isTrackStarred(track: Track): boolean {
    return starredIds.has(track.id);
  }

  function commitRoute(nextRoute: ConnectionRoute, notice?: string): void {
    const nextUrl = routeUrls.current[nextRoute];
    if (!nextUrl || !routeClients.current[nextRoute]) return;
    const previousRoute = activeRouteRef.current;
    activeRouteRef.current = nextRoute;
    streamUrlCache.current.clear();
    mediaUrlsRef.current?.clear();
    setActiveRoute(nextRoute);
    setActiveServerUrl(nextUrl);
    setRememberedServerUrl(nextUrl);
    store("mn56.serverUrl", nextUrl);
    setRouteStatus("stable");
    if (notice && previousRoute !== nextRoute) setRouteNotice(notice);
    if (previousRoute === "internal" && nextRoute === "external") {
      internalRouteCooldownUntil.current = Date.now() + INTERNAL_ROUTE_COOLDOWN_MS;
    }
  }

  async function trySwitchRoute(
    nextRoute: ConnectionRoute,
    notice: string,
  ): Promise<boolean> {
    if (activeRouteRef.current === nextRoute) return true;
    const candidate = routeClients.current[nextRoute];
    if (!candidate) return false;
    if (routeSwitchPromise.current) {
      await routeSwitchPromise.current;
      return activeRouteRef.current === nextRoute;
    }
    setRouteStatus("switching");
    const switching = pingWithDeadline(candidate, nextRoute, BACKGROUND_PROBE_TIMEOUT_MS)
      .then(() => {
        commitRoute(nextRoute, notice);
        return true;
      })
      .catch(() => {
        setRouteStatus("stable");
        return false;
      })
      .finally(() => {
        routeSwitchPromise.current = undefined;
      });
    routeSwitchPromise.current = switching;
    return switching;
  }

  async function invokeWithRouteFailover(
    method: keyof SubsonicClient,
    args: unknown[],
  ): Promise<unknown> {
    const requestRoute = activeRouteRef.current;
    const requestClient = requestRoute ? routeClients.current[requestRoute] : undefined;
    if (!requestRoute || !requestClient) throw new Error("Navidrome is not connected");
    const request = requestClient[method] as (...values: unknown[]) => unknown;
    try {
      return await request.apply(requestClient, args);
    } catch (error) {
      if (!isReachabilityError(error)) throw error;
      const alternateRoute: ConnectionRoute = requestRoute === "internal" ? "external" : "internal";
      const switched = await trySwitchRoute(
        alternateRoute,
        alternateRoute === "internal"
          ? "Internal network is available again. Switched to original-quality streaming."
          : "Internal network became unavailable. Switched to the external route.",
      );
      const retryClient = switched ? routeClients.current[alternateRoute] : undefined;
      if (!retryClient) throw error;
      const retry = retryClient[method] as (...values: unknown[]) => unknown;
      return retry.apply(retryClient, args);
    }
  }

  async function reportPlaybackFailure(): Promise<boolean> {
    const requestRoute = activeRouteRef.current;
    if (!requestRoute) return false;
    const alternateRoute: ConnectionRoute = requestRoute === "internal" ? "external" : "internal";
    return trySwitchRoute(
      alternateRoute,
      alternateRoute === "internal"
        ? "Playback recovered on the internal network."
        : "Playback lost the internal route and recovered through the external address.",
    );
  }

  function favoriteSnapshotIsCurrent(generation: number): boolean {
    return (
      generation === favoriteRefreshGeneration.current &&
      pendingFavoriteWrites.current.size === 0
    );
  }

  async function getCachedAlbum(
    activeClient: SubsonicClient,
    id: string,
    parentSignal: AbortSignal,
    refresh = false,
  ): Promise<Album> {
    if (refresh) albumCache.current.delete(id);
    const cached = albumCache.current.get(id);
    if (cached) return cached;
    const album = await withAbortableTimeout(
      (signal) => activeClient.getAlbum(id, signal),
      ALBUM_REQUEST_TIMEOUT_MS,
      "Album request timed out",
      parentSignal,
    );
    if (parentSignal.aborted) throw STALE_DETAIL_REQUEST;
    albumCache.current.set(id, album);
    return album;
  }

  async function loadHome(activeClient: SubsonicClient, generation: number): Promise<void> {
    const activeFavoriteGeneration = ++favoriteRefreshGeneration.current;
    setHome((state) => ({ ...state, loading: true, loadingSections: {}, warnings: {} }));
    const [newest, random, frequent, genres, starred] = await Promise.allSettled([
      activeClient.getAlbumList2("newest", 20),
      activeClient.getAlbumList2("random", 20),
      activeClient.getAlbumList2("frequent", 20),
      activeClient.getGenres(),
      activeClient.getStarred2(),
    ] as const);
    if (generation !== connectionGeneration.current) return;

    const warnings: HomeState["warnings"] = {};
    if (newest.status === "rejected") warnings.newest = message(newest.reason);
    if (random.status === "rejected") warnings.random = message(random.reason);
    if (frequent.status === "rejected") warnings.frequent = message(frequent.reason);
    if (genres.status === "rejected") warnings.genres = message(genres.reason);
    const canApplyFavoriteSnapshot = favoriteSnapshotIsCurrent(activeFavoriteGeneration);
    if (starred.status === "rejected" && canApplyFavoriteSnapshot) {
      warnings.starred = message(starred.reason);
    }

    setHome({
      newest: newest.status === "fulfilled" ? newest.value : [],
      random: random.status === "fulfilled" ? random.value : [],
      frequent: frequent.status === "fulfilled" ? frequent.value : [],
      genres: genres.status === "fulfilled" ? genres.value : [],
      warnings,
      loading: false,
      loadingSections: {},
    });
    if (starred.status === "fulfilled" && canApplyFavoriteSnapshot) {
      setStarredSongs(starred.value.song);
      setStarredAlbums(starred.value.album);
      setStarredArtists(starred.value.artist);
    }
  }

  async function connect(input: ConnectionInput): Promise<void> {
    const generation = ++connectionGeneration.current;
    artistDirectoryGeneration.current += 1;
    artistDirectoryAbortController.current?.abort(STALE_DETAIL_REQUEST);
    albumCache.current.clear();
    streamUrlCache.current.clear();
    favoriteVersions.current.clear();
    pendingFavoriteWrites.current.clear();
    favoriteReconcileNeeded.current = false;
    clearDetail();
    setArtistDirectory(undefined);
    setArtistsLoading(false);
    setArtistsError(undefined);
    setIsConnecting(true);
    setConnectionError(undefined);
    setMutationError(undefined);
    try {
      const rawInternalUrl = input.internalServerUrl?.trim() || input.serverUrl?.trim() || "";
      const rawExternalUrl = input.externalServerUrl?.trim() || "";
      if (!rawInternalUrl && !rawExternalUrl) {
        throw new Error("Enter an internal address, an external address, or both");
      }
      if (input.auth.type === "password" && (!input.auth.username.trim() || !input.auth.password)) {
        throw new Error("Enter both username and password");
      }
      if (input.auth.type === "apiKey" && !input.auth.apiKey.trim()) {
        throw new Error("Enter an API key");
      }
      const internalServerUrl = rawInternalUrl ? normalizeServerUrl(rawInternalUrl) : "";
      const externalServerUrl = rawExternalUrl ? normalizeServerUrl(rawExternalUrl) : "";
      const candidates: { route: ConnectionRoute; serverUrl: string }[] = [
        ...(internalServerUrl
          ? [{ route: "internal" as const, serverUrl: internalServerUrl }]
          : []),
        ...(externalServerUrl && externalServerUrl !== internalServerUrl
          ? [{ route: "external" as const, serverUrl: externalServerUrl }]
          : []),
      ];
      const candidateClients = Object.fromEntries(
        candidates.map((candidate) => [
          candidate.route,
          clientFactory({ serverUrl: candidate.serverUrl, auth: input.auth }),
        ]),
      ) as RouteClients;
      let info: ServerInfo | undefined;
      let selected: (typeof candidates)[number] | undefined;
      let lastError: unknown;
      for (const candidate of candidates) {
        try {
          const candidateClient = candidateClients[candidate.route]!;
          const candidateInfo = await pingWithTimeout(candidateClient, candidate.route);
          info = candidateInfo;
          selected = candidate;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!info || !selected) {
        throw lastError instanceof Error
          ? lastError
          : new Error("Neither Navidrome address could be reached");
      }
      if (generation !== connectionGeneration.current) return;
      routeClients.current = candidateClients;
      routeUrls.current = {
        ...(internalServerUrl ? { internal: internalServerUrl } : {}),
        ...(externalServerUrl && externalServerUrl !== internalServerUrl
          ? { external: externalServerUrl }
          : {}),
      };
      activeRouteRef.current = selected.route;
      const dynamicClient = createDynamicSubsonicClient(
        () => {
          const route = activeRouteRef.current;
          return route ? routeClients.current[route] : undefined;
        },
        invokeWithRouteFailover,
      );
      const nextMedia = createStableMediaUrlResolver((kind, id, size) =>
        kind === "cover" ? dynamicClient.coverArtUrl(id, size) : dynamicClient.streamUrl(id),
      );
      mediaUrlsRef.current = nextMedia;
      setClient(dynamicClient);
      setMediaUrls(nextMedia);
      setServerInfo(info);
      commitRoute(selected.route);
      setRememberedInternalServerUrl(internalServerUrl);
      setRememberedExternalServerUrl(externalServerUrl);
      store("mn56.internalServerUrl", internalServerUrl);
      store("mn56.externalServerUrl", externalServerUrl);
      if (input.auth.type === "password") {
        setRememberedUsername(input.auth.username);
        store("mn56.username", input.auth.username);
      }
      await loadHome(dynamicClient, generation);
    } catch (error) {
      if (generation !== connectionGeneration.current) return;
      setClient(undefined);
      setMediaUrls(undefined);
      mediaUrlsRef.current = undefined;
      routeClients.current = {};
      routeUrls.current = {};
      activeRouteRef.current = undefined;
      setServerInfo(undefined);
      setActiveRoute(undefined);
      setActiveServerUrl("");
      setConnectionError(message(error));
    } finally {
      if (generation === connectionGeneration.current) setIsConnecting(false);
    }
  }

  function disconnect(): void {
    connectionGeneration.current += 1;
    searchGeneration.current += 1;
    artistDirectoryGeneration.current += 1;
    favoriteRefreshGeneration.current += 1;
    artistDirectoryAbortController.current?.abort(STALE_DETAIL_REQUEST);
    albumCache.current.clear();
    streamUrlCache.current.clear();
    favoriteVersions.current.clear();
    pendingFavoriteWrites.current.clear();
    favoriteReconcileNeeded.current = false;
    mediaUrls?.clear();
    mediaUrlsRef.current = undefined;
    routeClients.current = {};
    routeUrls.current = {};
    activeRouteRef.current = undefined;
    routeSwitchPromise.current = undefined;
    setClient(undefined);
    setMediaUrls(undefined);
    setServerInfo(undefined);
    setActiveRoute(undefined);
    setActiveServerUrl("");
    setRouteStatus("stable");
    setRouteNotice(undefined);
    setConnectionError(undefined);
    setIsConnecting(false);
    setHome(EMPTY_HOME);
    setArtistDirectory(undefined);
    setArtistsLoading(false);
    setArtistsError(undefined);
    setStarredSongs([]);
    setStarredAlbums([]);
    setStarredArtists([]);
    setSearchResult(undefined);
    setSearchQuery("");
    setIsSearching(false);
    clearDetail();
  }

  function setStreamingMode(mode: StreamingMode): void {
    const next = normalizeStreamingPreferences({ ...streamingPreferences, mode });
    streamUrlCache.current.clear();
    setStreamingPreferences(next);
    store("mn56.streamingPreferences", JSON.stringify(next));
  }

  function setStreamingMaxBitRate(maxBitRate: number): void {
    const next = normalizeStreamingPreferences({ ...streamingPreferences, maxBitRate });
    streamUrlCache.current.clear();
    setStreamingPreferences(next);
    store("mn56.streamingPreferences", JSON.stringify(next));
  }

  const streamUrlForTrack = useCallback((track: Track): string => {
    if (!client || !activeRoute) return "";
    const maxBitRate = maxBitRateForTrack(track, activeRoute, streamingPreferences);
    const cacheKey = `${track.id}:${maxBitRate ?? "original"}`;
    const cached = streamUrlCache.current.get(cacheKey);
    if (cached) return cached;
    const url = client.streamUrl(track.id, maxBitRate);
    streamUrlCache.current.set(cacheKey, url);
    return url;
  }, [activeRoute, client, streamingPreferences]);

  useEffect(() => {
    if (
      !client
      || activeRoute !== "external"
      || !routeClients.current.internal
      || typeof window === "undefined"
    ) return;

    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failedAttempts = 0;
    let consecutiveSuccesses = 0;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (!cancelled) timer = setTimeout(() => void probe(), delay);
    };
    const probe = async () => {
      if (
        cancelled
        || running
        || document.visibilityState === "hidden"
        || navigator.onLine === false
      ) return;
      const internalClient = routeClients.current.internal;
      if (!internalClient || activeRouteRef.current !== "external") return;
      running = true;
      setRouteStatus("probing");
      try {
        await pingWithDeadline(internalClient, "internal", BACKGROUND_PROBE_TIMEOUT_MS);
        if (cancelled || activeRouteRef.current !== "external") return;
        consecutiveSuccesses += 1;
        failedAttempts = 0;
        if (consecutiveSuccesses >= 2) {
          commitRoute(
            "internal",
            "Internal network is stable again. Switched to original-quality streaming.",
          );
          return;
        }
        schedule(INTERNAL_ROUTE_CONFIRMATION_MS);
      } catch {
        if (cancelled) return;
        consecutiveSuccesses = 0;
        const delay = INTERNAL_PROBE_DELAYS_MS[
          Math.min(failedAttempts, INTERNAL_PROBE_DELAYS_MS.length - 1)
        ];
        failedAttempts += 1;
        setRouteStatus("stable");
        schedule(delay);
      } finally {
        running = false;
      }
    };
    const probeNow = () => {
      failedAttempts = 0;
      consecutiveSuccesses = 0;
      clearTimer();
      void probe();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") probeNow();
    };

    window.addEventListener("online", probeNow);
    document.addEventListener("visibilitychange", handleVisibility);
    const cooldown = Math.max(0, internalRouteCooldownUntil.current - Date.now());
    schedule(Math.max(INTERNAL_PROBE_DELAYS_MS[0], cooldown));

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("online", probeNow);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeRoute, client]);

  async function refreshHome(): Promise<void> {
    if (client) await loadHome(client, connectionGeneration.current);
  }

  async function loadArtists(musicFolderId?: string): Promise<void> {
    if (!client) return;
    const activeClient = client;
    const generation = ++artistDirectoryGeneration.current;
    const activeConnection = connectionGeneration.current;
    artistDirectoryAbortController.current?.abort(STALE_DETAIL_REQUEST);
    const requestController = new AbortController();
    artistDirectoryAbortController.current = requestController;
    setArtistsLoading(true);
    setArtistsError(undefined);
    try {
      const directory = await withAbortableTimeout(
        (signal) => activeClient.getArtists(musicFolderId, signal),
        ARTIST_REQUEST_TIMEOUT_MS,
        "Artist directory request timed out",
        requestController.signal,
      );
      if (
        generation !== artistDirectoryGeneration.current ||
        activeConnection !== connectionGeneration.current
      ) {
        return;
      }
      setArtistDirectory(directory);
    } catch (error) {
      if (
        generation === artistDirectoryGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setArtistsError(message(error));
      }
    } finally {
      if (
        generation === artistDirectoryGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setArtistsLoading(false);
      }
    }
  }

  async function retryHomeSection(section: HomeSection): Promise<void> {
    if (!client) return;
    const activeClient = client;
    const activeConnection = connectionGeneration.current;
    const activeFavoriteGeneration = section === "starred"
      ? ++favoriteRefreshGeneration.current
      : favoriteRefreshGeneration.current;
    setHome((state) => {
      const warnings = { ...state.warnings };
      delete warnings[section];
      return {
        ...state,
        warnings,
        loadingSections: { ...(state.loadingSections ?? {}), [section]: true },
      };
    });

    const isCurrentConnection = () => activeConnection === connectionGeneration.current;
    try {
      if (section === "newest" || section === "random" || section === "frequent") {
        const albums = await activeClient.getAlbumList2(section, 20);
        if (!isCurrentConnection()) return;
        setHome((state) => ({ ...state, [section]: albums }));
      } else if (section === "genres") {
        const genres = await activeClient.getGenres();
        if (!isCurrentConnection()) return;
        setHome((state) => ({ ...state, genres }));
      } else {
        const starred = await activeClient.getStarred2();
        if (
          !isCurrentConnection() ||
          !favoriteSnapshotIsCurrent(activeFavoriteGeneration)
        ) {
          return;
        }
        setStarredSongs(starred.song);
        setStarredAlbums(starred.album);
        setStarredArtists(starred.artist);
      }
    } catch (error) {
      if (
        !isCurrentConnection() ||
        (section === "starred" && !favoriteSnapshotIsCurrent(activeFavoriteGeneration))
      ) {
        return;
      }
      setHome((state) => ({
        ...state,
        warnings: { ...state.warnings, [section]: message(error) },
      }));
    } finally {
      if (isCurrentConnection()) {
        setHome((state) => ({
          ...state,
          loadingSections: { ...(state.loadingSections ?? {}), [section]: false },
        }));
      }
    }
  }

  async function search(query: string): Promise<void> {
    const trimmed = query.trim();
    const generation = ++searchGeneration.current;
    setSearchQuery(trimmed);
    if (!client || !trimmed) {
      setSearchResult(undefined);
      setSearchError(undefined);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(undefined);
    try {
      const result = await client.search3(trimmed);
      if (generation === searchGeneration.current) setSearchResult(result);
    } catch (error) {
      if (generation === searchGeneration.current) setSearchError(message(error));
    } finally {
      if (generation === searchGeneration.current) setIsSearching(false);
    }
  }

  function clearDetail(): void {
    detailAbortController.current?.abort(STALE_DETAIL_REQUEST);
    detailAbortController.current = undefined;
    detailGeneration.current += 1;
    setActiveAlbum(undefined);
    setActiveArtist(undefined);
    setActiveArtistTracks([]);
    setArtistTracksLoading(false);
    setArtistTracksWarning(undefined);
    setActiveGenre(undefined);
    setGenreTracks([]);
    setDetailLoading(false);
    setDetailError(undefined);
  }

  async function openAlbum(id: string, refresh = false): Promise<void> {
    if (!client) return;
    const activeClient = client;
    detailAbortController.current?.abort(STALE_DETAIL_REQUEST);
    const requestController = new AbortController();
    detailAbortController.current = requestController;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    setActiveArtistTracks([]);
    setArtistTracksLoading(false);
    setArtistTracksWarning(undefined);
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const album = await getCachedAlbum(activeClient, id, requestController.signal, refresh);
      if (
        generation !== detailGeneration.current ||
        activeConnection !== connectionGeneration.current
      ) {
        return;
      }
      setActiveAlbum(album);
      setActiveArtist(undefined);
      setActiveGenre(undefined);
    } catch (error) {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailError(message(error));
      }
    } finally {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailLoading(false);
      }
    }
  }

  async function openArtist(id: string, refresh = false): Promise<void> {
    if (!client) return;
    const activeClient = client;
    detailAbortController.current?.abort(STALE_DETAIL_REQUEST);
    const requestController = new AbortController();
    detailAbortController.current = requestController;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    const detailIsCurrent = () =>
      generation === detailGeneration.current &&
      activeConnection === connectionGeneration.current;
    setActiveArtistTracks([]);
    setArtistTracksLoading(false);
    setArtistTracksWarning(undefined);
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const artist = await withAbortableTimeout(
        (signal) => activeClient.getArtist(id, signal),
        ARTIST_REQUEST_TIMEOUT_MS,
        "Artist request timed out",
        requestController.signal,
      );
      if (!detailIsCurrent()) return;
      setActiveArtist(artist);
      setActiveAlbum(undefined);
      setActiveGenre(undefined);
      setDetailLoading(false);

      const albums = artist.album ?? [];
      if (albums.length === 0) return;
      setArtistTracksLoading(true);
      const progressiveResults = new Array<PromiseSettledResult<Album> | undefined>(
        albums.length,
      );
      const albumResults = await settleWithConcurrency(
        albums,
        ARTIST_ALBUM_CONCURRENCY,
        (album) => {
          if (!detailIsCurrent()) throw STALE_DETAIL_REQUEST;
          return getCachedAlbum(
            activeClient,
            album.id,
            requestController.signal,
            refresh,
          );
        },
        (result, index) => {
          progressiveResults[index] = result;
          if (detailIsCurrent()) {
            setActiveArtistTracks(collectArtistTracks(progressiveResults));
          }
        },
      );
      if (!detailIsCurrent()) return;

      let failedAlbums = 0;
      albumResults.forEach((result) => {
        if (result.status === "rejected") {
          failedAlbums += 1;
        }
      });
      setActiveArtistTracks(collectArtistTracks(albumResults));
      if (failedAlbums === albums.length) {
        setArtistTracksWarning(
          `Songs could not be loaded from ${failedAlbums === 1 ? "1 album" : `${failedAlbums} albums`}.`,
        );
      } else if (failedAlbums > 0) {
        setArtistTracksWarning(
          `${failedAlbums} of ${albums.length} albums could not be loaded; showing the remaining songs.`,
        );
      }
    } catch (error) {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailError(message(error));
      }
    } finally {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailLoading(false);
        setArtistTracksLoading(false);
      }
    }
  }

  async function openGenre(genre: string): Promise<void> {
    if (!client) return;
    const activeClient = client;
    detailAbortController.current?.abort(STALE_DETAIL_REQUEST);
    const requestController = new AbortController();
    detailAbortController.current = requestController;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    setActiveArtistTracks([]);
    setArtistTracksLoading(false);
    setArtistTracksWarning(undefined);
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const tracks = await withAbortableTimeout(
        (signal) => activeClient.getSongsByGenre(genre, 80, 0, signal),
        ARTIST_REQUEST_TIMEOUT_MS,
        "Genre request timed out",
        requestController.signal,
      );
      if (
        generation !== detailGeneration.current ||
        activeConnection !== connectionGeneration.current
      ) {
        return;
      }
      setActiveGenre(genre);
      setGenreTracks(tracks);
      setActiveAlbum(undefined);
      setActiveArtist(undefined);
    } catch (error) {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailError(message(error));
      }
    } finally {
      if (
        generation === detailGeneration.current &&
        activeConnection === connectionGeneration.current
      ) {
        setDetailLoading(false);
      }
    }
  }

  async function toggleStar(track: Track): Promise<void> {
    if (!client) return;
    albumCache.current.clear();
    const wasStarred = isTrackStarred(track);
    const willStar = !wasStarred;
    const previousStarredIndex = starredSongs.findIndex(({ id }) => id === track.id);
    const previousStarredTrack = previousStarredIndex >= 0
      ? starredSongs[previousStarredIndex]
      : undefined;
    const mutationVersion = (favoriteVersions.current.get(track.id) ?? 0) + 1;
    favoriteVersions.current.set(track.id, mutationVersion);
    const activeConnection = connectionGeneration.current;
    const writeToken = ++favoriteWriteSequence.current;
    pendingFavoriteWrites.current.add(writeToken);
    favoriteRefreshGeneration.current += 1;
    const previousSearchStarred = searchResult?.song.find(({ id }) => id === track.id)?.starred;
    const previousAlbumStarred = activeAlbum?.song?.find(({ id }) => id === track.id)?.starred;
    const previousArtistStarred = activeArtistTracks.find(({ id }) => id === track.id)?.starred;
    const previousGenreStarred = genreTracks.find(({ id }) => id === track.id)?.starred;
    setMutationError(undefined);
    setStarredSongs((songs) =>
      willStar
        ? [markTrack(track, true), ...songs.filter(({ id }) => id !== track.id)]
        : songs.filter(({ id }) => id !== track.id),
    );
    setSearchResult((result) =>
      result ? { ...result, song: updateTrackList(result.song, track.id, willStar) } : result,
    );
    setActiveAlbum((album) =>
      album?.song ? { ...album, song: updateTrackList(album.song, track.id, willStar) } : album,
    );
    setActiveArtistTracks((tracks) => updateTrackList(tracks, track.id, willStar));
    setGenreTracks((tracks) => updateTrackList(tracks, track.id, willStar));

    let writeSucceeded = false;
    try {
      if (willStar) await client.star(track.id);
      else await client.unstar(track.id);
      writeSucceeded = true;
    } catch (error) {
      if (
        activeConnection !== connectionGeneration.current ||
        favoriteVersions.current.get(track.id) !== mutationVersion
      ) {
        return;
      }
      setStarredSongs((songs) => {
        const withoutTarget = songs.filter(({ id }) => id !== track.id);
        if (!wasStarred) return withoutTarget;
        const restored = previousStarredTrack ?? markTrack(track, true);
        const insertion = Math.min(Math.max(previousStarredIndex, 0), withoutTarget.length);
        return [
          ...withoutTarget.slice(0, insertion),
          restored,
          ...withoutTarget.slice(insertion),
        ];
      });
      setSearchResult((result) =>
        result
          ? {
              ...result,
              song: restoreTrackStarredValue(result.song, track.id, previousSearchStarred),
            }
          : result,
      );
      setActiveAlbum((album) =>
        album?.song
          ? {
              ...album,
              song: restoreTrackStarredValue(album.song, track.id, previousAlbumStarred),
            }
          : album,
      );
      setActiveArtistTracks((tracks) =>
        restoreTrackStarredValue(tracks, track.id, previousArtistStarred),
      );
      setGenreTracks((tracks) =>
        restoreTrackStarredValue(tracks, track.id, previousGenreStarred),
      );
      setMutationError(message(error));
      return;
    } finally {
      const stillConnected = activeConnection === connectionGeneration.current;
      const wasPending = pendingFavoriteWrites.current.delete(writeToken);
      if (stillConnected && wasPending) {
        if (writeSucceeded) favoriteReconcileNeeded.current = true;
        const reconciliationGeneration = ++favoriteRefreshGeneration.current;
        if (
          pendingFavoriteWrites.current.size === 0 &&
          favoriteReconcileNeeded.current
        ) {
          favoriteReconcileNeeded.current = false;
          void client
            .getStarred2()
            .then((result) => {
              if (
                activeConnection !== connectionGeneration.current ||
                !favoriteSnapshotIsCurrent(reconciliationGeneration)
              ) {
                return;
              }
              setStarredSongs(result.song);
              setStarredAlbums(result.album);
              setStarredArtists(result.artist);
            })
            .catch(() => undefined);
        }
      }
    }
  }

  return {
    client,
    mediaUrls,
    serverInfo,
    isConnected: Boolean(client && serverInfo),
    isConnecting,
    connectionError,
    rememberedServerUrl,
    rememberedInternalServerUrl,
    rememberedExternalServerUrl,
    rememberedUsername,
    activeRoute,
    activeServerUrl,
    routeStatus,
    routeNotice,
    streamingPreferences,
    home,
    artistDirectory,
    artistsLoading,
    artistsError,
    starredSongs,
    starredAlbums,
    starredArtists,
    starredIds,
    isTrackStarred,
    searchResult,
    searchQuery,
    isSearching,
    searchError,
    activeAlbum,
    activeArtist,
    activeArtistTracks,
    artistTracksLoading,
    artistTracksWarning,
    activeGenre,
    genreTracks,
    detailLoading,
    detailError,
    mutationError,
    connect,
    disconnect,
    setStreamingMode,
    setStreamingMaxBitRate,
    streamUrlForTrack,
    reportPlaybackFailure,
    refreshHome,
    loadArtists,
    retryHomeSection,
    search,
    openAlbum,
    openArtist,
    openGenre,
    clearDetail,
    toggleStar,
  };
}

export type NavidromeController = ReturnType<typeof useNavidrome>;
