# My Navidrome 5.6 Verification

Verified locally on 2026-07-11 (Asia/Shanghai). No password, API key, tokenized media URL, or complete authentication query is recorded in this file.

## Final automated gate

Fresh final command:

```text
npm run test:run && npm run typecheck && npm run build && npm audit --audit-level=high
```

Result:

- Vitest 4.1.10: 9 test files passed, 114 tests passed, 0 failed.
- TypeScript project build: exit 0, 0 diagnostics.
- Vite 6.4.3 production build: exit 0, 54 modules transformed.
- Production bundle: CSS 64.35 kB (11.73 kB gzip), JS 265.01 kB (81.64 kB gzip).
- Dependency audit: 0 vulnerabilities.

The suite now covers authentication and response parsing, stable media URLs, queue identity and boundaries, audio cleanup/scrobble/Media Session lifecycle, session concurrency, targeted retries, stale-detail invalidation, favorite rollback, modal focus coordination, seven unique scene contracts, generated-art CSS variables, inert transition rendering, committed-only theme sequencing, and real Cyber-to-Rock preservation of the App, shell, player, audio and focused DOM nodes.

## Local server and credential boundary

- Address: `http://127.0.0.1:5173/`
- Listener: Node PID `60325`, bound only to `127.0.0.1:5173`.
- Vite uses `strictPort: true`; it fails instead of silently selecting another port.
- The user-authored credential document remains outside the build and is denied by the dev server: `/docs/requirements.md` returns HTTP 403.
- Theme art is publicly served as intended; `/assets/themes/prism-ambient.webp` returns HTTP 200 with the expected 47,434-byte body.
- The final in-app browser log read returned no warning or error entries from the application.

## Original visual media

Seven project-owned ambient images were generated with the built-in image generator and normalized for delivery:

| Asset | Format and dimensions | Bytes |
| --- | --- | ---: |
| Prism | WebP, 1254×1254 | 47,434 |
| Cyber | WebP, 1024×1024 | 67,604 |
| Bloom | WebP, 1254×1254 | 33,670 |
| Pixel | indexed PNG, 256×256, 32 colors | 1,899 |
| Rock | WebP, 1254×1254 | 154,122 |
| Cinematic | WebP, 1254×1254 | 34,562 |
| Lounge | WebP, 1254×1254 | 41,972 |

Total delivery size is 381,263 bytes. Pillow inspection found zero EXIF/XMP/ICC payloads. A source-art contact sheet and a 3×3 Cyber/Pixel tiling sheet were visually checked for text, logos, people, recognizable intellectual property, crop failures, center obstruction and edge failures. A tiny generated pseudo-wordmark found on the first Rock drum head was removed with a localized built-in image edit and the full instruction was added to provenance. Exact prompts and post-processing are recorded in `public/assets/themes/README.md`; no user library data was supplied to image generation or editing.

## Live Navidrome/API checks

The authorized test server reported Navidrome `0.62.0 (1b46b977)` with OpenSubsonic support. Direct browser-origin requests from the local app succeeded. Home loaded 20 newest albums, 20 random albums and 50 genre channels, with real album art and independent section behavior.

Real genre collections were used to drive every non-default stage:

- `电子音乐` → Cyber / console.
- `电子游戏` → Pixel / quest.
- `摇滚` → Rock / zine.
- `国语流行` → Bloom / garden.
- `古典` → Cinematic / screening.
- `爵士乐` → Lounge / club.
- No current track → Prism / workstation.

The authenticated Range proof from the real `Da Funk` stream remains:

```text
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1023/11521265
Content-Type: audio/mp4
1024 bytes received
```

The automation environment does not grant an audible-playback user gesture. The app caught and surfaced that expected rejection, while current-track state, authenticated audio source, queue data and the real Range response were verified. Audible output remains a human-browser click check rather than an automation claim.

## Seven-stage wide-browser acceptance

One-time, isolated Headless Chrome screenshots were captured at `1440×900` using the real local application and real server data. The temporary Chrome profile was destroyed after the run; screenshots and the contact sheet remained only in `/tmp` for visual QA and are not product assets.

| Stage | Resolved wide grid | Key geometry |
| --- | --- | --- |
| Prism | `240px 848px 352px` | Left archive rail, scrolling catalogue, full-height right player/queue |
| Cyber | `1040px 400px`; rows `90px 810px` | Top command navigation, full-height right diagnostic console |
| Pixel | `208px 888px 336px` | Bordered RPG shell, inventory-like tracks, right HUD and queue |
| Rock | columns `272px 1168px`; rows `700px 200px` | Full-height backstage rail, stage content, contained bottom amplifier/set-list transport |
| Bloom | one column; rows `93px 607px 200px` | Top garden navigation, full-width content, contained bottom player/queue |
| Cinematic | one column; rows `74px 650px 176px` | Masthead, centered proscenium, contained bottom transport/credits |
| Lounge | `208px 816px 416px` | Intimate rail, record room, padded right turntable/queue console |

All seven document widths matched the 1440px viewport with zero horizontal overflow. Every stage loaded its intended `/assets/themes/*` background. Rock, Bloom and Cinematic initially exposed a bottom-transport min-content overflow; the grid rows were constrained, controls were compacted, and the browser was remeasured with player and queue fully contained. Their exceptional player-error surface is now also contained inside the transport instead of being clipped.

The wide Cinematic `Open now playing` path was rechecked after removing the filter/overflow containing block. The fixed dialog measured `544×836` at `(448, 32)`, stayed fully inside the `1440×900` viewport, exposed all six controls, set `aria-modal=true`, and left zero dialogs after Close.

Across real Cyber, Pixel, Rock, Bloom, Cinematic and Lounge changes:

- `data-theme`, `data-layout`, `data-transition`, font stacks and background URL changed to the expected contract.
- During each theme change exactly one `.theme-burst` existed, and it automatically unmounted after the configured 600–900ms motion window.
- The same CDP audio node ID remained connected before and after each change.
- The focused `Play genre` control remained the active element after the visual switch.
- The page kept one `<audio>` element and never keyed the App, shell or player.

## Responsive acceptance

At `1024×768` the stable medium contract remained active: a 188px sticky navigation rail, fixed bottom player, closed right-side queue drawer and zero horizontal overflow. Personality art, hero geometry and typography remained active without applying the wide-screen shell reorders.

At `390×844` and `360×800`:

- Document scroll width equaled the viewport; no horizontal overflow.
- Bottom navigation measured 64px and stayed fixed.
- The 78px mini-player stayed fixed directly above navigation.
- Closed queue drawers remained fully outside the viewport.
- Every sampled visible button was at least 44px high.
- No modal remained open after the acceptance flow.
- Ambient art opacity reduced to 0.48 and real cover art remained smoothly rendered.

The `390×844` Lounge screenshot confirmed that the brass club identity, serif display typography, curved hero, rounded set list, mini-player and bottom navigation remain readable as one coherent mobile composition.

## Motion and accessibility

- Every theme has a unique transition contract: refract, scan, bloom, blocks, tear, curtain or smoke.
- Burst keyframes animate only opacity and transform; the layer is `aria-hidden` and pointer-inert.
- A live Cinematic-to-Lounge change mounted one smoke burst at `0.86s`; after 1,000ms the burst count was zero while the Lounge theme, focused trigger and single audio node remained intact.
- With `prefers-reduced-motion: reduce`, the browser matched the media query, `.theme-burst` computed to `display:none`, and ambient animation computed to `none`.
- The reduced-motion skip link remained translated off-screen when unfocused instead of becoming permanently visible.
- Wide layout changes use grid areas without changing DOM/focus order.
- Compact mode retained 44px controls, fixed navigation/player spacing and zero horizontal overflow.

The local browser tab remains available at `http://127.0.0.1:5173/`.
