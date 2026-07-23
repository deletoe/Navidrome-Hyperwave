const bridge = window.outputServer;
const audio = document.getElementById("renderer-audio");
let queue = [];
let currentIndex = -1;
let playbackIntent = false;
let selectedOutputDeviceId = "";
let outputError = "";
let lastPublishedSecond = -1;

function currentTrack() {
  return queue[currentIndex];
}

function state() {
  const track = currentTrack();
  return {
    title: track?.title || "",
    artist: track?.displayArtist || track?.artist || "",
    trackId: track?.id || "",
    isPlaying: !audio.paused && !audio.ended,
    progress: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : Number(track?.duration) || 0,
    volume: audio.volume,
    muted: audio.muted,
    selectedOutputDeviceId,
    outputError,
  };
}

function publishState() {
  bridge.publishState(state());
}

async function publishDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    bridge.publishDevices(devices
      .filter((device) => device.kind === "audiooutput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Server audio output ${index + 1}`,
      })));
  } catch (error) {
    outputError = error instanceof Error ? error.message : "Audio outputs could not be enumerated";
    publishState();
  }
}

async function selectDevice(deviceId) {
  try {
    if (typeof audio.setSinkId !== "function") throw new Error("This renderer cannot select a CoreAudio output device");
    await audio.setSinkId(deviceId);
    selectedOutputDeviceId = deviceId;
    outputError = "";
    publishState();
    await publishDevices();
  } catch (error) {
    outputError = error instanceof Error ? error.message : "The server output device could not be selected";
    publishState();
  }
}

async function loadCurrent(position = 0, autoplay = playbackIntent) {
  const track = currentTrack();
  if (!track?.streamUrl) {
    audio.removeAttribute("src");
    audio.load();
    playbackIntent = false;
    publishState();
    return;
  }
  audio.src = track.streamUrl;
  audio.load();
  const seekWhenReady = () => {
    if (position > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(position, audio.duration);
  };
  audio.addEventListener("loadedmetadata", seekWhenReady, { once: true });
  playbackIntent = autoplay;
  if (autoplay) {
    try {
      await audio.play();
      outputError = "";
    } catch (error) {
      playbackIntent = false;
      outputError = error instanceof Error ? error.message : "Server playback could not start";
    }
  }
  publishState();
}

function next() {
  if (queue.length === 0) return;
  currentIndex = currentIndex >= queue.length - 1 ? 0 : currentIndex + 1;
  void loadCurrent(0, playbackIntent);
}

function previous() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    publishState();
    return;
  }
  if (queue.length === 0) return;
  currentIndex = currentIndex <= 0 ? queue.length - 1 : currentIndex - 1;
  void loadCurrent(0, playbackIntent);
}

bridge.onCommand((command) => {
  if (!command || typeof command !== "object") return;
  if (command.type === "playQueue") {
    queue = Array.isArray(command.tracks) ? command.tracks : [];
    currentIndex = Math.min(Math.max(Number(command.startIndex) || 0, 0), Math.max(queue.length - 1, 0));
    void loadCurrent(Math.max(0, Number(command.position) || 0), command.autoplay !== false);
  } else if (command.type === "play") {
    playbackIntent = true;
    void audio.play().then(publishState).catch((error) => {
      outputError = error instanceof Error ? error.message : "Server playback could not resume";
      publishState();
    });
  } else if (command.type === "pause") {
    playbackIntent = false;
    audio.pause();
    publishState();
  } else if (command.type === "next") {
    next();
  } else if (command.type === "previous") {
    previous();
  } else if (command.type === "seek") {
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number(currentTrack()?.duration) || 0;
    audio.currentTime = Math.min(Math.max(Number(command.position) || 0, 0), duration);
    publishState();
  } else if (command.type === "volume") {
    audio.volume = Math.min(Math.max(Number(command.volume) || 0, 0), 1);
    if (audio.volume > 0) audio.muted = false;
    publishState();
  } else if (command.type === "toggleMute") {
    audio.muted = !audio.muted;
    publishState();
  } else if (command.type === "stop") {
    playbackIntent = false;
    audio.pause();
    queue = [];
    currentIndex = -1;
    audio.removeAttribute("src");
    audio.load();
    publishState();
  } else if (command.type === "refreshDevices") {
    void publishDevices();
  } else if (command.type === "selectDevice") {
    void selectDevice(typeof command.deviceId === "string" ? command.deviceId : "");
  }
});

audio.addEventListener("play", publishState);
audio.addEventListener("pause", publishState);
audio.addEventListener("loadedmetadata", publishState);
audio.addEventListener("volumechange", publishState);
audio.addEventListener("ended", () => {
  if (playbackIntent) next();
  else publishState();
});
audio.addEventListener("timeupdate", () => {
  const second = Math.floor(audio.currentTime);
  if (second === lastPublishedSecond) return;
  lastPublishedSecond = second;
  publishState();
});
audio.addEventListener("error", () => {
  const messages = {
    1: "Server playback was aborted",
    2: "The Navidrome stream was interrupted",
    3: "The server renderer could not decode this track",
    4: "The Navidrome stream URL was rejected",
  };
  outputError = messages[audio.error?.code] || "The server renderer could not play this track";
  playbackIntent = false;
  publishState();
});
navigator.mediaDevices?.addEventListener("devicechange", () => void publishDevices());

bridge.ready();
void publishDevices();
publishState();
