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
const fakeNavidrome = http.createServer((request, response) => {
  if (!request.url?.startsWith("/rest/stream.view")) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": "audio/wav",
    "Content-Length": wave.length,
    "Accept-Ranges": "bytes",
  });
  response.end(wave);
});
fakeNavidrome.listen(navidromePort, "127.0.0.1");
await once(fakeNavidrome, "listening");

const outputServer = spawn("./node_modules/.bin/electron", ["desktop/output-server-main.cjs"], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    MY_NAVIDROME_URL: `http://127.0.0.1:${navidromePort}`,
    MY_NAVIDROME_USERNAME: "smoke",
    MY_NAVIDROME_PASSWORD: "smoke-secret",
    MY_NAVIDROME_OUTPUT_PORT: String(outputPort),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let combinedOutput = "";
outputServer.stdout.on("data", (chunk) => { combinedOutput += chunk; });
outputServer.stderr.on("data", (chunk) => { combinedOutput += chunk; });

async function waitForPairingCode() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const match = combinedOutput.match(/Pairing code: (\d{6})/);
    if (match) return match[1];
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
  const pairingCode = await waitForPairingCode();
  const socket = new WebSocket(`ws://127.0.0.1:${outputPort}/remote`);
  await once(socket, "open");
  socket.send(JSON.stringify({ type: "pair", pin: pairingCode }));
  await waitForMessage(socket, (message) => message.type === "paired");
  socket.send(JSON.stringify({
    type: "command",
    command: {
      type: "playQueue",
      tracks: [{ id: "smoke-track", title: "Output server smoke", duration: 3 }],
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
    paired: true,
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
