import { describe, expect, it } from "vitest";

import { resolveThemeForTrack, themeToCssVars } from "./themeEngine";

const track = (
  id: string,
  overrides: Partial<{
    title: string;
    artist: string;
    album: string;
    genre: string;
  }> = {},
) => ({
  id,
  title: id,
  artist: "Unknown Artist",
  ...overrides,
});

describe("visual personality engine", () => {
  it.each([
    [track("synth", { genre: "Synthwave" }), "cyber"],
    [track("bloom", { genre: "Dream Pop" }), "bloom"],
    [track("game", { album: "8-bit Game OST" }), "pixel"],
    [track("riot", { genre: "Punk Rock" }), "rock"],
    [track("score", { genre: "Orchestral Soundtrack" }), "cinematic"],
    [track("night", { genre: "Jazz Lounge" }), "lounge"],
    [track("unknown"), "prism"],
  ])("classifies $id as $expected", (song, expected) => {
    expect(resolveThemeForTrack(song).id).toBe(expected);
  });

  it("uses game metadata before generic soundtrack metadata", () => {
    expect(
      resolveThemeForTrack(track("priority", { album: "8-bit Video Game Soundtrack" })).id,
    ).toBe("pixel");
  });

  it("classifies metadata without changing letter case requirements", () => {
    expect(resolveThemeForTrack(track("case", { genre: "eLeCtRoNiC" })).id).toBe("cyber");
  });

  it.each([
    ["摇滚", "rock"],
    ["电子音乐", "cyber"],
    ["电子游戏", "pixel"],
    ["国语流行", "bloom"],
    ["原声音乐", "cinematic"],
    ["爵士乐", "lounge"],
  ])("maps the library genre %s to %s", (genre, expected) => {
    expect(resolveThemeForTrack(track("中文曲风样本", { genre })).id).toBe(expected);
  });

  it("defines every visual personality dimension for all seven themes", () => {
    const fixtures = [
      track("prism"),
      track("cyber", { genre: "Techno" }),
      track("bloom", { genre: "Pop" }),
      track("pixel", { genre: "Chiptune" }),
      track("rock", { genre: "Metal" }),
      track("cinematic", { genre: "Classical" }),
      track("lounge", { genre: "Soul" }),
    ];

    const themes = fixtures.map(resolveThemeForTrack);

    expect(new Set(themes.map(({ id }) => id))).toEqual(
      new Set(["prism", "cyber", "bloom", "pixel", "rock", "cinematic", "lounge"]),
    );

    for (const theme of themes) {
      expect(theme.colors).toEqual({
        background: expect.any(String),
        surface: expect.any(String),
        surfaceStrong: expect.any(String),
        primary: expect.any(String),
        secondary: expect.any(String),
        text: expect.any(String),
        muted: expect.any(String),
        border: expect.any(String),
      });
      expect(theme.fontFamily).toMatch(/^(sans|mono|serif|rounded)$/);
      expect(theme.radius).toMatch(/px$/);
      expect(theme.density).toMatch(/^(compact|balanced|spacious)$/);
      expect(theme.frameStyle).toMatch(/^(soft|line|cut|hard|editorial)$/);
      expect(theme.texture).not.toHaveLength(0);
      expect(theme.motionDuration).toBeGreaterThan(0);
    }
  });

  it("defines a unique stage contract for every personality", () => {
    const fixtures = [
      track("prism"),
      track("cyber", { genre: "Techno" }),
      track("bloom", { genre: "Pop" }),
      track("pixel", { genre: "Chiptune" }),
      track("rock", { genre: "Metal" }),
      track("cinematic", { genre: "Classical" }),
      track("lounge", { genre: "Soul" }),
    ];
    const themes = fixtures.map(resolveThemeForTrack);

    expect(new Set(themes.map(({ scene }) => scene.layout)).size).toBe(7);
    expect(new Set(themes.map(({ scene }) => scene.transition)).size).toBe(7);
    expect(new Set(themes.map(({ scene }) => scene.asset)).size).toBe(7);
    expect(new Set(themes.map(({ scene }) => scene.displayFont)).size).toBe(7);
    expect(new Set(themes.map(({ scene }) => scene.bodyFont)).size).toBe(7);
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

  it.each([
    ["Pop", "cover", "cover", "center"],
    ["Electronic", "tile", "512px 512px", "top left"],
    ["Chiptune", "pixel", "256px 256px", "top left"],
  ])(
    "maps %s %s art to size %s and position %s",
    (genre, expectedMode, expectedSize, expectedPosition) => {
      const theme = resolveThemeForTrack(track(genre, { genre }));
      const variables = themeToCssVars(theme);

      expect(theme.scene.assetMode).toBe(expectedMode);
      expect(variables).toMatchObject({
        "--theme-art-size": expectedSize,
        "--theme-art-position": expectedPosition,
      });
    },
  );

  it("converts every personality dimension into stable CSS variables", () => {
    const theme = resolveThemeForTrack(track("grid", { genre: "Synthwave" }));

    expect(themeToCssVars(theme)).toMatchObject({
      "--theme-bg": theme.colors.background,
      "--theme-surface": theme.colors.surface,
      "--theme-surface-strong": theme.colors.surfaceStrong,
      "--theme-primary": theme.colors.primary,
      "--theme-secondary": theme.colors.secondary,
      "--theme-text": theme.colors.text,
      "--theme-muted": theme.colors.muted,
      "--theme-border": theme.colors.border,
      "--card-radius": theme.radius,
      "--density": theme.density,
      "--frame-style": theme.frameStyle,
      "--texture": theme.texture,
      "--motion-duration": `${theme.motionDuration}ms`,
    });
    expect(themeToCssVars(theme)).toHaveProperty("--display-font");
  });
});
