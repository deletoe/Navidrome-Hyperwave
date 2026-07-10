# My Navidrome 5.6 Verification

Verified locally on 2026-07-10 (Asia/Shanghai). No password, API key, tokenized media URL, or complete auth query is recorded in this file.

## Automated checks

Fresh final command:

```text
npm run test:run && npm run typecheck && npm run build && npm audit --audit-level=high
```

Result:

- Vitest 4.1.10: 8 test files passed, 102 tests passed, 0 failed.
- TypeScript project build: exit 0, 0 diagnostics.
- Vite 6.4.3 production build: exit 0, 53 modules transformed.
- Production assets: CSS 46.65 kB (9.44 kB gzip), JS 262.10 kB (80.83 kB gzip).
- Dependency audit: 0 vulnerabilities.

The test suite includes auth/response parsing, stable media URLs, queue boundaries and per-occurrence identity, seven visual personalities, Chinese library genre aliases, audio cleanup/scrobble/Media Session lifecycle, session concurrency, targeted section retries, stale detail invalidation, favorite rollback and refresh races, current-player favorite controls, accessible components, queue-to-player wiring, detail history, search stale-state handling, and modal focus coordination.

## Local server

- Address: `http://127.0.0.1:5173/`
- Listener: Node PID `60325`, bound only to `127.0.0.1:5173`.
- Vite uses `strictPort: true`; it fails instead of silently changing the requested port.
- The user-authored credential document is denied by the dev server: requesting `/docs/requirements.md` returns HTTP 403.
- The running process was started with forced dependency pre-optimization after the first cold browser load exposed a transient Vite optimizer split. After restart, the initial complete acceptance flow contained no console errors or warnings. The final post-fix browser pass showed no Vite error overlay or uncaught UI failure; the expected synthetic media-gesture rejection was caught and presented by the application.

## Live Navidrome/API checks

The authorized test server reported:

- Navidrome `0.62.0 (1b46b977)`.
- OpenSubsonic supported.
- Direct browser-origin requests from `http://127.0.0.1:5173` succeeded.
- Home loaded 20 newest albums, 20 random albums, and 50 genre channels; the currently empty frequent section rendered its designed empty state without breaking other sections.
- At the desktop viewport, 15 lazy images in the visible area had non-zero natural width; additional covers remained correctly deferred below the fold.
- Search for `Joan Jett` rendered 86 grouped results: 60 songs, 6 albums, and 20 artists.
- Artist detail opened 2 albums. Its nested album detail rendered 17 tracks, each with Play, Add to queue, and Star controls. Back restored and reloaded the artist detail.

Range proof against the real `Da Funk` (`电子音乐`) track stream:

```text
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/11521265
Content-Type: audio/mp4
1024 bytes received
```

The automated browser environment did not grant audible playback after its synthetic click. The application caught and presented that media-gesture error; the current track, authenticated audio source, queue, and real Range response were all verified. Audible output therefore remains a human-browser gesture check rather than an automation claim.

## Desktop browser acceptance

Viewport `1440×900`:

- Page grid resolved to `248px 852px 340px` for navigation, content, and playback/queue.
- Document width exactly matched the viewport; no horizontal overflow.
- Main content and queue used independent vertical scrolling.
- Real cover art, album metadata, server status, search, artist detail, album detail, queue controls, and reversible favorite sync were visible and operable.
- Queue contained the full active collection and identified exactly one current item.
- Shuffle changed from off to on; repeat changed from off to all.
- A live favorite write changed Star to Unstar and was immediately reversed to restore test-account state.

The final post-fix pass also checked `1280px` width: the grid resolved to `248px 692px 340px`, document scroll width equaled 1280px, and the four-column current-track row (artwork, metadata, Star, Expand) had no internal overflow. `Da Funk` exposed the new player-level Star control, changed it to Unstar with `aria-pressed=true`, and reversed the write to restore server state.

## Visual personality acceptance

Real server metadata drove three materially different personalities:

- `Bad Reputation`, genre `摇滚` → `rock`; Impact display headings, hard/cut stage geometry, warm stage background.
- `Da Funk`, genre `电子音乐` → `cyber`; mono display font, 4px radius, neon grid language.
- `A Cry in the Mist`, genre `电子游戏` → `pixel`; mono display font, 0px radius, hard frame and scanline/pixel language.

The live test initially revealed that Chinese normalized genre values fell through to Prism. Six failing fixtures were added for `摇滚`, `电子音乐`, `电子游戏`, `国语流行`, `原声音乐`, and `爵士乐`; the classifier was extended and all six then passed. The browser was rechecked after hot reload and showed `rock`, `cyber`, and `pixel` on the real tracks.

## Mobile browser acceptance

Viewport `390×844`:

- Document width and scroll width both equaled 390px; no horizontal overflow.
- Primary navigation was fixed at the bottom with 64px height.
- The 78px mini-player was fixed immediately above navigation.
- Main content reserved 166px bottom padding, preventing control overlap.
- The smallest sampled visible button was 44px high.
- Now Playing opened as one modal. Opening Queue closed Now Playing first, left exactly one modal, and linked `aria-controls` to the real queue panel ID. Escape closed the queue only.
- Now Playing and Queue both moved focus to their Close control, wrapped Tab/Shift+Tab within the active modal, and restored focus to `Open now playing` after the handoff path closed.

Viewport `360×800`:

- Document scroll width exactly equaled 360px; no horizontal overflow.
- Bottom navigation and mini-player remained fixed and adjacent.
- Content retained 166px bottom padding.
- The smallest sampled visible button remained 44px high.
- No modal remained after Escape.

The viewport override was reset after responsive verification. The local browser tab remains at `http://127.0.0.1:5173/` with the live session connected.
