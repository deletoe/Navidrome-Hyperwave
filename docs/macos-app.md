# My Navidrome for macOS

The macOS edition wraps the existing React player in a locked-down Electron shell. It keeps the
same Navidrome/OpenSubsonic client and adds a native application window, application menus, media
session integration, a local-network-friendly request boundary, and installable macOS artifacts.

## Development

```bash
npm install
npm run desktop:dev
```

`desktop:dev` starts Vite on `127.0.0.1:5173`, waits for it to become ready, and opens the Electron
window. Closing the desktop app also stops that Vite process.

## Local Apple Silicon build

```bash
npm run desktop:dir
```

The runnable application is written to `release/mac-arm64/My Navidrome.app`.

To produce the installer and archive:

```bash
npm run desktop:package
```

The generated DMG and ZIP are written to `release/`. These local artifacts are intentionally
unsigned. macOS may require Control-click → Open the first time they are launched on another Mac.

## Distribution boundary

A public release should add an Apple Developer ID Application certificate, hardened runtime,
entitlements, and Apple notarization. Do not enable hardened runtime without also testing audio,
network access, Media Session controls, and updates in the signed build.

## Desktop security model

- Renderer code runs with `nodeIntegration: false`, `contextIsolation: true`, and sandboxing.
- The preload bridge exposes only menu commands and sanitized playback metadata.
- New windows are denied; safe HTTP(S) links open in the default browser.
- Navigation stays inside the packaged application or the development origin.
- Camera, microphone, and device permission requests are denied.
- Remote response headers are adapted for Navidrome covers and ranged audio, removing the browser
  deployment's CORS dependency without exposing Node APIs to the renderer.
- Passwords and API keys still remain in memory and are not persisted to disk.
