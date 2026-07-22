# Standalone Mac output server

The output server is independent from `My Navidrome.app`. It runs from the project checkout,
serves the web player to phones on the LAN, owns its own Navidrome connection, and renders audio
through a selected CoreAudio device on the Mac.

## Start

```bash
npm install
npm run output-server
```

When run in a terminal, the launcher asks for the Navidrome URL, username, and password. Password
input is hidden and remains only in the output-server process memory. The terminal then prints:

- one or more phone URLs, normally `http://<mac-lan-ip>:17856`;
- a six-digit pairing code;
- whether the server-side Navidrome renderer is configured.

For an unattended service, provide environment variables through the process manager:

```bash
MY_NAVIDROME_URL=https://music.example.com \
MY_NAVIDROME_USERNAME=listener \
MY_NAVIDROME_PASSWORD='...' \
npm run output-server
```

`MY_NAVIDROME_API_KEY` can replace the username and password. `MY_NAVIDROME_OUTPUT_PORT` changes
the default port `17856`.

## Phone flow

1. Start the output server on the Mac.
2. Open the printed phone URL on Android.
3. Connect the web player to Navidrome normally.
4. Open **Audio output** from the player bar or Now Playing page.
5. Enter the output server's address and six-digit pairing code.
6. Select **Mac playback service**, then choose a Mac audio device.

The phone keeps its own browser queue and sends only bounded track metadata, IDs, and playback
commands. The output server generates authenticated Navidrome stream URLs using its own in-memory
credentials. Passwords and API keys are not sent through the LAN control protocol.

## Audio devices

The service compiles a small Swift CoreAudio helper into
`~/Library/Caches/MyNavidromeOutputServer` on first launch. It lists real output-capable devices and
changes the Mac default output when the phone selects one. This avoids microphone permission and
works for built-in speakers, headphones, displays, and compatible USB audio devices.

## Security boundary

- Pairing is required before any playback command is accepted.
- The pairing code rotates whenever the server restarts.
- Commands and queue payloads are size-bounded and validated.
- The server rejects playback when the phone and renderer point at different Navidrome servers.
- Remote clients never receive the server's Navidrome password, API key, or generated stream URLs.
- The service is intended for a trusted home LAN. The control endpoint is plain HTTP/WebSocket; do
  not expose port `17856` to the public internet.

## Verification

```bash
npm run output-server:smoke
```

The smoke test starts a temporary Navidrome-like WAV endpoint, starts the standalone renderer,
pairs over WebSocket, verifies real playback state, and verifies that CoreAudio devices are listed.
