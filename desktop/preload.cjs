const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_COMMANDS = new Set([
  "back",
  "navigate-home",
  "navigate-artists",
  "navigate-search",
  "navigate-favorites",
  "navigate-studio",
  "show-now-playing",
  "toggle-playback",
  "previous-track",
  "next-track",
  "toggle-queue",
  "audio-settings",
]);

contextBridge.exposeInMainWorld("myNavidromeDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || "0.1.0",
  onCommand(callback) {
    if (typeof callback !== "function") return () => undefined;
    const listener = (_event, command) => {
      if (ALLOWED_COMMANDS.has(command)) callback(command);
    };
    ipcRenderer.on("desktop:command", listener);
    return () => ipcRenderer.removeListener("desktop:command", listener);
  },
  updatePlayback(state) {
    if (!state || typeof state !== "object") return;
    ipcRenderer.send("desktop:playback-state", {
      title: typeof state.title === "string" ? state.title.slice(0, 300) : "",
      artist: typeof state.artist === "string" ? state.artist.slice(0, 300) : "",
      isPlaying: Boolean(state.isPlaying),
    });
  },
}));
