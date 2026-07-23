import { useEffect, useId, useLayoutEffect, useReducer, useRef, useState } from "react";

import { AudioVisualizer } from "./components/AudioVisualizer";
import { ArtistsView } from "./components/ArtistsView";
import { ConnectionGate } from "./components/ConnectionGate";
import { EntityDetail, type DetailKind } from "./components/EntityDetail";
import { FavoritesView } from "./components/FavoritesView";
import { HomeView } from "./components/HomeView";
import {
  Navigation,
  type AppView,
  type PrimaryView,
} from "./components/Navigation";
import { NowPlayingView } from "./components/NowPlayingView";
import { OutputSettingsDialog } from "./components/OutputSettingsDialog";
import { PlayerDock } from "./components/PlayerDock";
import { QueuePanel } from "./components/QueuePanel";
import { SearchView } from "./components/SearchView";
import { ThemeBurst } from "./components/ThemeBurst";
import { ThemeStudio, type ThemePreviewId } from "./components/ThemeStudio";
import { Toast } from "./components/Toast";
import { useAudioPlayer } from "./hooks/useAudioPlayer";
import { useAudioPreferences } from "./hooks/useAudioPreferences";
import { useCoverPalette } from "./hooks/useCoverPalette";
import { useNavidrome } from "./hooks/useNavidrome";
import { useOutputRouting } from "./hooks/useOutputRouting";
import { useTrackLyrics } from "./hooks/useTrackLyrics";
import { useVisualPreferences } from "./hooks/useVisualPreferences";
import type { DesktopCommand } from "./desktop";
import { loadBoundConnection } from "./lib/serverBootstrap";
import {
  getThemeById,
  resolveThemeForTrack,
  themeToCssVars,
} from "./lib/themeEngine";
import type { VisualizerMode } from "./lib/visualPreferences";
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

type NavigationTarget =
  | { view: PrimaryView }
  | { view: DetailKind; request: DetailRequest };

type NavigationEntry = NavigationTarget & { scrollPosition: number };

const AMBIENT_VISUALIZER_BUDGET = {
  maxFps: 30,
  maxPixelCount: 1_800_000,
  maxDevicePixelRatio: 1.25,
} as const;

const PLAYER_VISUALIZER_BUDGET = {
  maxFps: 45,
  maxPixelCount: 500_000,
  maxDevicePixelRatio: 1.5,
} as const;

function detailRequestsMatch(left: DetailRequest, right: DetailRequest): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "genre" && right.kind === "genre") return left.genre === right.genre;
  if (left.kind === "album" && right.kind === "album") return left.id === right.id;
  return left.kind === "artist" && right.kind === "artist" && left.id === right.id;
}

export default function App() {
  const navidrome = useNavidrome();
  const visualPreferences = useVisualPreferences();
  const audioPreferences = useAudioPreferences();
  const [queueState, dispatch] = useReducer(queueReducer, createInitialQueueState());
  const currentTrack = getCurrentTrack(queueState);
  const visualizerEnabled = visualPreferences.preferences.visualizer !== "off";
  const localPlayer = useAudioPlayer({
    client: navidrome.client,
    currentTrack,
    queueState,
    dispatch,
    visualizerEnabled,
    audioPreferences: audioPreferences.preferences,
  });
  const outputRouting = useOutputRouting({
    localPlayer,
    queueState,
    dispatch,
    serverUrl: navidrome.rememberedServerUrl,
    streamUrlForTrack: (id) => navidrome.client?.streamUrl(id) ?? "",
  });
  const player = outputRouting.player;
  const lyrics = useTrackLyrics(navidrome.client, currentTrack?.id);
  const [view, setView] = useState<AppView>("home");
  const [previewThemeId, setPreviewThemeId] = useState<ThemePreviewId>("auto");
  const [artistFilter, setArtistFilter] = useState("");
  const [detailRequest, setDetailRequest] = useState<DetailRequest>();
  const [detailHistory, setDetailHistory] = useState<NavigationEntry[]>([]);
  const [playerReturn, setPlayerReturn] = useState<NavigationEntry>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [audioSettingsRequest, setAudioSettingsRequest] = useState(0);
  const [outputSettingsOpen, setOutputSettingsOpen] = useState(false);
  const queuePanelId = useId();
  const [notice, setNotice] = useState<string>();
  const [toastVisible, setToastVisible] = useState(false);
  const pendingPlay = useRef(false);
  const bootstrapAttempted = useRef(false);
  const pendingScrollPosition = useRef<number | undefined>(0);
  const [playRequest, setPlayRequest] = useState(0);
  const automaticTheme = resolveThemeForTrack(currentTrack, visualPreferences.genreMap);
  const theme = previewThemeId === "auto"
    ? automaticTheme
    : getThemeById(previewThemeId);
  const coverPalette = useCoverPalette({
    coverArtId: currentTrack?.coverArt,
    enabled: visualPreferences.preferences.coverPalette,
    loadCoverArt: navidrome.client?.fetchCoverArt,
  });
  const activePalette = visualPreferences.preferences.coverPalette
    ? coverPalette.palette
    : undefined;
  const themeStyle = themeToCssVars(theme, {
    palette: activePalette,
    intensity: visualPreferences.preferences.intensity,
  });
  const committedThemeId = useRef(theme.id);
  const [themeSequence, setThemeSequence] = useState(0);
  const toastMessage = navidrome.mutationError || player.error || notice;

  useEffect(() => {
    if (
      bootstrapAttempted.current
      || navidrome.isConnected
      || typeof navigator === "undefined"
      || navigator.userAgent.includes("jsdom")
    ) return;
    bootstrapAttempted.current = true;
    void loadBoundConnection()
      .then((connection) => {
        if (connection) return navidrome.connect(connection);
        return undefined;
      })
      .catch(() => undefined);
  }, [navidrome.isConnected]);

  useEffect(() => {
    if (committedThemeId.current === theme.id) return;
    committedThemeId.current = theme.id;
    setThemeSequence((sequence) => sequence + 1);
  }, [theme.id]);

  useEffect(() => {
    setToastVisible(Boolean(toastMessage));
  }, [toastMessage]);

  useEffect(() => {
    if (!pendingPlay.current || !currentTrack) return;
    pendingPlay.current = false;
    void player.play();
  }, [currentTrack?.id, playRequest]);

  useEffect(() => {
    if (view !== "nowPlaying" || currentTrack) return;
    const previous = playerReturn;
    setPlayerReturn(undefined);
    pendingScrollPosition.current = previous?.scrollPosition ?? 0;
    if (previous && "request" in previous) {
      setDetailRequest(previous.request);
      setView(previous.view);
    } else {
      setDetailRequest(undefined);
      setView(previous?.view ?? "home");
    }
  }, [currentTrack, playerReturn, view]);

  useLayoutEffect(() => {
    if (!navidrome.isConnected) return;
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
  }, [detailRequest, navidrome.isConnected, view]);

  useLayoutEffect(() => {
    if (!navidrome.isConnected) return;
    const target = pendingScrollPosition.current;
    if (target === undefined) return;
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = target;
    if (document.scrollingElement) document.scrollingElement.scrollTop = target;

    const appliedPosition = Math.max(
      main?.scrollTop ?? 0,
      document.scrollingElement?.scrollTop ?? 0,
    );
    const contentIsGrowing =
      navidrome.detailLoading ||
      navidrome.artistTracksLoading ||
      (view === "artists" && navidrome.artistsLoading);
    if (target === 0 || appliedPosition >= target - 1 || !contentIsGrowing) {
      pendingScrollPosition.current = undefined;
    }
  }, [
    detailRequest,
    navidrome.activeAlbum?.song?.length,
    navidrome.activeArtistTracks.length,
    navidrome.artistTracksLoading,
    navidrome.artistsLoading,
    navidrome.detailLoading,
    navidrome.genreTracks.length,
    navidrome.isConnected,
    view,
  ]);

  function readScrollPosition(): number {
    const main = document.getElementById("main-content");
    return Math.max(main?.scrollTop ?? 0, document.scrollingElement?.scrollTop ?? 0);
  }

  function coverUrl(coverArt?: string, size?: number): string {
    return navidrome.mediaUrls?.cover(coverArt, size) ?? "";
  }

  function navigate(nextView: PrimaryView): void {
    navidrome.clearDetail();
    pendingScrollPosition.current = 0;
    setDetailRequest(undefined);
    setDetailHistory([]);
    setPlayerReturn(undefined);
    setView(nextView);
    if (nextView === "artists" && !navidrome.artistDirectory && !navidrome.artistsLoading) {
      void navidrome.loadArtists();
    }
  }

  function currentNavigationEntry(): NavigationTarget {
    if (
      view === "home" ||
      view === "artists" ||
      view === "search" ||
      view === "favorites" ||
      view === "studio"
    ) {
      return { view };
    }
    if (view === "nowPlaying") {
      if (!playerReturn) return { view: "home" };
      return "request" in playerReturn
        ? { view: playerReturn.view, request: playerReturn.request }
        : { view: playerReturn.view };
    }
    return detailRequest
      ? { view: detailRequest.kind, request: detailRequest }
      : { view: "home" };
  }

  function loadDetail(request: DetailRequest, refresh = false): void {
    if (request.kind === "album") {
      if (refresh) void navidrome.openAlbum(request.id, true);
      else void navidrome.openAlbum(request.id);
    } else if (request.kind === "artist") {
      if (refresh) void navidrome.openArtist(request.id, true);
      else void navidrome.openArtist(request.id);
    } else {
      void navidrome.openGenre(request.genre);
    }
  }

  function openDetail(request: DetailRequest): void {
    if (detailRequest && view === request.kind && detailRequestsMatch(detailRequest, request)) {
      return;
    }
    const previous: NavigationEntry = {
      ...currentNavigationEntry(),
      scrollPosition: readScrollPosition(),
    };
    setDetailHistory((entries) => [...entries, previous]);
    pendingScrollPosition.current = 0;
    setDetailRequest(request);
    setView(request.kind);
    loadDetail(request);
  }

  function openAlbum(album: Album): void {
    openDetail({ kind: "album", id: album.id });
  }

  function openArtist(artist: Artist): void {
    setQueueOpen(false);
    openDetail({ kind: "artist", id: artist.id });
  }

  function openGenre(genre: string): void {
    openDetail({ kind: "genre", genre });
  }

  function retryDetail(): void {
    if (!detailRequest) return;
    loadDetail(detailRequest, true);
  }

  function closeDetail(): void {
    const previous = detailHistory.at(-1);
    navidrome.clearDetail();
    setDetailHistory((entries) => entries.slice(0, -1));
    if (previous && "request" in previous) {
      pendingScrollPosition.current = previous.scrollPosition;
      setDetailRequest(previous.request);
      setView(previous.view);
      loadDetail(previous.request);
      return;
    }
    pendingScrollPosition.current = previous?.scrollPosition ?? 0;
    setDetailRequest(undefined);
    setView(previous?.view ?? "home");
  }

  function openNowPlaying(): void {
    if (view !== "nowPlaying") {
      setPlayerReturn({
        ...currentNavigationEntry(),
        scrollPosition: readScrollPosition(),
      });
    }
    pendingScrollPosition.current = 0;
    setQueueOpen(false);
    setView("nowPlaying");
  }

  function closeNowPlaying(): void {
    const previous = playerReturn;
    setPlayerReturn(undefined);
    pendingScrollPosition.current = previous?.scrollPosition ?? 0;
    if (previous && "request" in previous) {
      setDetailRequest(previous.request);
      setView(previous.view);
      return;
    }
    setDetailRequest(undefined);
    setView(previous?.view ?? "home");
  }

  function requestPlayback(track: Track, index: number, tracks: Track[]): void {
    if (visualizerEnabled) void player.visualizer.activate();
    if (audioPreferences.preferences.eqEnabled || audioPreferences.preferences.stereoBlend > 0) {
      void player.audioProcessing.activate();
    }
    pendingPlay.current = true;
    dispatch({ type: "playNow", tracks, startIndex: index });
    openNowPlaying();
    setPlayRequest((value) => value + 1);
    setNotice(`Playing ${track.title}`);
  }

  function playCollection(tracks: Track[]): void {
    if (tracks.length === 0) return;
    if (visualizerEnabled) void player.visualizer.activate();
    if (audioPreferences.preferences.eqEnabled || audioPreferences.preferences.stereoBlend > 0) {
      void player.audioProcessing.activate();
    }
    pendingPlay.current = true;
    dispatch({ type: "playNow", tracks });
    openNowPlaying();
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
    if (visualizerEnabled) void player.visualizer.activate();
    if (audioPreferences.preferences.eqEnabled || audioPreferences.preferences.stereoBlend > 0) {
      void player.audioProcessing.activate();
    }
    pendingPlay.current = true;
    dispatch({ type: "select", index });
    openNowPlaying();
    setPlayRequest((value) => value + 1);
    setNotice(`Playing ${track.title}`);
  }

  function toggleStar(track: Track): void {
    const currentlyStarred = navidrome.isTrackStarred(track);
    setNotice(`${currentlyStarred ? "Removed" : "Added"} ${track.title} ${currentlyStarred ? "from" : "to"} favorites`);
    void navidrome.toggleStar(track);
  }

  function disconnect(): void {
    outputRouting.disconnect();
    localPlayer.reset();
    dispatch({ type: "clear" });
    navidrome.disconnect();
    setView("home");
    setPreviewThemeId("auto");
    setArtistFilter("");
    pendingScrollPosition.current = 0;
    setDetailRequest(undefined);
    setDetailHistory([]);
    setPlayerReturn(undefined);
    setQueueOpen(false);
    setOutputSettingsOpen(false);
    setNotice(undefined);
  }

  function setVisualizerMode(mode: VisualizerMode): void {
    visualPreferences.setVisualizer(mode);
    if (mode !== "off") void player.visualizer.activate();
  }

  useEffect(() => {
    const desktop = window.myNavidromeDesktop;
    if (!desktop) return;
    return desktop.onCommand((command: DesktopCommand) => {
      if (command === "toggle-playback") {
        void player.toggle();
        return;
      }
      if (command === "previous-track") {
        player.previous();
        return;
      }
      if (command === "next-track") {
        player.next();
        return;
      }
      if (!navidrome.isConnected) return;
      if (command === "back") {
        if (view === "nowPlaying") closeNowPlaying();
        else if (view === "album" || view === "artist" || view === "genre") closeDetail();
        return;
      }
      if (command === "show-now-playing") {
        if (currentTrack) openNowPlaying();
        return;
      }
      if (command === "toggle-queue") {
        if (currentTrack) setQueueOpen((open) => !open);
        return;
      }
      if (command === "audio-settings") {
        if (currentTrack) setAudioSettingsRequest((request) => request + 1);
        return;
      }
      const destination = command.replace("navigate-", "") as PrimaryView;
      navigate(destination);
      if (destination === "search") {
        window.setTimeout(() => document.getElementById("archive-search")?.focus(), 0);
      }
    });
  }, [currentTrack, navidrome.isConnected, player, view]);

  useEffect(() => {
    window.myNavidromeDesktop?.updatePlayback({
      title: currentTrack?.title ?? "",
      artist: currentTrack?.displayArtist || currentTrack?.artist || "",
      isPlaying: player.isPlaying,
    });
    document.title = currentTrack
      ? `${currentTrack.title} — ${currentTrack.displayArtist || currentTrack.artist || "Unknown artist"}`
      : "My Navidrome";
  }, [currentTrack?.id, player.isPlaying]);

  function renderView() {
    if (view === "nowPlaying" && currentTrack) {
      return (
        <NowPlayingView
          track={currentTrack}
          player={player}
          lyrics={lyrics}
          coverUrl={coverUrl}
          isStarred={navidrome.isTrackStarred(currentTrack)}
          queueOpen={queueOpen}
          visualizerMode={visualPreferences.preferences.visualizer}
          onBack={closeNowPlaying}
          onToggleStar={() => toggleStar(currentTrack)}
          onOpenArtist={openArtist}
          onToggleQueue={() => setQueueOpen((value) => !value)}
          onOpenAudioSettings={() => setAudioSettingsRequest((value) => value + 1)}
          onOpenOutputSettings={() => setOutputSettingsOpen(true)}
          visualizer={(
            <AudioVisualizer
              className="now-playing-view__visualizer-canvas"
              {...PLAYER_VISUALIZER_BUDGET}
              readFrame={player.visualizer.readFrame}
              enabled={visualizerEnabled && player.visualizer.status === "ready"}
              playing={player.isPlaying}
              themeId={theme.id}
              intensity={visualPreferences.preferences.intensity / 50}
              primary={themeStyle["--theme-primary"]}
              secondary={themeStyle["--theme-secondary"]}
              mode={visualPreferences.preferences.visualizer}
            />
          )}
        />
      );
    }
    if (view === "artists") {
      return (
        <ArtistsView
          directory={navidrome.artistDirectory}
          loading={navidrome.artistsLoading}
          error={navidrome.artistsError}
          coverUrl={coverUrl}
          themeAsset={theme.scene.foregroundAsset}
          activeCoverUrl={coverUrl(currentTrack?.coverArt, 512)}
          filter={artistFilter}
          onFilterChange={setArtistFilter}
          onRetry={() => void navidrome.loadArtists()}
          onOpenArtist={openArtist}
        />
      );
    }
    if (view === "studio") {
      return (
        <ThemeStudio
          theme={theme}
          paletteStatus={coverPalette.status}
          palette={activePalette}
          currentCoverUrl={coverUrl(currentTrack?.coverArt, 960)}
          preferences={visualPreferences.preferences}
          genres={navidrome.home.genres.map(({ value }) => value)}
          visualizerSupported={player.visualizer.supported}
          visualizerStatus={player.visualizer.status}
          visualizerError={player.visualizer.error}
          updateIntensity={visualPreferences.setIntensity}
          setPaletteEnabled={visualPreferences.setCoverPalette}
          setVisualizerMode={setVisualizerMode}
          upsertGenreMapping={visualPreferences.upsertGenreMapping}
          removeGenreMapping={visualPreferences.removeGenreMapping}
          resetGenreMappings={visualPreferences.resetGenreMappings}
          previewThemeId={previewThemeId}
          setPreviewThemeId={setPreviewThemeId}
        />
      );
    }
    if (view === "home") {
      return (
        <HomeView
          home={navidrome.home}
          coverUrl={coverUrl}
          themeAsset={theme.scene.foregroundAsset}
          activeCoverUrl={coverUrl(currentTrack?.coverArt, 512)}
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
          themeAsset={theme.scene.foregroundAsset}
          activeCoverUrl={coverUrl(currentTrack?.coverArt, 512)}
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
          themeAsset={theme.scene.foregroundAsset}
          activeCoverUrl={coverUrl(currentTrack?.coverArt, 512)}
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
        artistTracks={navidrome.activeArtistTracks}
        artistTracksLoading={navidrome.artistTracksLoading}
        artistTracksWarning={navidrome.artistTracksWarning}
        genre={navidrome.activeGenre}
        genreTracks={navidrome.genreTracks}
        loading={navidrome.detailLoading}
        error={navidrome.detailError}
        starredIds={navidrome.starredIds}
        currentTrackId={currentTrack?.id}
        coverUrl={coverUrl}
        themeAsset={theme.scene.foregroundAsset}
        activeCoverUrl={coverUrl(currentTrack?.coverArt, 512)}
        onBack={closeDetail}
        onRetry={retryDetail}
        onOpenAlbum={openAlbum}
        onOpenArtist={openArtist}
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
        data-layout={theme.scene.layout}
        data-transition={theme.scene.transition}
        data-view={view}
        data-playing={player.isPlaying}
        data-has-track={Boolean(currentTrack)}
        style={themeStyle}
      >
        <div className="ambient-layer" aria-hidden="true" />
        <ConnectionGate
          rememberedServerUrl={navidrome.rememberedServerUrl}
          rememberedUsername={navidrome.rememberedUsername}
          isConnecting={navidrome.isConnecting}
          error={navidrome.connectionError}
          themeAsset={theme.scene.foregroundAsset}
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
      data-layout={theme.scene.layout}
      data-transition={theme.scene.transition}
      data-view={view}
      data-playing={player.isPlaying}
      data-has-track={Boolean(currentTrack)}
      data-visualizer-mode={visualPreferences.preferences.visualizer}
      data-visualizer-status={player.visualizer.status}
      style={themeStyle}
    >
      <ThemeBurst
        key={theme.id}
        theme={theme}
        active={Boolean(currentTrack)}
        sequence={themeSequence}
      />
      <div className="ambient-layer" aria-hidden="true" />
      <div className="visualizer-layer" aria-hidden="true">
        <AudioVisualizer
          className="ambient-visualizer"
          {...AMBIENT_VISUALIZER_BUDGET}
          readFrame={player.visualizer.readFrame}
          enabled={visualizerEnabled && player.visualizer.status === "ready"}
          playing={player.isPlaying}
          themeId={theme.id}
          intensity={visualPreferences.preferences.intensity / 50}
          primary={themeStyle["--theme-primary"]}
          secondary={themeStyle["--theme-secondary"]}
          mode={visualPreferences.preferences.visualizer}
        />
      </div>
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
            onToggleQueue={() => setQueueOpen((value) => !value)}
            visualizerMode={visualPreferences.preferences.visualizer}
            onSetVisualizerMode={setVisualizerMode}
            audioSettings={audioPreferences}
            pageOpen={view === "nowPlaying"}
            onOpenNowPlaying={openNowPlaying}
            audioSettingsRequest={audioSettingsRequest}
            outputRoute={outputRouting.route}
            onOpenOutputSettings={() => setOutputSettingsOpen(true)}
            visualizer={(
              <AudioVisualizer
                className="player-dock__visualizer-canvas"
                {...PLAYER_VISUALIZER_BUDGET}
                readFrame={player.visualizer.readFrame}
                enabled={visualizerEnabled && player.visualizer.status === "ready"}
                playing={player.isPlaying}
                themeId={theme.id}
                intensity={visualPreferences.preferences.intensity / 50}
                primary={themeStyle["--theme-primary"]}
                secondary={themeStyle["--theme-secondary"]}
                mode={visualPreferences.preferences.visualizer}
              />
            )}
          />
          <QueuePanel
            queuePanelId={queuePanelId}
            state={queueState}
            open={queueOpen}
            coverUrl={coverUrl}
            onClose={() => setQueueOpen(false)}
            onSelectAndPlay={selectAndPlayFromQueue}
            dispatch={dispatch}
          />
        </section>
      </div>
      {outputSettingsOpen ? (
        <OutputSettingsDialog
          routing={outputRouting}
          localOutput={localPlayer.output}
          onClose={() => setOutputSettingsOpen(false)}
        />
      ) : null}
      <Toast
        message={toastVisible ? toastMessage : undefined}
        tone={navidrome.mutationError || player.error ? "error" : "success"}
        onDismiss={() => setToastVisible(false)}
      />
    </div>
  );
}
