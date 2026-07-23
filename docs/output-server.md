# Built-in server audio output

The Web service can render audio either on the browser device or on the machine running the
service. Server audio is a platform-neutral backend built into the same application, not a
separately paired service or second Navidrome account.

## Start

For local development with hot reload:

```bash
npm run dev
```

This keeps the browser URL at `http://127.0.0.1:5173` and starts the native audio engine on an
internal development port. Vite proxies the same-origin audio session and WebSocket routes, so
client and server output work from the same page. Use `npm run dev:lan` to expose the development
page to the trusted LAN.

For the built production bundle:

```bash
npm install
npm run output-server
```

The terminal prints one or more URLs, normally `http://<server-lan-ip>:5173`. Open one of those
URLs on a phone or another computer and use the normal Navidrome connection page. The output
server does not add another connection or authentication form.

`MY_NAVIDROME_OUTPUT_PORT` changes the default port `5173`.

## Playback flow

1. The browser logs into Navidrome through the existing connection page.
2. The browser automatically discovers the audio renderer exposed by the same Web service.
3. **Audio output** presents **This device** and **Server audio** as peer destinations.
4. When server audio is selected, the browser sends bounded queue metadata and per-track
   authenticated stream URLs over a short-lived, same-host controller session.
5. The server fetches those streams and renders them on its selected audio device.

There is no second login. With password authentication, Subsonic stream URLs contain a fresh
salt and token rather than the raw password. API-key stream URLs necessarily contain the API key,
so the output service should run only on a trusted host and trusted LAN.

## Platform adapter contract

The server is a normal Node process and does not start Electron. Playback and device selection
have separate adapter boundaries:

- `desktop/playback-engine.cjs` chooses the lightweight decoder/player;
- `desktop/server-audio-devices.cjs` enumerates and selects output devices.

The current macOS playback engine is a small persistent AVFoundation sidecar. It receives bounded
JSON-line commands from Node and reports playback state without owning an application window or
Dock process. The helper is compiled into `~/Library/Caches/MyNavidromeOutputServer` on first use.

Device selection currently provides:

- macOS currently uses the implemented CoreAudio adapter;
- Linux exposes the system default output and reserves a PipeWire/PulseAudio adapter slot;
- Windows exposes the system default output and reserves a WASAPI adapter slot.

Linux and Windows playback engines remain adapter slots. Adding GStreamer/PipeWire or
Media Foundation/WASAPI implementations does not require changing the browser protocol, output
routing state, queue model, or settings page.

The macOS device adapter compiles its Swift helper into
`~/Library/Caches/MyNavidromeOutputServer` on first use. It lists output-capable devices and can
change the current CoreAudio output without requesting microphone access.

## Controller security

- The browser obtains a random, short-lived, one-use controller token automatically.
- The token endpoint accepts only same-host browser origins.
- WebSocket connections without a valid token are rejected.
- Commands, queue sizes, metadata, device IDs, and stream URLs are bounded and validated.
- Controller tokens and authenticated stream URLs are never broadcast in renderer state.
- The service is intended for a trusted LAN. Do not expose port `5173` to the public internet.

## Verification

```bash
npm run output-server:smoke
```

The smoke test starts a temporary Navidrome-like WAV endpoint, obtains an automatic controller
session, verifies real server playback, and checks the active platform audio-device adapter.
