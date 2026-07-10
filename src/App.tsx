import { useEffect, useId, useReducer, useRef, useState } from "react";

import { ConnectionGate } from "./components/ConnectionGate";
import { EntityDetail, type DetailKind } from "./components/EntityDetail";
import { FavoritesView } from "./components/FavoritesView";
import { HomeView } from "./components/HomeView";
import {
  Navigation,
  type AppView,
  type PrimaryView,
} from "./components/Navigation";
import { PlayerDock } from "./components/PlayerDock";
import { QueuePanel } from "./components/QueuePanel";
import { SearchView } from "./components/SearchView";
import { Toast } from "./components/Toast";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useNavidrome } from "./hooks/useNavidrome";
import { resolveThemeForTrack, themeToCssVars } from "./lib/themeEngine";
import {
  createInitialQueueState,
  getCurrentTrack,
  queueReducer,
} from "./state/playerQueue";
import type { Album, Artist, Track } from "./types";

type DetailRequest =
  | { kind: "album"; id: string }
  | { kind: "artist"; id: string }
  | { kind: "genre"; genre: string };

type NavigationEntry =
  | { view: PrimaryView }
  | { view: DetailKind; request: DetailRequest };

export default function App() {
  const navidrome = useNavidrome();
  const [queueState, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const currentTrack = getCurrentTrack(queueState);
  const player = useAudioPlayer({
    client: navidrome.client,
    currentTrack,
    queueState,
    dispatch,
  });
  const [view, setView] = useState<AppView>("home");
  const [detailRequest, setDetailRequest] = useState<DetailRequest>();
  const [detailHistory, setDetailHistory] = useState<NavigationEntry[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const queuePanelId = useId();
  const [notice, setNotice] = useState<string>();
  const [toastVisible, setToastVisible] = useState(false);
  const pendingPlay = useRef(false);
  const [playRequest, setPlayRequest] = useState(0);
  const theme = resolveThemeForTrack(currentTrack);
  const toastMessage = navidrome.mutationError || player.error || notice;

  useEffect(() => {
    setToastVisible(Boolean(toastMessage));
  }, [toastMessage]);

  useEffect(() => {
    if (!pendingPlay.current || !currentTrack) return;
    pendingPlay.current = false;
    void player.play();
  }, [currentTrack?.id, playRequest]);

  function coverUrl(coverArt?: string, size?: number): string {
    return navidrome.mediaUrls?.cover(coverArt, size) ?? "";
  }

  function navigate(nextView: PrimaryView): void {
    navidrome.clearDetail();
    setDetailRequest(undefined);
    setDetailHistory([]);
    setView(nextView);
  }

  function currentNavigationEntry(): NavigationEntry {
    if (view === "home" || view === "search" || view === "favorites") {
      return { view };
    }
    return detailRequest
      ? { view: detailRequest.kind, request: detailRequest }
      : { view: "home" };
  }

  function loadDetail(request: DetailRequest): void {
    if (request.kind === "album") void navidrome.openAlbum(request.id);
    else if (request.kind === "artist") void navidrome.openArtist(request.id);
    else void navidrome.openGenre(request.genre);
  }

  function openDetail(request: DetailRequest): void {
    const previous = currentNavigationEntry();
    setDetailHistory((entries) => [...entries, previous]);
    setDetailRequest(request);
    setView(request.kind);
    loadDetail(request);
  }

  function openAlbum(album: Album): void {
    openDetail({ kind: "album", id: album.id });
  }

  function openArtist(artist: Artist): void {
    openDetail({ kind: "artist", id: artist.id });
  }

  function openGenre(genre: string): void {
    openDetail({ kind: "genre", genre });
  }

  function retryDetail(): void {
    if (!detailRequest) return;
    loadDetail(detailRequest);
  }

  function closeDetail(): void {
    const previous = detailHistory.at(-1);
    navidrome.clearDetail();
    setDetailHistory((entries) => entries.slice(0, -1));
    if (previous && "request" in previous) {
      setDetailRequest(previous.request);
      setView(previous.view);
      loadDetail(previous.request);
      return;
    }
    setDetailRequest(undefined);
    setView(previous?.view ?? "home");
  }

  function requestPlayback(track: Track, index: number, tracks: Track[]): void {
    pendingPlay.current = true;
    dispatch({ type: "playNow", tracks, startIndex: index });
    setPlayRequest((value) => value + 1);
    setNotice(`Playing ${track.title}`);
  }

  function playCollection(tracks: Track[]): void {
    if (tracks.length === 0) return;
    pendingPlay.current = true;
    dispatch({ type: "playNow", tracks });
    setPlayRequest((value) => value + 1);
    setNotice(`Playing ${tracks[0]!.album || tracks[0]!.genre || "this collection"}`);
  }

  function addToQueue(track: Track): void {
    dispatch({ type: "append", tracks: [track] });
    setNotice(`Added ${track.title} to the queue`);
  }

  function addCollection(tracks: Track[]): void {
    if (tracks.length === 0) return;
    dispatch({ type: "append", tracks });
    setNotice(`Added ${tracks.length} tracks to the queue`);
  }

  function selectAndPlayFromQueue(index: number): void {
    const track = queueState.tracks[index];
    if (!track) return;
    pendingPlay.current = true;
    dispatch({ type: "select", index });
    setPlayRequest((value) => value + 1);
    setNotice(`Playing ${track.title}`);
  }

  function toggleStar(track: Track): void {
    const currentlyStarred = navidrome.isTrackStarred(track);
    setNotice(`${currentlyStarred ? "Removed" : "Added"} ${track.title} ${currentlyStarred ? "from" : "to"} favorites`);
    void navidrome.toggleStar(track);
  }

  function disconnect(): void {
    player.reset();
    dispatch({ type: "clear" });
    navidrome.disconnect();
    setView("home");
    setDetailRequest(undefined);
    setDetailHistory([]);
    setQueueOpen(false);
    setNotice(undefined);
  }

  function renderView() {
    if (view === "home") {
      return (
        <HomeView
          home={navidrome.home}
          coverUrl={coverUrl}
          onOpenAlbum={openAlbum}
          onOpenGenre={openGenre}
          onRetry={(section) => {
            if (section) void navidrome.retryHomeSection(section);
            else void navidrome.refreshHome();
          }}
        />
      );
    }
    if (view === "search") {
      return (
        <SearchView
          query={navidrome.searchQuery}
          result={navidrome.searchResult}
          loading={navidrome.isSearching}
          error={navidrome.searchError}
          starredIds={navidrome.starredIds}
          coverUrl={coverUrl}
          currentTrackId={currentTrack?.id}
          onSearch={(query) => void navidrome.search(query)}
          onOpenAlbum={openAlbum}
          onOpenArtist={openArtist}
          onPlay={requestPlayback}
          onAddToQueue={addToQueue}
          onToggleStar={toggleStar}
        />
      );
    }
    if (view === "favorites") {
      return (
        <FavoritesView
          songs={navidrome.starredSongs}
          albums={navidrome.starredAlbums}
          artists={navidrome.starredArtists}
          starredIds={navidrome.starredIds}
          loading={
            navidrome.home.loading || Boolean(navidrome.home.loadingSections?.starred)
          }
          error={navidrome.home.warnings.starred}
          coverUrl={coverUrl}
          currentTrackId={currentTrack?.id}
          onRetry={() => void navidrome.retryHomeSection("starred")}
          onOpenAlbum={openAlbum}
          onOpenArtist={openArtist}
          onPlay={requestPlayback}
          onAddToQueue={addToQueue}
          onToggleStar={toggleStar}
        />
      );
    }
    return (
      <EntityDetail
        kind={view as DetailKind}
        album={navidrome.activeAlbum}
        artist={navidrome.activeArtist}
        genre={navidrome.activeGenre}
        genreTracks={navidrome.genreTracks}
        loading={navidrome.detailLoading}
        error={navidrome.detailError}
        starredIds={navidrome.starredIds}
        currentTrackId={currentTrack?.id}
        coverUrl={coverUrl}
        onBack={closeDetail}
        onRetry={retryDetail}
        onOpenAlbum={openAlbum}
        onPlay={requestPlayback}
        onAddToQueue={addToQueue}
        onToggleStar={toggleStar}
        onPlayCollection={playCollection}
        onAddCollection={addCollection}
      />
    );
  }

  if (!navidrome.isConnected) {
    return (
      <div
        className="app app--connection"
        data-theme={theme.id}
        data-density={theme.density}
        data-frame={theme.frameStyle}
        style={themeToCssVars(theme)}
      >
        <div className="ambient-layer" aria-hidden="true" />
        <ConnectionGate
          rememberedServerUrl={navidrome.rememberedServerUrl}
          rememberedUsername={navidrome.rememberedUsername}
          isConnecting={navidrome.isConnecting}
          error={navidrome.connectionError}
          onConnect={navidrome.connect}
        />
        <Toast
          message={toastVisible ? toastMessage : undefined}
          tone={navidrome.mutationError || player.error ? "error" : "info"}
          onDismiss={() => setToastVisible(false)}
        />
      </div>
    );
  }

  return (
    <div
      className="app"
      data-theme={theme.id}
      data-density={theme.density}
      data-frame={theme.frameStyle}
      style={themeToCssVars(theme)}
    >
      <div className="ambient-layer" aria-hidden="true" />
      <a className="skip-link" href="#main-content">
        Skip to archive content
      </a>
      <div className="app-shell">
        <Navigation
          view={view}
          serverInfo={navidrome.serverInfo}
          onNavigate={navigate}
          onDisconnect={disconnect}
        />
        <main className="content-panel" id="main-content" tabIndex={-1}>
          {renderView()}
        </main>
        <section className="playback-rail" aria-label="Player and queue">
          <PlayerDock
            currentTrack={currentTrack}
            player={player}
            coverUrl={coverUrl}
            queuePanelId={queuePanelId}
            queueOpen={queueOpen}
            isStarred={currentTrack ? navidrome.isTrackStarred(currentTrack) : false}
            onToggleStar={currentTrack ? () => toggleStar(currentTrack) : undefined}
            onToggleQueue={() => setQueueOpen((value) => !value)}
          />
          <QueuePanel
            queuePanelId={queuePanelId}
            state={queueState}
            open={queueOpen}
            onClose={() => setQueueOpen(false)}
            onSelectAndPlay={selectAndPlayFromQueue}
            dispatch={dispatch}
          />
        </section>
      </div>
      <Toast
        message={toastVisible ? toastMessage : undefined}
        tone={navidrome.mutationError || player.error ? "error" : "success"}
        onDismiss={() => setToastVisible(false)}
      />
    </div>
  );
}
