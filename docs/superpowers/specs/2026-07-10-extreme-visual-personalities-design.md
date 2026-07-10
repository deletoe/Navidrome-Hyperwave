# Extreme Visual Personalities Design

## 1. Objective

Upgrade My Navidrome 5.6 from a shared layout with theme-colored skins into seven genuinely different visual stages. A song change may alter the desktop shell, content rhythm, card proportions, typography, player posture, queue treatment, ambient artwork, and transition language while preserving the same accessible controls and playback state.

The result should feel theatrical and intentionally excessive. The stable product contract remains: audio must never remount because of a visual change, keyboard order must remain logical, mobile controls remain reachable, and reduced-motion users receive an immediate static theme change.

## 2. Chosen Approach

Three approaches were considered:

1. **CSS-only skin expansion.** Lowest implementation risk, but likely to remain a more elaborate reskin.
2. **Separate React render tree per personality.** Maximum visual freedom, but duplicates behavior and creates serious focus, queue, and audio lifecycle risk.
3. **Stable application tree plus a configuration-driven stage system.** Keep one semantic DOM and one audio node, add theme scene metadata, large `data-theme` CSS layout overrides, original raster backdrops, and a keyed decorative transition layer.

Approach 3 is selected. It provides extreme variation without allowing visual code to own playback or application state.

## 3. Theme Model

`VisualTheme` gains a `scene` object:

```ts
interface VisualThemeScene {
  layout: "workstation" | "console" | "garden" | "quest" | "zine" | "screening" | "club";
  transition: "refract" | "scan" | "bloom" | "blocks" | "tear" | "curtain" | "smoke";
  asset: string;
  assetMode: "cover" | "tile" | "pixel";
  displayFont: string;
  bodyFont: string;
}
```

`themeToCssVars` remains the single source of CSS variables and adds:

- `--theme-art`
- `--theme-art-size`
- `--theme-art-position`
- `--display-font`
- `--body-font`
- `--control-duration`
- `--drawer-duration`
- `--theme-burst-duration`

This removes the current inline-style/CSS conflict where a generic inline font can override a personality-specific font. `data-layout`, `data-transition`, `data-view`, `data-playing`, and `data-has-track` expose stable selectors without changing DOM order.

## 4. Theme Stages

### Prism Archive

- Baseline three-column archive workstation: `232px / 1fr / 360px`.
- Frosted prismatic vault artwork and restrained glass geometry.
- Newest shelf begins with a large featured card; remaining cards form a clean mosaic.
- Queue remains a precise right-side ledger and player retains the richest metadata.
- Transition: refracted panes sweep diagonally, then dissolve.

### Neon Circuit

- Dense `176px / 1fr / 400px` command console.
- Mono body, technical uppercase display text, cyan/magenta circuit artwork.
- Album cards become horizontal data cartridges; tracks compress into terminal records.
- Player resembles a diagnostic panel and the queue becomes an aligned command log.
- Transition: two neon scan plates cross the viewport with a short glitch pulse.

### Soft Bloom

- Wide desktop garden: top navigation, full-width content, floating bottom player.
- The lightest personality, with mauve atmosphere, translucent petal membranes, soft rounded type, and generous space.
- Album cards use large squircle silhouettes with overlapping image/copy layers.
- Queue becomes a floating right-side petal sheet.
- Transition: a radial bloom expands from the current artwork and fades through soft light.

### Pixel Quest

- `192px / 1fr / 320px` 8px-grid RPG shell.
- Pixel display accents with readable mono body text; real covers remain sharp while decorative fallbacks use nearest-neighbor rendering.
- Album cards become inventory slots and track rows become selectable menu entries.
- Player is a HUD with stepped progress; queue uses a visible `>` current cursor.
- Transition: large pixel blocks close and reopen with `steps()` timing.

### Riot Stage

- `208px / 1fr / 380px` asymmetrical zine stage.
- Torn-paper backdrop, condensed display typography, diagonal tape, thick borders, and staggered cards.
- Album grid uses controlled `nth-child` spanning and slight alternating rotation.
- Queue resembles a backstage set list; player resembles an amplifier rack.
- Transition: two torn diagonal bands slam across the viewport with one restrained flash.

### Silver Screen

- Top masthead, centered content stage up to 1040px, bottom transport strip.
- Poster-like album proportions, serif display type, letterbox framing, spotlight artwork, and generous negative space.
- Queue becomes a right-side credit roll; expanded player uses a 16:9 editorial composition.
- Transition: top and bottom curtains close briefly and reveal the new theme.

### Midnight Club

- `220px / 1fr / 420px` intimate listening room.
- Deep green-black artwork, brass accents, serif display type, horizontal record-rack cards, and partial vinyl-disc decoration.
- Queue reads like a performance menu with dotted leaders.
- Player becomes a turntable console; artwork rotation only runs while `data-playing="true"`.
- Transition: dark smoke layers drift through a brass aperture.

## 5. Original Raster Assets

Generate seven original, text-free, brand-free, people-free images with the built-in image generator. They must not use user library screenshots, album covers, artist identities, server details, or listening history as references.

Project paths:

```text
public/assets/themes/prism-ambient.webp
public/assets/themes/cyber-ambient.webp
public/assets/themes/bloom-ambient.webp
public/assets/themes/pixel-ambient.png
public/assets/themes/rock-ambient.webp
public/assets/themes/cinematic-ambient.webp
public/assets/themes/lounge-ambient.webp
```

The five stage images use crop-safe square compositions with a calm center. Cyber is a repeatable coordinate texture. Pixel is processed as a small indexed-color tile. Each asset has a CSS gradient fallback; inactive theme selectors must not force all seven images to download. The target total transfer size is below 2 MB.

## 6. Transition Architecture

The application tree is never keyed by theme:

```text
App
├── ThemeBurst (decorative, keyed only when the ThemeId changes)
├── Navigation
├── Content
├── PlayerDock
│   └── audio (same DOM node across every theme)
└── QueuePanel
```

`ThemeBurst` is `aria-hidden` and `pointer-events:none`. It contains at most two precomposited layers and animates only transform and opacity. Rapid song changes replace the previous burst rather than stacking animation nodes. It does not render without a current track.

Motion durations are separated:

- Controls: 120–180ms.
- Queue/drawers: 220–320ms.
- Theme burst: 600–900ms depending on personality.

`prefers-reduced-motion: reduce` removes the burst and all continuous ambient motion while preserving theme colors, layout, image, and focus indication. Tablet and small-screen media queries reduce blur and disable expensive persistent animation.

## 7. Responsive Rules

- **Wide (`>=1180px`)**: all seven desktop shell layouts may differ dramatically.
- **Medium (`768–1179px`)**: personality-specific card, hero, player, and art direction remain; navigation/player/queue use the shared stable structural contract.
- **Compact (`<768px`)**: bottom navigation, mini-player position, safe-area spacing, modal ownership, and 44px targets remain stable. Personality appears through artwork, hero composition, card ratios, border language, typography, and transition treatment.

CSS visual ordering must never differ from keyboard DOM ordering. Large layout differences use grid areas on the three top-level shell regions, not `order` or reversed flex flows.

## 8. Accessibility and Performance

- The burst never receives focus or pointer events.
- Focused controls remain in the same DOM node during a theme change.
- Theme images are decorative and have no alt text surface.
- Every theme preserves readable contrast and visible focus rings.
- Reduced-motion mode disables burst and continuous animation.
- Real album art is not pixelated by the Pixel personality.
- Large background filters and permanent `will-change` are avoided; only the short-lived burst receives compositor hints.
- If an image fails, the existing gradients still present a complete theme.

Modal and wide-queue architecture are not rewritten in this feature. Visual overrides must not make the existing modal focus behavior worse, and desktop queue styling remains complementary rather than introducing another modal state.

## 9. Testing and Acceptance

Automated tests must prove:

1. Every theme has a unique layout, transition, asset, display font, and body font.
2. `themeToCssVars` exports the new stage variables.
3. `ThemeBurst` renders one decorative layer only after a real theme change and never owns audio state.
4. App roots expose `data-view`, `data-playing`, and `data-has-track`.
5. PlayerDock exposes playing/track data hooks without changing its accessible controls.
6. Existing 102 tests continue to pass.

Browser acceptance uses real Navidrome metadata and checks Prism plus at least Cyber, Pixel, Rock, Bloom, Cinematic, and Lounge at `1440×900`, `1024×768`, `390×844`, and `360×800`. It verifies theme-specific grid geometry, new raster artwork loading, no horizontal overflow, stable audio element identity, preserved focus, one active transition overlay, reduced-motion behavior, and clean console output.

## 10. Out of Scope

- Separate behavior components per theme.
- User-uploaded theme imagery.
- AI analysis of audio files.
- Replacing album covers or artist art.
- WebGL, canvas particle systems, or real-time FFT visualization.
- Rewriting playback, queue, authentication, or Navidrome API behavior.
