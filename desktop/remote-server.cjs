const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { WebSocketServer, WebSocket } = require("ws");

const DEFAULT_PORT = 17856;
const MAX_TRACKS = 500;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function createPairingCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function localIpv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries || [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

function sanitizeString(value, maximum = 300) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function sanitizeTrack(value) {
  if (!value || typeof value !== "object") return undefined;
  const id = sanitizeString(value.id, 500);
  const title = sanitizeString(value.title, 500);
  if (!id || !title) return undefined;
  const track = { id, title };
  const stringFields = [
    "artist", "displayArtist", "album", "albumId", "artistId", "coverArt",
    "genre", "suffix", "contentType", "starred",
  ];
  for (const field of stringFields) {
    const next = sanitizeString(value[field], 1000);
    if (next) track[field] = next;
  }
  for (const field of ["duration", "track", "discNumber", "year"]) {
    if (Number.isFinite(value[field])) track[field] = Number(value[field]);
  }
  if (Array.isArray(value.artists)) {
    track.artists = value.artists.slice(0, 20).flatMap((artist) => {
      const name = sanitizeString(artist?.name, 300);
      if (!name) return [];
      const id = sanitizeString(artist?.id, 500);
      return [{ ...(id ? { id } : {}), name }];
    });
  }
  if (Array.isArray(value.genres)) {
    track.genres = value.genres.slice(0, 20).flatMap((genre) => {
      const name = sanitizeString(genre?.name, 300);
      return name ? [{ name }] : [];
    });
  }
  return track;
}

function sanitizeRemoteCommand(value) {
  if (!value || typeof value !== "object") return undefined;
  const type = sanitizeString(value.type, 40);
  if (type === "playQueue") {
    const tracks = Array.isArray(value.tracks)
      ? value.tracks.slice(0, MAX_TRACKS).map(sanitizeTrack).filter(Boolean)
      : [];
    if (tracks.length === 0) return undefined;
    return {
      type,
      tracks,
      startIndex: Math.min(Math.max(Number(value.startIndex) || 0, 0), tracks.length - 1),
      position: Math.max(0, Number(value.position) || 0),
      autoplay: value.autoplay !== false,
      serverUrl: sanitizeString(value.serverUrl, 2000),
    };
  }
  if (["play", "pause", "next", "previous", "toggleMute", "stop"].includes(type)) {
    return { type };
  }
  if (type === "refreshDevices") return { type };
  if (type === "selectDevice") {
    return { type, deviceId: sanitizeString(value.deviceId, 1000) };
  }
  if (type === "seek") return { type, position: Math.max(0, Number(value.position) || 0) };
  if (type === "volume") {
    return { type, volume: Math.min(Math.max(Number(value.volume) || 0, 0), 1) };
  }
  return undefined;
}

function safeStaticPath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split("?", 1)[0]);
  } catch {
    return undefined;
  }
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  const normalizedRoot = `${path.resolve(root)}${path.sep}`;
  return resolved.startsWith(normalizedRoot) ? resolved : undefined;
}

class RemotePlaybackServer {
  constructor({ distPath, onCommand, port = DEFAULT_PORT, hostname = os.hostname() }) {
    this.distPath = distPath;
    this.onCommand = onCommand;
    this.requestedPort = port;
    this.hostname = hostname;
    this.pairingCode = createPairingCode();
    this.clients = new Set();
    this.pairingFailures = new Map();
    this.playbackState = {
      connected: false,
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
  }

  async start() {
    if (this.httpServer) return this.getInfo();
    this.webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });
    this.webSocketServer.on("connection", (socket, request) => this.handleSocket(socket, request));
    this.httpServer = http.createServer((request, response) => this.handleHttp(request, response));
    this.httpServer.on("upgrade", (request, socket, head) => {
      let pathname = "";
      try { pathname = new URL(request.url || "/", "http://localhost").pathname; } catch { /* no-op */ }
      if (pathname !== "/remote") {
        socket.destroy();
        return;
      }
      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.webSocketServer.emit("connection", webSocket, request);
      });
    });
    await new Promise((resolve, reject) => {
      const onError = (error) => reject(error);
      this.httpServer.once("error", onError);
      this.httpServer.listen(this.requestedPort, "0.0.0.0", () => {
        this.httpServer.removeListener("error", onError);
        resolve();
      });
    });
    return this.getInfo();
  }

  stop() {
    for (const client of this.clients) client.close();
    this.clients.clear();
    this.webSocketServer?.close();
    this.httpServer?.close();
    this.webSocketServer = undefined;
    this.httpServer = undefined;
  }

  rotatePairingCode() {
    this.pairingCode = createPairingCode();
    for (const client of this.clients) {
      client.paired = false;
      this.send(client, { type: "pairingRequired" });
    }
    return this.pairingCode;
  }

  getInfo() {
    const address = this.httpServer?.address();
    const port = typeof address === "object" && address ? address.port : this.requestedPort;
    return {
      enabled: Boolean(this.httpServer?.listening),
      hostname: this.hostname,
      port,
      pairingCode: this.pairingCode,
      urls: localIpv4Addresses().map((address) => `http://${address}:${port}`),
      connectedControllers: [...this.clients].filter((client) => client.paired).length,
    };
  }

  updatePlaybackState(nextState) {
    this.playbackState = {
      connected: Boolean(nextState?.connected),
      title: sanitizeString(nextState?.title),
      artist: sanitizeString(nextState?.artist),
      trackId: sanitizeString(nextState?.trackId, 500),
      isPlaying: Boolean(nextState?.isPlaying),
      progress: Math.max(0, Number(nextState?.progress) || 0),
      duration: Math.max(0, Number(nextState?.duration) || 0),
      volume: Math.min(Math.max(Number(nextState?.volume) || 0, 0), 1),
      muted: Boolean(nextState?.muted),
      serverUrl: sanitizeString(nextState?.serverUrl, 2000),
      outputDevices: Array.isArray(nextState?.outputDevices)
        ? nextState.outputDevices.slice(0, 64).flatMap((device) => {
          const deviceId = sanitizeString(device?.deviceId, 1000);
          if (!deviceId) return [];
          return [{
            deviceId,
            label: sanitizeString(device?.label, 500) || "Audio output",
          }];
        })
        : this.playbackState.outputDevices,
      selectedOutputDeviceId: sanitizeString(
        nextState?.selectedOutputDeviceId,
        1000,
      ),
      outputError: sanitizeString(nextState?.outputError, 1000),
    };
    this.broadcast({ type: "state", state: this.playbackState });
  }

  handleSocket(socket, request) {
    socket.paired = false;
    const remoteAddress = request?.socket?.remoteAddress || "unknown";
    const recentFailure = this.pairingFailures.get(remoteAddress);
    if (recentFailure && recentFailure.resetAt > Date.now() && recentFailure.count >= 10) {
      this.send(socket, { type: "error", code: "PAIRING_RATE_LIMITED", message: "Too many pairing attempts; try again in one minute" });
      socket.close(1008, "Pairing rate limited");
      return;
    }
    this.clients.add(socket);
    this.send(socket, {
      type: "hello",
      renderer: { hostname: this.hostname, ready: this.playbackState.connected },
    });
    socket.on("message", (payload) => {
      let message;
      try { message = JSON.parse(payload.toString("utf8")); } catch { return; }
      if (!socket.paired) {
        if (message?.type !== "pair" || sanitizeString(message.pin, 20) !== this.pairingCode) {
          const previous = this.pairingFailures.get(remoteAddress);
          const resetAt = previous && previous.resetAt > Date.now()
            ? previous.resetAt
            : Date.now() + 60_000;
          this.pairingFailures.set(remoteAddress, {
            count: previous && previous.resetAt > Date.now() ? previous.count + 1 : 1,
            resetAt,
          });
          this.send(socket, { type: "error", code: "PAIRING_FAILED", message: "Pairing code is incorrect" });
          return;
        }
        socket.paired = true;
        this.pairingFailures.delete(remoteAddress);
        this.send(socket, { type: "paired", renderer: { hostname: this.hostname } });
        this.send(socket, { type: "state", state: this.playbackState });
        return;
      }
      if (message?.type !== "command") return;
      const command = sanitizeRemoteCommand(message.command);
      if (!command) {
        this.send(socket, { type: "error", code: "INVALID_COMMAND", message: "Playback command was rejected" });
        return;
      }
      if (!this.playbackState.connected) {
        this.send(socket, { type: "error", code: "RENDERER_NOT_READY", message: "Open and connect the Mac app first" });
        return;
      }
      if (
        command.type === "playQueue"
        && command.serverUrl
        && this.playbackState.serverUrl
        && command.serverUrl.replace(/\/+$/, "") !== this.playbackState.serverUrl.replace(/\/+$/, "")
      ) {
        this.send(socket, { type: "error", code: "SERVER_MISMATCH", message: "The Mac app is connected to a different Navidrome server" });
        return;
      }
      this.onCommand(command);
    });
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  handleHttp(request, response) {
    const method = request.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    let pathname;
    try { pathname = new URL(request.url || "/", "http://localhost").pathname; } catch { pathname = "/"; }
    if (pathname === "/api/remote/status") {
      const payload = JSON.stringify({
        hostname: this.hostname,
        port: this.getInfo().port,
        pairingRequired: true,
        rendererReady: this.playbackState.connected,
      });
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      response.end(method === "HEAD" ? undefined : payload);
      return;
    }
    let filename = safeStaticPath(this.distPath, pathname);
    if (!filename) {
      response.writeHead(400);
      response.end();
      return;
    }
    if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
      filename = path.join(this.distPath, "index.html");
    }
    const extension = path.extname(filename).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: http: https:; media-src blob: http: https:; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
      "Permissions-Policy": "speaker-selection=(self)",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    if (method === "HEAD") response.end();
    else fs.createReadStream(filename).pipe(response);
  }

  broadcast(message) {
    for (const client of this.clients) {
      if (client.paired && client.readyState === WebSocket.OPEN) this.send(client, message);
    }
  }

  send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}

module.exports = {
  DEFAULT_PORT,
  RemotePlaybackServer,
  createPairingCode,
  safeStaticPath,
  sanitizeRemoteCommand,
};
