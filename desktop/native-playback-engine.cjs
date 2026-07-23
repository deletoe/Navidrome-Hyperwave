const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { ensureNativePlaybackHelper } = require("./native-playback.cjs");

class NativePlaybackEngine {
  constructor({ onState }) {
    this.onState = onState;
    this.queue = [];
    this.currentIndex = -1;
    this.playbackIntent = false;
    this.state = {
      title: "",
      artist: "",
      trackId: "",
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 0.86,
      muted: false,
      outputError: "",
    };
  }

  async start() {
    if (this.process) return;
    const executable = await ensureNativePlaybackHelper();
    this.process = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.lines.on("line", (line) => this.handleHelperLine(line));
    this.process.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) this.publish({ outputError: message.slice(0, 1000) });
    });
    this.process.on("exit", (code, signal) => {
      this.process = undefined;
      if (this.stopping) return;
      this.publish({
        isPlaying: false,
        outputError: `Native audio renderer exited (${signal || code || "unknown"})`,
      });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Native audio renderer did not become ready")), 15_000);
      const handleReady = (message) => {
        if (message.type !== "ready") return;
        clearTimeout(timer);
        this.onHelperReady = undefined;
        resolve();
      };
      this.onHelperReady = handleReady;
      this.process.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  stop() {
    this.stopping = true;
    this.send({ type: "shutdown" });
    this.process?.kill("SIGTERM");
    this.lines?.close();
    this.process = undefined;
  }

  handleCommand(command) {
    if (command.type === "playQueue") {
      this.queue = command.tracks;
      this.currentIndex = command.startIndex;
      this.playbackIntent = command.autoplay !== false;
      this.loadCurrent(command.position, this.playbackIntent);
    } else if (command.type === "play") {
      this.playbackIntent = true;
      this.send({ type: "play" });
    } else if (command.type === "pause") {
      this.playbackIntent = false;
      this.send({ type: "pause" });
    } else if (command.type === "next") {
      this.next();
    } else if (command.type === "previous") {
      if (this.state.progress > 3) this.send({ type: "seek", position: 0 });
      else this.previous();
    } else if (command.type === "seek") {
      this.send({ type: "seek", position: command.position });
    } else if (command.type === "volume") {
      this.send({ type: "volume", volume: command.volume });
    } else if (command.type === "toggleMute") {
      this.send({ type: "mute", muted: !this.state.muted });
    } else if (command.type === "stop") {
      this.playbackIntent = false;
      this.queue = [];
      this.currentIndex = -1;
      this.send({ type: "stop" });
      this.publish({
        title: "",
        artist: "",
        trackId: "",
        isPlaying: false,
        progress: 0,
        duration: 0,
      });
    }
  }

  handleHelperLine(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    this.onHelperReady?.(message);
    if (message.type === "ended") {
      if (this.playbackIntent) this.next();
      else this.publish({ isPlaying: false });
      return;
    }
    if (message.type !== "state") return;
    this.publish({
      isPlaying: Boolean(message.isPlaying),
      progress: Math.max(0, Number(message.progress) || 0),
      duration: Math.max(0, Number(message.duration) || this.currentTrack()?.duration || 0),
      volume: Math.min(Math.max(Number(message.volume) || 0, 0), 1),
      muted: Boolean(message.muted),
      outputError: typeof message.error === "string" ? message.error : "",
    });
  }

  currentTrack() {
    return this.queue[this.currentIndex];
  }

  loadCurrent(position = 0, autoplay = this.playbackIntent) {
    const track = this.currentTrack();
    if (!track) {
      this.send({ type: "stop" });
      return;
    }
    this.publish({
      title: track.title || "",
      artist: track.displayArtist || track.artist || "",
      trackId: track.id || "",
      progress: Math.max(0, Number(position) || 0),
      duration: Math.max(0, Number(track.duration) || 0),
      outputError: "",
    });
    this.send({
      type: "load",
      url: track.streamUrl,
      position: Math.max(0, Number(position) || 0),
      autoplay,
      volume: this.state.volume,
      muted: this.state.muted,
    });
  }

  next() {
    if (this.queue.length === 0) return;
    this.currentIndex = this.currentIndex >= this.queue.length - 1 ? 0 : this.currentIndex + 1;
    this.loadCurrent(0, this.playbackIntent);
  }

  previous() {
    if (this.queue.length === 0) return;
    this.currentIndex = this.currentIndex <= 0 ? this.queue.length - 1 : this.currentIndex - 1;
    this.loadCurrent(0, this.playbackIntent);
  }

  send(command) {
    if (!this.process?.stdin.writable) return;
    this.process.stdin.write(`${JSON.stringify(command)}\n`);
  }

  publish(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
}

module.exports = { NativePlaybackEngine };
