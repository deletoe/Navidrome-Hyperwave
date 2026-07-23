import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";

const navidromePort = 18765;
const outputPort = 18766;

function wavBuffer(durationSeconds = 3, sampleRate = 8_000) {
  const samples = durationSeconds * sampleRate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.08;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }
  return buffer;
}

const wave = wavBuffer();
let observedProxyAuthentication = false;
const fakeNavidrome = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${navidromePort}`);
  if (
    requestUrl.searchParams.get("u") !== "smoke-user"
    || requestUrl.searchParams.get("t")?.length !== 32
    || !requestUrl.searchParams.get("s")
  ) {
    response.writeHead(401);
    response.end();
    return;
  }
  observedProxyAuthentication = true;
  if (requestUrl.pathname === "/rest/ping.view") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      "subsonic-response": {
        status: "ok",
        version: "1.16.1",
        type: "navidrome",
        serverVersion: "smoke",
        openSubsonic: true,
      },
    }));
    return;
  }
  if (requestUrl.pathname !== "/rest/stream.view") {
    response.writeHead(404);
    response.end();
    return;
  }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || "");
  const start = range ? Math.min(Number(range[1]), wave.length - 1) : 0;
  const requestedEnd = range?.[2] ? Number(range[2]) : wave.length - 1;
  const end = Math.min(Math.max(requestedEnd, start), wave.length - 1);
  const body = wave.subarray(start, end + 1);
  response.writeHead(range ? 206 : 200, {
    "Content-Type": "audio/wav",
    "Content-Length": body.length,
    "Accept-Ranges": "bytes",
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${wave.length}` } : {}),
  });
  response.end(body);
});
fakeNavidrome.listen(navidromePort, "127.0.0.1");
await once(fakeNavidrome, "listening");

const outputServer = spawn(process.execPath, [
  "desktop/output-server-main.cjs",
  `--navidrome-login=http://smoke-user:smoke-password@127.0.0.1:${navidromePort}`,
], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    MY_NAVIDROME_OUTPUT_PORT: String(outputPort),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let combinedOutput = "";
outputServer.stdout.on("data", (chunk) => { combinedOutput += chunk; });
outputServer.stderr.on("data", (chunk) => { combinedOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (combinedOutput.includes("Renderer status: ready")) return;
    if (outputServer.exitCode !== null) throw new Error(`Output server exited early:\n${combinedOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for output server:\n${combinedOutput}`);
}

async function waitForMessage(socket, predicate, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener("message", handleMessage);
      reject(new Error("Timed out waiting for renderer state"));
    }, timeoutMs);
    function handleMessage(event) {
      const message = JSON.parse(String(event.data));
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.removeEventListener("message", handleMessage);
      resolve(message);
    }
    socket.addEventListener("message", handleMessage);
  });
}

try {
  await waitForServer();
  const bootstrapResponse = await fetch(`http://127.0.0.1:${outputPort}/api/bootstrap`);
  const bootstrap = await bootstrapResponse.json();
  if (bootstrap.configured !== true || bootstrap.connection?.auth?.type !== "apiKey") {
    throw new Error("Bound Navidrome bootstrap was not available");
  }
  if (JSON.stringify(bootstrap).includes("smoke-password")) {
    throw new Error("Bound Navidrome password escaped into the browser bootstrap");
  }
  const pingResponse = await fetch(
    `${bootstrap.connection.serverUrl}/rest/ping.view?apiKey=${bootstrap.connection.auth.apiKey}`,
  );
  if (!pingResponse.ok || !observedProxyAuthentication) {
    throw new Error("Bound Navidrome proxy authentication failed");
  }
  const sessionResponse = await fetch(`http://127.0.0.1:${outputPort}/api/audio/session`);
  const { token } = await sessionResponse.json();
  const socket = new WebSocket(`ws://127.0.0.1:${outputPort}/audio-control?token=${token}`);
  const helloMessage = waitForMessage(socket, (message) => message.type === "hello");
  await once(socket, "open");
  await helloMessage;
  socket.send(JSON.stringify({
    type: "command",
    command: {
      type: "playQueue",
      tracks: [{
        id: "smoke-track",
        title: "Output server smoke",
        duration: 3,
        streamUrl: `${bootstrap.connection.serverUrl}/rest/stream.view?id=smoke-track&apiKey=${bootstrap.connection.auth.apiKey}`,
      }],
      startIndex: 0,
      position: 0,
      autoplay: true,
      serverUrl: `http://127.0.0.1:${navidromePort}`,
    },
  }));
  const stateMessage = await waitForMessage(
    socket,
    (message) => message.type === "state"
      && message.state?.trackId === "smoke-track"
      && message.state?.isPlaying === true,
  );
  socket.send(JSON.stringify({ type: "command", command: { type: "refreshDevices" } }));
  const deviceMessage = await waitForMessage(
    socket,
    (message) => message.type === "state"
      && message.state?.outputDevices?.length > 0
      && message.state?.selectedOutputDeviceId,
  );
  const selectedDeviceId = deviceMessage.state.selectedOutputDeviceId;
  if (!selectedDeviceId) throw new Error("CoreAudio did not report a selected output device");
  socket.send(JSON.stringify({
    type: "command",
    command: { type: "selectDevice", deviceId: selectedDeviceId },
  }));
  await waitForMessage(
    socket,
    (message) => message.type === "state"
      && message.state?.selectedOutputDeviceId === selectedDeviceId
      && !message.state?.outputError,
  );
  console.log(JSON.stringify({
    automaticSession: true,
    boundLoginProxy: observedProxyAuthentication,
    playing: stateMessage.state.title,
    duration: stateMessage.state.duration,
    outputDevices: deviceMessage.state.outputDevices.map((device) => device.label),
    selectedOutputDeviceId: selectedDeviceId,
  }, null, 2));
  socket.close();
} finally {
  outputServer.kill("SIGTERM");
  fakeNavidrome.close();
}
