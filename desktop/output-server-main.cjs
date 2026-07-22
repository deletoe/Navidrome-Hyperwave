const path = require("node:path");
const { app, BrowserWindow, ipcMain, session } = require("electron");
const { RemotePlaybackServer } = require("./remote-server.cjs");
const { withDesktopCorsHeaders } = require("./security.cjs");
const {
  readConfiguration,
  streamUrl,
} = require("./output-server-config.cjs");
const {
  listOutputDevices,
  selectOutputDevice,
} = require("./coreaudio.cjs");
const config = readConfiguration(process.env);
const outputPort = Math.max(1, Number(process.env.MY_NAVIDROME_OUTPUT_PORT) || 17856);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
let rendererWindow;
let remoteServer;
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
  outputDevices: [],
  selectedOutputDeviceId: "",
  outputError: "",
};

function publicState() {
  return {
    connected: rendererReady && Boolean(config.serverUrl && config.auth),
    ...rendererState,
    serverUrl: config.serverUrl,
  };
}

function publishState() {
  remoteServer?.updatePlaybackState(publicState());
}

function sendToRenderer(command) {
  if (!rendererReady || !rendererWindow || rendererWindow.isDestroyed()) return false;
  rendererWindow.webContents.send("output-server:command", command);
  return true;
}

function handleRemoteCommand(command) {
  if (command.type === "refreshDevices") {
    void refreshCoreAudioDevices();
    return;
  }
  if (command.type === "selectDevice") {
    void selectCoreAudioDevice(command.deviceId);
    return;
  }
  if (command.type === "playQueue") {
    if (!config.serverUrl || !config.auth) return;
    sendToRenderer({
      ...command,
      tracks: command.tracks.map((track) => ({
        ...track,
        streamUrl: streamUrl(config, track.id),
      })),
    });
    return;
  }
  sendToRenderer(command);
}

async function refreshCoreAudioDevices() {
  try {
    const devices = await listOutputDevices();
    rendererState.outputDevices = devices.map(({ deviceId, label }) => ({ deviceId, label }));
    rendererState.selectedOutputDeviceId = devices.find((device) => device.selected)?.deviceId || "";
    rendererState.outputError = "";
  } catch (error) {
    rendererState.outputError = error instanceof Error ? error.message : "CoreAudio devices could not be listed";
  }
  publishState();
}

async function selectCoreAudioDevice(deviceId) {
  try {
    const devices = await selectOutputDevice(deviceId);
    rendererState.outputDevices = devices.map(({ deviceId, label }) => ({ deviceId, label }));
    rendererState.selectedOutputDeviceId = devices.find((device) => device.selected)?.deviceId || "";
    rendererState.outputError = "";
    sendToRenderer({ type: "selectDevice", deviceId: "" });
  } catch (error) {
    rendererState.outputError = error instanceof Error ? error.message : "The CoreAudio output could not be selected";
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
  if (!config.serverUrl || !config.auth) {
    console.log("Renderer status: NOT CONFIGURED");
    console.log("Restart with MY_NAVIDROME_URL plus either:");
    console.log("  MY_NAVIDROME_USERNAME and MY_NAVIDROME_PASSWORD");
    console.log("  MY_NAVIDROME_API_KEY");
  } else {
    console.log(`Renderer status: ready for ${config.serverUrl}`);
  }
  console.log(`Pairing code: ${info.pairingCode}`);
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
  remoteServer = new RemotePlaybackServer({
    distPath: path.join(__dirname, "..", "dist"),
    onCommand: handleRemoteCommand,
    port: outputPort,
  });
  const info = await remoteServer.start();
  await refreshCoreAudioDevices();
  publishState();
  printStartup(info);
});

app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", () => remoteServer?.stop());
