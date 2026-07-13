# My Navidrome 5.6 Verification

Verified locally on 2026-07-13 (Asia/Shanghai). No password, API key, tokenized media URL, or complete authentication query is recorded in this file.

## Final automated gate

Fresh final command:

```text
npm run test:run && npm run typecheck && npm run build && npm audit --audit-level=high && git diff --check
```

Result:

- Vitest 4.1.10: 22 test files passed, 202 tests passed, 0 failed.
- TypeScript project build: exit 0, 0 diagnostics.
- Vite 6.4.3 production build: exit 0, 1,617 modules transformed.
- Production bundle: CSS 104.63 kB (18.52 kB gzip), JS 325.86 kB (99.01 kB gzip).
- Dependency audit: 0 vulnerabilities.

The suite now additionally covers authenticated and size-bounded cover fetching, deterministic palette extraction and stale-request cancellation, safe visual-preference persistence, exact genre override precedence, intensity/palette CSS variables, the complete Theme Studio editor, four visualizer modes, seven Canvas render strategies, bounded particles, one RAF chain, one MediaElementSource across concurrent activation and track changes, direct-destination fallback, and ordinary playback continuing while `AudioContext.resume()` remains pending. Artist coverage includes two-level `getArtists` normalization, lazy directory loading, stable controlled filtering, five-request album expansion, real transport aborts, 15-second timeouts, progressive publication, order preservation, track deduplication, partial failure, forced refresh, stale-response guards, authoritative favorite truth, focus/scroll restoration, accessible artist links, duplicate-navigation prevention, and full-collection playback. Existing authentication, queue, scrobble, Media Session, navigation, favorite, icon, image, transition, DOM-identity and responsive regressions remain covered.

## Local server and credential boundary

- Address: `http://127.0.0.1:5173/`
- Listener: Node PID `36244`, bound only to `127.0.0.1:5173`.
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

Seven additional foreground artifacts were generated with the built-in image generator on 2026-07-13 and composed with real library covers only at runtime:

| Asset | Format and dimensions | Bytes |
| --- | --- | ---: |
| Prism foreground | WebP, 768×960 | 83,816 |
| Cyber foreground | WebP, 768×960 | 99,540 |
| Bloom foreground | WebP, 768×960 | 55,048 |
| Pixel foreground | indexed PNG, 512×640, 64 colors | 126,222 |
| Rock foreground | WebP, 768×960 | 188,180 |
| Cinematic foreground | WebP, 768×960 | 84,354 |
| Lounge foreground | WebP, 768×960 | 53,010 |

Foreground delivery size is 690,170 bytes; ambient and foreground theme media total 1,071,433 bytes. All seven artifacts were individually inspected at original detail for composition, text, logos, people and crop safety. The exact generator briefs, restrictions, output-store generation ID and normalization steps are recorded in `public/assets/themes/README.md`.

## Foreground media acceptance

The real local app was rechecked in the in-app browser at its default 1280×720 viewport and at 390×844:

- Prism Home loaded `/assets/themes/prism-foreground.webp` at its natural 768×960 dimensions and three distinct live 512×512 Navidrome covers inside one 240×320 HeroMedia stage.
- Playing `电子音乐` switched the existing stage to the Cyber console composition and `/assets/themes/cyber-foreground.webp`; all 80 visible track rows requested 128×128 cover art and all 80 queue entries requested 96×96 cover art.
- Playing `摇滚` switched to the materially different torn-zine layout and `/assets/themes/rock-foreground.webp`, while retaining one audio node, one HeroMedia root and zero horizontal overflow.
- At 390×844 the Rock HeroMedia stage measured 327×192, document scroll width equaled 390px, the smallest sampled visible button dimension was 44px, and no decorative image was broken.
- The responsive Rock page contained 164 decorative theme/cover image nodes with empty alt text, `HeroMedia` exposed `aria-hidden=true`, and it contained zero interactive descendants.

Visual inspection confirmed that foreground art is part of the information hierarchy rather than a second full-page background: theme artifacts occupy the hero stage, live covers overlap them as physical media, artist cards use image-led proportions, and track/queue thumbnails remain readable at dense list scale.

## Complete artist library acceptance

The new Artists destination was exercised in the in-app browser against the authorized real Navidrome library. `getArtists` returned 130 artists in the server's original grouped index. Filtering `Daft Punk` reduced the directory to one matching card without a new server request; opening it produced eight albums and 149 deduplicated songs aggregated from those albums.

- The artist detail exposed eight real album cards, 149 track rows, Play all songs, Add all to queue, and an accessible artist link on every identifiable track.
- Entering the detail moved focus to `#main-content`; Back restored the `Daft Punk` filter and its directory context. Opening the already-current artist is now a no-op instead of inserting a duplicate history step.
- Album expansion publishes each completed album in stable server order, limits both logical workers and live network transports to five, aborts old work on navigation or disconnect, and turns a stalled request into a partial-result warning after 15 seconds.
- At 1280×720 the detail contained five primary navigation items, eight albums and 149 songs with document width exactly 1280px. At 390×844 the same collection stayed at 390px with no horizontal overflow, a closed pointer-inert queue and no visible button below 44px in either dimension.
- At 320×800 the five navigation labels remained fully visible, every visible button retained a 44px minimum touch target, and the artist directory used two image-led columns without horizontal overflow.

## Adaptive Visual Studio acceptance

The Studio view was exercised in the in-app browser against the authorized real Navidrome library. It now appears as the fifth primary destination beside Home, Artists, Search and Favorites and exposes one cover-response switch, one native 0–100 intensity control, Off/Spectrum/Particles/Hybrid modes, Automatic plus seven personality previews, and a filterable editor for all 50 real library genres.

The real `Da Funk` cover completed the authenticated Blob fetch and browser-side 48×48 analysis. Studio reported `Current cover colors are active` and displayed exactly three valid swatches: `#3957a2`, `#cf5650`, and `#0e1528`. With the cover response enabled, the mapped Rock personality blended its primary to `#8d5d78`; disabling the switch immediately restored the Rock default `#ff653f`, and re-enabling restored the extracted response. No authenticated cover URL, image bytes, password, token or complete query was printed or persisted by the app.

An explicit `电子音乐 → Riot Stage` mapping overrode the built-in Cyber rule for the live current track and survived navigation. Reset All changed the mapping back to Automatic and the same track immediately resolved to Cyber / console again. Previewing Soft Bloom switched to Bloom / garden and then returned to Automatic without replacing the single Canvas node. Spectrum and Hybrid were both selected through the real UI; `data-mode` followed each choice while `.audio-visualizer` remained a one-node decorative layer.

Responsive measurements from the real Studio surface:

| Viewport | Result |
| --- | --- |
| 1280×720 | document width 1280px, five navigation entries, one 1280×720 Canvas, no broken images, smallest navigation dimension 45.8px |
| 390×844 | document width 390px, 362.8px Studio content, 64px five-entry bottom navigation, one 390×844 Canvas, smallest visible button dimension 44px |
| 320×800 | document width 320px, two-column personality previews, mapping rows degrade to two grid rows, five-entry navigation and 44px minimum visible buttons |

All three viewports had zero horizontal overflow. The Canvas had `pointer-events: none`, remained one instance through palette, mapping, preview and mode changes, and used a 2× bitmap at the desktop device pixel ratio. A final clean full-page reload, reconnect and Studio navigation produced no new browser warning or error logs.

The automation browser still rejects audible `play()` because its synthetic click is not a trusted user interaction. The real audio element nevertheless loaded the authenticated stream to readyState 4 with no media error and `crossorigin="anonymous"`; the previously recorded Range proof remains `206`. The live analyser therefore remained in its honest `waiting` state during automation, and no claim is made that browser automation heard audio or observed live FFT energy. Unit coverage proves that a pending or failed AudioContext cannot delay ordinary `audio.play()`, and an actual human click remains the final audible/analyser check.

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

## Icon and control acceptance

The real Cyber genre surface was rechecked at `1440×900` and `390×844` after the control-language pass. Track-row play, queue and favorite actions; player transport, volume, expansion and queue controls; queue removal; and dismiss/close actions now use icons without visible action prose. Navigation and consequential actions retain short labels beside their icons.

- No icon-only button sampled in the live page had an empty accessible name or missing hover title.
- Lucide SVG nodes are decorative (`aria-hidden=true`, `focusable=false`) so button names are announced once.
- At 390px, the document width remained exactly 390px and no visible button was smaller than 44×44px.
- The three track actions measured 109×44px each in their responsive grid, while showing only the play, queue-add and favorite symbols.
- Repeat now keeps the short `Repeat` label, exposes its full mode through its accessible name and tooltip, and uses icon/state styling instead of appending `off`, `all` or `one` to the visible copy.

## Motion and accessibility

- Every theme has a unique transition contract: refract, scan, bloom, blocks, tear, curtain or smoke.
- Burst keyframes animate only opacity and transform; the layer is `aria-hidden` and pointer-inert.
- A live Cinematic-to-Lounge change mounted one smoke burst at `0.86s`; after 1,000ms the burst count was zero while the Lounge theme, focused trigger and single audio node remained intact.
- With `prefers-reduced-motion: reduce`, the browser matched the media query, `.theme-burst` computed to `display:none`, and ambient animation computed to `none`.
- Per the current iteration request, the new live spectrum/particle Canvas does not inspect or disable itself for `prefers-reduced-motion`; the existing burst and ambient reductions above remain unchanged.
- The reduced-motion skip link remained translated off-screen when unfocused instead of becoming permanently visible.
- Wide layout changes use grid areas without changing DOM/focus order.
- Compact mode retained 44px controls, fixed navigation/player spacing and zero horizontal overflow.

The local browser tab remains available at `http://127.0.0.1:5173/`.
