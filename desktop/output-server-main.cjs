const path = require("node:path");
const { PlaybackService } = require("./playback-service.cjs");
const { createServerAudioDeviceAdapter } = require("./server-audio-devices.cjs");
const { createPlaybackEngine } = require("./playback-engine.cjs");
const { parseBoundNavidrome } = require("./bound-navidrome.cjs");

const audioDevices = createServerAudioDeviceAdapter();
const boundNavidrome = parseBoundNavidrome();
const outputPort = Math.max(1, Number(process.env.MY_NAVIDROME_OUTPUT_PORT) || 5173);
const publicPort = Math.max(1, Number(process.env.MY_NAVIDROME_PUBLIC_PORT) || outputPort);
let playbackService;
let playbackEngine;
let rendererReady = false;
let shuttingDown = false;
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
    deviceBackend: `${audioDevices.backend}+avfoundation`,
    canSelectOutputDevice: audioDevices.canSelect,
  };
}

function publishState() {
  playbackService?.updatePlaybackState(publicState());
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
  if (command.type === "playQueue") rendererState.serverUrl = command.serverUrl;
  playbackEngine.handleCommand(command);
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
  } catch (error) {
    rendererState.outputError = error instanceof Error ? error.message : "The server audio output could not be selected";
  }
  publishState();
}

function printStartup(info) {
  const line = "─".repeat(66);
  console.log(`\n${line}`);
  console.log("My Navidrome standalone output server");
  console.log(line);
  console.log(`Renderer status: ready (${audioDevices.platform}/${audioDevices.backend}+avfoundation)`);
  console.log("Runtime: native background process (Electron is not used)");
  console.log(`Navidrome login: ${boundNavidrome ? "bound for trusted LAN clients" : "use the normal login page in the browser"}`);
  if (info.urls.length === 0) console.log(`Phone URL: http://127.0.0.1:${publicPort} (no LAN address found)`);
  else info.urls.forEach((url) => {
    const publicUrl = new URL(url);
    publicUrl.port = String(publicPort);
    console.log(`Phone URL: ${publicUrl.toString().replace(/\/$/, "")}`);
  });
  console.log("Press Control-C to stop the server.");
  console.log(`${line}\n`);
}

async function start() {
  playbackEngine = createPlaybackEngine({
    onState(state) {
      rendererState = { ...rendererState, ...state };
      publishState();
    },
  });
  await playbackEngine.start();
  rendererReady = true;
  playbackService = new PlaybackService({
    distPath: path.join(__dirname, "..", "dist"),
    onCommand: handlePlaybackCommand,
    port: outputPort,
    boundNavidrome,
  });
  const info = await playbackService.start();
  await refreshServerAudioDevices();
  publishState();
  printStartup(info);
}

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  rendererReady = false;
  playbackService?.stop();
  playbackEngine?.stop();
  process.exitCode = exitCode;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}

process.on("uncaughtException", (error) => {
  console.error(error);
  stop(1);
});

process.on("unhandledRejection", (error) => {
  console.error(error);
  stop(1);
});

start().catch((error) => {
  console.error(error);
  stop(1);
});
