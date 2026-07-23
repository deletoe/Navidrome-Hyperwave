const path = require("node:path");
const { app, BrowserWindow, ipcMain, session } = require("electron");
const { PlaybackService } = require("./playback-service.cjs");
const { withDesktopCorsHeaders } = require("./security.cjs");
const { createServerAudioDeviceAdapter } = require("./server-audio-devices.cjs");
const audioDevices = createServerAudioDeviceAdapter();
const outputPort = Math.max(1, Number(process.env.MY_NAVIDROME_OUTPUT_PORT) || 17856);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let rendererWindow;
let playbackService;
let rendererReady = false;
let rendererState = {
  title: "",
  artist: "",
  trackId: "",
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.86,
  muted: false,
  serverUrl: "",
  outputDevices: [],
  selectedOutputDeviceId: "",
  outputError: "",
};

function publicState() {
  return {
    connected: rendererReady,
    ...rendererState,
    platform: audioDevices.platform,
    deviceBackend: audioDevices.backend,
    canSelectOutputDevice: audioDevices.canSelect,
  };
}

function publishState() {
  playbackService?.updatePlaybackState(publicState());
}

function sendToRenderer(command) {
  if (!rendererReady || !rendererWindow || rendererWindow.isDestroyed()) return false;
  rendererWindow.webContents.send("output-server:command", command);
  return true;
}

function handlePlaybackCommand(command) {
  if (command.type === "refreshDevices") {
    void refreshServerAudioDevices();
    return;
  }
  if (command.type === "selectDevice") {
    void selectServerAudioDevice(command.deviceId);
    return;
  }
  if (command.type === "playQueue") {
    rendererState.serverUrl = command.serverUrl;
    publishState();
    sendToRenderer({
      ...command,
      tracks: command.tracks,
    });
    return;
  }
  sendToRenderer(command);
}

async function refreshServerAudioDevices() {
  try {
    const devices = await audioDevices.list();
    rendererState.outputDevices = devices.map(({ deviceId, label }) => ({ deviceId, label }));
    rendererState.selectedOutputDeviceId = devices.find((device) => device.selected)?.deviceId || "";
    rendererState.outputError = "";
  } catch (error) {
    rendererState.outputError = error instanceof Error ? error.message : "Server audio devices could not be listed";
  }
  publishState();
}

async function selectServerAudioDevice(deviceId) {
  try {
    const devices = await audioDevices.select(deviceId);
    rendererState.outputDevices = devices.map(({ deviceId, label }) => ({ deviceId, label }));
    rendererState.selectedOutputDeviceId = devices.find((device) => device.selected)?.deviceId || "";
    rendererState.outputError = "";
    sendToRenderer({ type: "selectDevice", deviceId: "" });
  } catch (error) {
    rendererState.outputError = error instanceof Error ? error.message : "The server audio output could not be selected";
  }
  publishState();
}

function configureSession() {
  const activeSession = session.defaultSession;
  const allowSpeakerSelection = (permission) => permission === "speaker-selection";
  activeSession.setPermissionCheckHandler((_contents, permission) => allowSpeakerSelection(permission));
  activeSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowSpeakerSelection(permission));
  });
  activeSession.setDevicePermissionHandler(() => false);
  activeSession.webRequest.onHeadersReceived(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => callback({
      responseHeaders: withDesktopCorsHeaders(details.responseHeaders),
    }),
  );
}

async function createRenderer() {
  rendererWindow = new BrowserWindow({
    width: 480,
    height: 320,
    show: false,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "output-server-preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
      devTools: process.env.MY_NAVIDROME_OUTPUT_DEBUG === "1",
    },
  });
  rendererWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  rendererWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  await rendererWindow.loadFile(path.join(__dirname, "output-renderer.html"));
}

function printStartup(info) {
  const line = "─".repeat(66);
  console.log(`\n${line}`);
  console.log("My Navidrome standalone output server");
  console.log(line);
  console.log(`Renderer status: ready (${audioDevices.platform}/${audioDevices.backend})`);
  console.log("Navidrome login: use the normal login page in the browser");
  if (info.urls.length === 0) console.log(`Phone URL: http://127.0.0.1:${info.port} (no LAN address found)`);
  else info.urls.forEach((url) => console.log(`Phone URL: ${url}`));
  console.log("Press Control-C to stop the server.");
  console.log(`${line}\n`);
}

ipcMain.on("output-server:ready", () => {
  rendererReady = true;
  publishState();
  sendToRenderer({ type: "refreshDevices" });
});

ipcMain.on("output-server:state", (_event, state) => {
  rendererState = {
    ...rendererState,
    title: typeof state?.title === "string" ? state.title.slice(0, 300) : "",
    artist: typeof state?.artist === "string" ? state.artist.slice(0, 300) : "",
    trackId: typeof state?.trackId === "string" ? state.trackId.slice(0, 500) : "",
    isPlaying: Boolean(state?.isPlaying),
    progress: Math.max(0, Number(state?.progress) || 0),
    duration: Math.max(0, Number(state?.duration) || 0),
    volume: Math.min(Math.max(Number(state?.volume) || 0, 0), 1),
    muted: Boolean(state?.muted),
  };
  publishState();
});

app.whenReady().then(async () => {
  app.setName("My Navidrome Output Server");
  configureSession();
  await createRenderer();
  playbackService = new PlaybackService({
    distPath: path.join(__dirname, "..", "dist"),
    onCommand: handlePlaybackCommand,
    port: outputPort,
  });
  const info = await playbackService.start();
  await refreshServerAudioDevices();
  publishState();
  printStartup(info);
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", () => playbackService?.stop());
