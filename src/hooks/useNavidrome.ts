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
  const favoriteVersions = useRef(new Map<string, number>());
  const mutatedFavoriteIds = useRef(new Set<string>());
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
  const [starredSongs, setStarredSongs] = useState<Track[]>([]);
  const [starredAlbums, setStarredAlbums] = useState<Album[]>([]);
  const [starredArtists, setStarredArtists] = useState<Artist[]>([]);
  const [searchResult, setSearchResult] = useState<SearchResult>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [activeAlbum, setActiveAlbum] = useState<Album>();
  const [activeArtist, setActiveArtist] = useState<Artist>();
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
    return (
      starredIds.has(track.id) ||
      (!mutatedFavoriteIds.current.has(track.id) && Boolean(track.starred))
    );
  }

  function favoriteSnapshotIsCurrent(generation: number): boolean {
    return (
      generation === favoriteRefreshGeneration.current &&
      pendingFavoriteWrites.current.size === 0
    );
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
    favoriteVersions.current.clear();
    mutatedFavoriteIds.current.clear();
    pendingFavoriteWrites.current.clear();
    favoriteReconcileNeeded.current = false;
    clearDetail();
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
    favoriteRefreshGeneration.current += 1;
    favoriteVersions.current.clear();
    mutatedFavoriteIds.current.clear();
    pendingFavoriteWrites.current.clear();
    favoriteReconcileNeeded.current = false;
    mediaUrls?.clear();
    setClient(undefined);
    setMediaUrls(undefined);
    setServerInfo(undefined);
    setConnectionError(undefined);
    setIsConnecting(false);
    setHome(EMPTY_HOME);
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
    detailGeneration.current += 1;
    setActiveAlbum(undefined);
    setActiveArtist(undefined);
    setActiveGenre(undefined);
    setGenreTracks([]);
    setDetailLoading(false);
    setDetailError(undefined);
  }

  async function openAlbum(id: string): Promise<void> {
    if (!client) return;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const album = await client.getAlbum(id);
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

  async function openArtist(id: string): Promise<void> {
    if (!client) return;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const artist = await client.getArtist(id);
      if (
        generation !== detailGeneration.current ||
        activeConnection !== connectionGeneration.current
      ) {
        return;
      }
      setActiveArtist(artist);
      setActiveAlbum(undefined);
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

  async function openGenre(genre: string): Promise<void> {
    if (!client) return;
    const generation = ++detailGeneration.current;
    const activeConnection = connectionGeneration.current;
    setDetailLoading(true);
    setDetailError(undefined);
    try {
      const tracks = await client.getSongsByGenre(genre, 80);
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
    const wasStarred = isTrackStarred(track);
    const willStar = !wasStarred;
    mutatedFavoriteIds.current.add(track.id);
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
    setGenreTracks((tracks) => updateTrackList(tracks, track.id, willStar));

    let writeSucceeded = false;
    try {
      if (willStar) await client.star(track.id);
      else await client.unstar(track.id);
      writeSucceeded = true;
    } catch (error) {
      if (favoriteVersions.current.get(track.id) !== mutationVersion) return;
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
    activeGenre,
    genreTracks,
    detailLoading,
    detailError,
    mutationError,
    connect,
    disconnect,
    refreshHome,
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
