const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  session,
  shell,
} = require("electron");
const {
  isAllowedAppNavigation,
  isSafeExternalUrl,
  withDesktopCorsHeaders,
} = require("./security.cjs");

const devServerUrl = process.env.MY_NAVIDROME_DEV_SERVER_URL || "";
let mainWindow;
let playbackState = { title: "", artist: "", isPlaying: false };

function sendCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:command", command);
}

function buildApplicationMenu() {
  const playbackLabel = playbackState.isPlaying ? "Pause" : "Play";
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Audio Settings…", accelerator: "CmdOrCtrl+,", click: () => sendCommand("audio-settings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Navigate",
      submenu: [
        { label: "Back", accelerator: "CmdOrCtrl+[", click: () => sendCommand("back") },
        { type: "separator" },
        { label: "Home", accelerator: "CmdOrCtrl+1", click: () => sendCommand("navigate-home") },
        { label: "Artists", accelerator: "CmdOrCtrl+2", click: () => sendCommand("navigate-artists") },
        { label: "Search", accelerator: "CmdOrCtrl+F", click: () => sendCommand("navigate-search") },
        { label: "Favorites", accelerator: "CmdOrCtrl+3", click: () => sendCommand("navigate-favorites") },
        { label: "Theme Studio", accelerator: "CmdOrCtrl+4", click: () => sendCommand("navigate-studio") },
        { type: "separator" },
        { label: "Now Playing", accelerator: "CmdOrCtrl+L", click: () => sendCommand("show-now-playing") },
        { label: "Queue", accelerator: "CmdOrCtrl+U", click: () => sendCommand("toggle-queue") },
      ],
    },
    {
      label: "Playback",
      submenu: [
        { label: playbackLabel, accelerator: "CmdOrCtrl+Shift+P", click: () => sendCommand("toggle-playback") },
        { label: "Previous Track", accelerator: "CmdOrCtrl+Left", click: () => sendCommand("previous-track") },
        { label: "Next Track", accelerator: "CmdOrCtrl+Right", click: () => sendCommand("next-track") },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        ...(devServerUrl ? [{ role: "toggleDevTools" }, { type: "separator" }] : []),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureSession() {
  const activeSession = session.defaultSession;
  activeSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  activeSession.setDevicePermissionHandler(() => false);
  activeSession.webRequest.onHeadersReceived(
    { urls: ["http://*/*", "https://*/*"] },
    (details, callback) => callback({
      responseHeaders: withDesktopCorsHeaders(details.responseHeaders),
    }),
  );
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 640,
    show: false,
    backgroundColor: "#0b1020",
    title: "My Navidrome",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: "under-window",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: Boolean(devServerUrl),
      spellcheck: false,
    },
  });

  const packagedEntry = path.join(__dirname, "..", "dist", "index.html");
  const appUrl = devServerUrl || pathToFileURL(packagedEntry).href;

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (isAllowedAppNavigation(target, appUrl, devServerUrl)) return;
    event.preventDefault();
    if (isSafeExternalUrl(target)) void shell.openExternal(target);
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });

  if (devServerUrl) await mainWindow.loadURL(devServerUrl);
  else await mainWindow.loadFile(packagedEntry);
}

ipcMain.on("desktop:playback-state", (_event, nextState) => {
  playbackState = {
    title: typeof nextState?.title === "string" ? nextState.title : "",
    artist: typeof nextState?.artist === "string" ? nextState.artist : "",
    isPlaying: Boolean(nextState?.isPlaying),
  };
  const trackLabel = [playbackState.title, playbackState.artist].filter(Boolean).join(" — ");
  mainWindow?.setTitle(trackLabel ? `${trackLabel} · My Navidrome` : "My Navidrome");
  buildApplicationMenu();
});

app.whenReady().then(async () => {
  app.setName("My Navidrome");
  configureSession();
  buildApplicationMenu();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
