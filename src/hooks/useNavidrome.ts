import { useMemo, useRef, useState } from "react";

import { normalizeServerUrl } from "../lib/format";
import { createStableMediaUrlResolver, type StableMediaUrlResolver } from "../lib/mediaUrls";
import {
  createSubsonicClient,
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
  serverUrl: string;
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

function readStored(key: string): string {
  if (typeof window === "undefined") return "";
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
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
  const [rememberedUsername, setRememberedUsername] = useState(() =>
    readStored("mn56.username"),
  );

  const starredIds = useMemo(() => new Set(starredSongs.map(({ id }) => id)), [starredSongs]);

  function isTrackStarred(track: Track): boolean {
    return starredIds.has(track.id);
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
      const serverUrl = normalizeServerUrl(input.serverUrl);
      if (input.auth.type === "password" && (!input.auth.username.trim() || !input.auth.password)) {
        throw new Error("Enter both username and password");
      }
      if (input.auth.type === "apiKey" && !input.auth.apiKey.trim()) {
        throw new Error("Enter an API key");
      }
      const nextClient = clientFactory({ serverUrl, auth: input.auth });
      const info = await nextClient.ping();
      if (generation !== connectionGeneration.current) return;
      const nextMedia = createStableMediaUrlResolver((kind, id, size) =>
        kind === "cover" ? nextClient.coverArtUrl(id, size) : nextClient.streamUrl(id),
      );
      setClient(nextClient);
      setMediaUrls(nextMedia);
      setServerInfo(info);
      setRememberedServerUrl(serverUrl);
      store("mn56.serverUrl", serverUrl);
      if (input.auth.type === "password") {
        setRememberedUsername(input.auth.username);
        store("mn56.username", input.auth.username);
      }
      await loadHome(nextClient, generation);
    } catch (error) {
      if (generation !== connectionGeneration.current) return;
      setClient(undefined);
      setMediaUrls(undefined);
      setServerInfo(undefined);
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
    favoriteVersions.current.clear();
    pendingFavoriteWrites.current.clear();
    favoriteReconcileNeeded.current = false;
    mediaUrls?.clear();
    setClient(undefined);
    setMediaUrls(undefined);
    setServerInfo(undefined);
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
    rememberedUsername,
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
