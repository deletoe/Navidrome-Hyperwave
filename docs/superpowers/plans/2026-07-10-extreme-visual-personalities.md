# Extreme Visual Personalities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Completed steps are marked with checked boxes.

**Goal:** Turn the seven Navidrome themes into radically different image-backed layouts with theatrical, non-blocking theme transitions while preserving playback, focus, and mobile usability.

**Architecture:** Extend the pure theme model with scene metadata and CSS variables; mount one short-lived decorative `ThemeBurst` beside the stable application tree; use `data-theme` and root state attributes to drive large CSS grid changes without changing semantic DOM order. Seven original project-owned raster assets live under `public/assets/themes` and degrade to existing gradients if unavailable.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, CSS Grid/animations, generated WebP/PNG assets, in-app Chrome verification.

---

### Task 1: Scene Metadata and Stable Theme Variables

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/themeEngine.ts`
- Modify: `src/lib/themeEngine.test.ts`

- [x] **Step 1: Write failing scene metadata tests**

Add fixtures that require seven unique layouts, transitions, assets, and typography pairs:

```ts
it("defines a unique stage contract for every personality", () => {
  const themes = fixtures.map(resolveThemeForTrack);

  expect(new Set(themes.map(({ scene }) => scene.layout)).size).toBe(7);
  expect(new Set(themes.map(({ scene }) => scene.transition)).size).toBe(7);
  expect(new Set(themes.map(({ scene }) => scene.asset)).size).toBe(7);
  expect(new Set(themes.map(({ scene }) => `${scene.displayFont}|${scene.bodyFont}`)).size).toBe(7);
  for (const theme of themes) {
    expect(theme.scene.asset).toMatch(/^\/assets\/themes\//);
    expect(theme.scene.displayFont).not.toHaveLength(0);
    expect(theme.scene.bodyFont).not.toHaveLength(0);
  }
});

it("exports scene art and separated motion variables", () => {
  const theme = resolveThemeForTrack(track("stage", { genre: "Electronic" }));
  expect(themeToCssVars(theme)).toMatchObject({
    "--theme-art": `url("${theme.scene.asset}")`,
    "--display-font": theme.scene.displayFont,
    "--body-font": theme.scene.bodyFont,
    "--control-duration": "150ms",
    "--drawer-duration": "280ms",
    "--theme-burst-duration": `${theme.motionDuration}ms`,
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm run test:run -- src/lib/themeEngine.test.ts`

Expected: FAIL because `VisualTheme.scene` and the new variables do not exist.

- [x] **Step 3: Add the scene types and seven contracts**

Add to `src/types.ts`:

```ts
export interface VisualThemeScene {
  layout: "workstation" | "console" | "garden" | "quest" | "zine" | "screening" | "club";
  transition: "refract" | "scan" | "bloom" | "blocks" | "tear" | "curtain" | "smoke";
  asset: string;
  assetMode: "cover" | "tile" | "pixel";
  displayFont: string;
  bodyFont: string;
}
```

Add `scene: VisualThemeScene` to `VisualTheme`. Populate each theme with the exact asset paths from the design spec. `themeToCssVars` must set the seven new variables and stop deriving a generic `--display-font` from the old four-value `fontFamily` map.

- [x] **Step 4: Run GREEN tests and typecheck**

Run: `npm run test:run -- src/lib/themeEngine.test.ts && npm run typecheck`

Expected: all theme tests pass and TypeScript exits 0.

- [x] **Step 5: Commit the theme contract**

```bash
git add src/types.ts src/lib/themeEngine.ts src/lib/themeEngine.test.ts
git commit -m "feat: define extreme theme stages"
```

---

### Task 2: Decorative Theme Burst and Root State Hooks

**Files:**
- Create: `src/components/ThemeBurst.tsx`
- Create: `src/components/ThemeBurst.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/components/PlayerDock.tsx`

- [x] **Step 1: Write the failing ThemeBurst test**

```tsx
it("renders a single inert burst for an active track", () => {
  const theme = resolveThemeForTrack({ id: "cyber", title: "Signal", genre: "Electronic" });
  const { container } = render(<ThemeBurst theme={theme} active sequence={3} />);
  const burst = container.querySelector(".theme-burst");
  expect(burst).toHaveAttribute("aria-hidden", "true");
  expect(burst).toHaveAttribute("data-transition", "scan");
  expect(burst).toHaveAttribute("data-sequence", "3");
  expect(container.querySelectorAll(".theme-burst")).toHaveLength(1);
});

it("renders nothing before playback selects a personality", () => {
  const theme = resolveThemeForTrack();
  const { container } = render(<ThemeBurst theme={theme} active={false} sequence={0} />);
  expect(container.querySelector(".theme-burst")).toBeNull();
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm run test:run -- src/components/ThemeBurst.test.tsx`

Expected: FAIL because `ThemeBurst` does not exist.

- [x] **Step 3: Implement the inert burst**

Render only decorative spans and frozen labels:

```tsx
export function ThemeBurst({ theme, active, sequence }: ThemeBurstProps) {
  if (!active) return null;
  return (
    <div
      className="theme-burst"
      data-transition={theme.scene.transition}
      data-sequence={sequence}
      aria-hidden="true"
    >
      <span className="theme-burst__art" />
      <span className="theme-burst__veil" />
      <span className="theme-burst__label">
        <strong>{theme.name}</strong>
        <span>{theme.signal}</span>
      </span>
    </div>
  );
}
```

The component has no callbacks, focusable nodes, or player references.

- [x] **Step 4: Write failing App root hook tests**

Extend the connected App test to require:

```ts
expect(document.querySelector(".app")).toHaveAttribute("data-view", "search");
expect(document.querySelector(".app")).toHaveAttribute("data-playing", "false");
expect(document.querySelector(".app")).toHaveAttribute("data-has-track", "true");
expect(document.querySelectorAll(".theme-burst")).toHaveLength(1);
```

Add a PlayerDock test for `data-playing` and `data-has-track`.

- [x] **Step 5: Run the App test and verify RED**

Run: `npm run test:run -- src/App.test.tsx`

Expected: FAIL because the state hooks and burst are absent.

- [x] **Step 6: Wire the burst without keying application state**

Keep the last committed `ThemeId` in a ref and increment `themeSequence` from an effect only after the ID commits. Key the decoration by `theme.id` alone so a sequence-state update does not remount it twice. Render:

```tsx
<div
  className="app"
  data-theme={theme.id}
  data-layout={theme.scene.layout}
  data-transition={theme.scene.transition}
  data-view={view}
  data-playing={player.isPlaying}
  data-has-track={Boolean(currentTrack)}
  style={themeToCssVars(theme)}
>
  <ThemeBurst key={theme.id} theme={theme} active={Boolean(currentTrack)} sequence={themeSequence} />
  {/* existing stable shell */}
</div>
```

Do not place a key on `.app`, `.app-shell`, `PlayerDock`, or `<audio>`. Add `data-playing` and `data-has-track` to the `PlayerDock` section.

- [x] **Step 7: Run GREEN tests**

Run: `npm run test:run -- src/components/ThemeBurst.test.tsx src/App.test.tsx src/hooks/useAudioPlayer.test.tsx`

Expected: burst/App/player tests pass; audio lifecycle tests remain green.

- [x] **Step 8: Commit the transition boundary**

```bash
git add src/components/ThemeBurst.tsx src/components/ThemeBurst.test.tsx src/App.tsx src/App.test.tsx src/components/PlayerDock.tsx
git commit -m "feat: add inert theme transition stage"
```

---

### Task 3: Generate and Normalize Seven Original Assets

**Files:**
- Create: `public/assets/themes/prism-ambient.webp`
- Create: `public/assets/themes/cyber-ambient.webp`
- Create: `public/assets/themes/bloom-ambient.webp`
- Create: `public/assets/themes/pixel-ambient.png`
- Create: `public/assets/themes/rock-ambient.webp`
- Create: `public/assets/themes/cinematic-ambient.webp`
- Create: `public/assets/themes/lounge-ambient.webp`
- Create: `public/assets/themes/README.md`

- [x] **Step 1: Generate one project-owned image per theme**

Use the built-in image generation tool once per prompt in the design spec. Do not use real library images, album covers, artists, user identity, or server information as references. Generate square, crop-safe, text-free images.

- [x] **Step 2: Copy generated outputs into the project**

Create `public/assets/themes`. Copy each selected built-in output from `$CODEX_HOME/generated_images` into a descriptive source file before conversion. Do not overwrite unrelated files.

- [x] **Step 3: Normalize delivery formats**

Use Pillow or the bundled workspace image runtime:

- Stage art: convert to sRGB WebP, 1600×1600 maximum, quality 78–82, strip metadata.
- Cyber: WebP, 1024×1024, quality 82.
- Pixel: nearest-neighbor downsample/quantize to a 256×256 PNG with at most 32 colors.

- [x] **Step 4: Validate every asset**

Run a read-only image report that prints file, format, dimensions, color mode, byte size, and total size. Expected:

- all seven paths exist;
- no dimension is below 256px;
- no individual file exceeds 500KB;
- total size is below 2MB;
- images contain no embedded EXIF/XMP metadata.

Open a contact sheet and visually verify no text, logos, people, recognizable IP, broken seams, or high-detail center obstruction.

- [x] **Step 5: Record provenance**

`public/assets/themes/README.md` records the built-in generation path, generation date, exact seven prompts, post-processing, and the rule that no user data was supplied.

- [x] **Step 6: Commit the assets**

```bash
git add public/assets/themes
git commit -m "feat: add original theme stage artwork"
```

---

### Task 4: Extreme Layouts and Transition CSS

**Files:**
- Modify: `src/styles/base.css`
- Modify: `src/styles/app.css`
- Modify: `src/styles/personalities.css`

- [x] **Step 1: Split motion timing and connect theme art**

Replace broad `--motion-duration` use for controls/drawers with:

```css
--control-duration: 150ms;
--drawer-duration: 280ms;
--theme-burst-duration: 720ms;
```

Use `var(--theme-art)` as the first ambient background layer with a dark veil and keep existing procedural gradients as fallback/detail.

- [x] **Step 2: Add the seven burst animations**

Implement selectors by `data-transition`:

```css
.theme-burst { position: fixed; inset: 0; z-index: 70; pointer-events: none; }
.theme-burst[data-transition="scan"] { animation: burst-scan var(--theme-burst-duration) both; }
.theme-burst[data-transition="blocks"] { animation-timing-function: steps(6, end); }
```

All burst keyframes animate only opacity and transform. Labels disappear before the final third of the animation. Do not animate the application tree.

- [x] **Step 3: Make the wide shell theme-configurable**

Change the wide default grid to:

```css
.app-shell {
  grid-template-columns: var(--wide-navigation) minmax(0, 1fr) var(--wide-queue);
  grid-template-areas: "navigation content playback";
}
```

Assign `grid-area` to the three direct regions. Add wide-only theme layouts from the design spec, including top-navigation garden/screening layouts and bottom transport for Bloom/Cinematic. Keep DOM order unchanged.

- [x] **Step 4: Add component-level personality contracts**

For each theme, define explicit rules for `.view-hero`, `.album-grid`, `.album-card`, `.track-row`, `.player-dock`, `.queue-panel`, `.queue-list`, and `.genre-grid`. The seven themes must differ in at least:

- album grid template and image ratio;
- hero alignment and scale;
- player geometry;
- queue row treatment;
- navigation posture;
- border/clip language;
- typography.

Do not apply `image-rendering: pixelated` to real `.artwork img` elements.

- [x] **Step 5: Add medium and compact degradation**

At `768–1179px`, keep shared navigation/player/queue positioning but preserve theme art, card, typography, and hero differences. At `<768px`, preserve fixed bottom navigation, mini-player, safe-area spacing, 44px controls, and one-modal behavior; reduce art opacity and disable persistent ambient animation.

- [x] **Step 6: Repair reduced-motion behavior**

Hide `.theme-burst`, stop ambient animation, remove compositor hints, and keep the skip link hidden until focused. Do not set a blanket transform override on `.skip-link`.

- [x] **Step 7: Run automated regression checks**

Run: `npm run test:run && npm run typecheck && npm run build`

Expected: all tests pass, TypeScript exits 0, Vite emits the assets and production bundle.

- [x] **Step 8: Commit the layout system**

```bash
git add src/styles/base.css src/styles/app.css src/styles/personalities.css
git commit -m "feat: amplify personality layouts and transitions"
```

---

### Task 5: Live Browser Acceptance and Documentation

**Files:**
- Modify: `docs/product-plan.md`
- Modify: `docs/verification.md`

- [x] **Step 1: Reload the final local app and reconnect**

Use `http://127.0.0.1:5173/`. Verify the credential document still returns 403 and credentials remain absent from source, assets, and production output.

- [x] **Step 2: Verify all seven themes on desktop**

At `1440×900`, play real tracks for Cyber, Pixel, Rock, Bloom, Cinematic, and Lounge; verify Prism before playback. For every personality record:

- `data-theme`, `data-layout`, and loaded background asset;
- wide grid geometry;
- album-card geometry;
- player and queue treatment;
- one transition overlay only;
- the same `<audio>` element remains connected across theme changes;
- no horizontal overflow.

- [x] **Step 3: Verify medium and compact layouts**

Check `1024×768`, `390×844`, and `360×800`. Confirm fixed mobile navigation/player, 44px minimum buttons, safe-area padding, one modal, focus restoration, image crop readability, and no horizontal overflow.

- [x] **Step 4: Verify reduced motion and console health**

Emulate or inspect `prefers-reduced-motion`; burst and continuous ambient animation must be absent while the visual theme remains. Read browser logs after the full flow and resolve any new error or warning.

- [x] **Step 5: Update project documentation**

Add the stage system, generated asset policy, motion separation, and responsive rules to `docs/product-plan.md`. Update `docs/verification.md` with fresh test/build counts, bundle sizes, asset report, desktop/mobile measurements, and live theme evidence.

- [x] **Step 6: Run the final gate**

Run:

```bash
npm run test:run && npm run typecheck && npm run build && npm audit --audit-level=high
```

Expected: zero failures, zero TypeScript diagnostics, successful Vite build, and zero vulnerabilities.

- [x] **Step 7: Commit acceptance documentation**

```bash
git add docs/product-plan.md docs/verification.md
git commit -m "docs: verify extreme visual personalities"
```

---

## Execution record

Completed on 2026-07-11 on branch `codex/extreme-visual-personalities`.

- Scene contract: `9e63274`
- Stable inert transition boundary: `88fe6cb`
- Original generated art: `ad8d4b2`
- Extreme layout system: `453d767`
- React/audio identity test hardening: `702367c`
- Wide bottom-transport containment: `8919c1a`
- Exceptional player-error containment: `70a4db7`
- Overlay/motion hardening: `5ad33ea`
- Wide-only Lounge turntable motion: `888ba0e`
- Generated Rock mark cleanup: `33e2f88`
- Short-lived transition lifecycle: `f8188e6`
- Final gate: 9 test files, 114 tests, typecheck/build/audit all green.
- Browser gate: seven real-data wide stages, 1024px medium, 390px and 360px compact, reduced motion, stable audio node and zero horizontal overflow verified.
