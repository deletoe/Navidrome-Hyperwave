import type { CSSProperties } from "react";

import type { ThemeId, Track, VisualTheme } from "../types";

const THEMES: Record<ThemeId, VisualTheme> = {
  prism: {
    id: "prism",
    name: "Prism Archive",
    signal: "Library signal / balanced spectrum",
    colors: {
      background: "#0b1020",
      surface: "rgba(20, 29, 51, .78)",
      surfaceStrong: "#18213a",
      primary: "#8de7ff",
      secondary: "#b99cff",
      text: "#f6f8ff",
      muted: "#aab5d0",
      border: "rgba(141, 231, 255, .28)",
    },
    fontFamily: "sans",
    radius: "18px",
    density: "balanced",
    frameStyle: "soft",
    texture: "prismatic haze",
    motionDuration: 760,
    scene: {
      layout: "workstation",
      transition: "refract",
      asset: "/assets/themes/prism-ambient.webp",
      assetMode: "cover",
      displayFont: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
      bodyFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
    },
  },
  cyber: {
    id: "cyber",
    name: "Neon Circuit",
    signal: "Electronic signal / midnight grid",
    colors: {
      background: "#02080c",
      surface: "rgba(3, 18, 24, .86)",
      surfaceStrong: "#061f29",
      primary: "#54ffe1",
      secondary: "#ff4fd8",
      text: "#eafffb",
      muted: "#8fb8b3",
      border: "rgba(84, 255, 225, .42)",
    },
    fontFamily: "mono",
    radius: "4px",
    density: "compact",
    frameStyle: "line",
    texture: "neon coordinate grid",
    motionDuration: 640,
    scene: {
      layout: "console",
      transition: "scan",
      asset: "/assets/themes/cyber-ambient.webp",
      assetMode: "tile",
      displayFont: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      bodyFont: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    },
  },
  bloom: {
    id: "bloom",
    name: "Soft Bloom",
    signal: "Pop signal / daylight petals",
    colors: {
      background: "#241827",
      surface: "rgba(74, 45, 72, .64)",
      surfaceStrong: "#58364f",
      primary: "#ffb8cd",
      secondary: "#b9f3df",
      text: "#fff8fb",
      muted: "#e3c8d7",
      border: "rgba(255, 205, 223, .35)",
    },
    fontFamily: "rounded",
    radius: "28px",
    density: "spacious",
    frameStyle: "soft",
    texture: "floating petal glass",
    motionDuration: 820,
    scene: {
      layout: "garden",
      transition: "bloom",
      asset: "/assets/themes/bloom-ambient.webp",
      assetMode: "cover",
      displayFont: 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
      bodyFont: '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
    },
  },
  pixel: {
    id: "pixel",
    name: "Pixel Quest",
    signal: "Game signal / continue?",
    colors: {
      background: "#120d2b",
      surface: "rgba(28, 21, 65, .92)",
      surfaceStrong: "#2a1d66",
      primary: "#ffe45d",
      secondary: "#5df4ff",
      text: "#fffbea",
      muted: "#bdb5e8",
      border: "rgba(255, 228, 93, .58)",
    },
    fontFamily: "mono",
    radius: "0px",
    density: "compact",
    frameStyle: "hard",
    texture: "pixel scanline blocks",
    motionDuration: 600,
    scene: {
      layout: "quest",
      transition: "blocks",
      asset: "/assets/themes/pixel-ambient.png",
      assetMode: "pixel",
      displayFont: '"Courier New", "SFMono-Regular", monospace',
      bodyFont: '"SFMono-Regular", Menlo, Consolas, monospace',
    },
  },
  rock: {
    id: "rock",
    name: "Riot Stage",
    signal: "Amplifier signal / live wire",
    colors: {
      background: "#110d0c",
      surface: "rgba(37, 28, 25, .88)",
      surfaceStrong: "#342521",
      primary: "#ff653f",
      secondary: "#f4d35e",
      text: "#fff8ef",
      muted: "#c5ada1",
      border: "rgba(255, 101, 63, .45)",
    },
    fontFamily: "sans",
    radius: "2px",
    density: "compact",
    frameStyle: "cut",
    texture: "torn diagonal stage tape",
    motionDuration: 700,
    scene: {
      layout: "zine",
      transition: "tear",
      asset: "/assets/themes/rock-ambient.webp",
      assetMode: "cover",
      displayFont: '"Avenir Next Condensed", "Arial Narrow", Impact, sans-serif',
      bodyFont: 'Inter, "Helvetica Neue", Arial, sans-serif',
    },
  },
  cinematic: {
    id: "cinematic",
    name: "Silver Screen",
    signal: "Score signal / house lights down",
    colors: {
      background: "#11141a",
      surface: "rgba(28, 31, 37, .86)",
      surfaceStrong: "#282b30",
      primary: "#e7c989",
      secondary: "#a7b9cf",
      text: "#fffaf0",
      muted: "#b9b4aa",
      border: "rgba(231, 201, 137, .30)",
    },
    fontFamily: "serif",
    radius: "8px",
    density: "spacious",
    frameStyle: "editorial",
    texture: "film grain spotlight",
    motionDuration: 900,
    scene: {
      layout: "screening",
      transition: "curtain",
      asset: "/assets/themes/cinematic-ambient.webp",
      assetMode: "cover",
      displayFont: '"Iowan Old Style", Baskerville, "Times New Roman", serif',
      bodyFont: 'Optima, Candara, "Noto Sans", sans-serif',
    },
  },
  lounge: {
    id: "lounge",
    name: "Midnight Club",
    signal: "Soul signal / last set",
    colors: {
      background: "#080d0d",
      surface: "rgba(16, 29, 28, .88)",
      surfaceStrong: "#192f2c",
      primary: "#d9ae63",
      secondary: "#78b6a8",
      text: "#f8f1df",
      muted: "#aaa797",
      border: "rgba(217, 174, 99, .34)",
    },
    fontFamily: "serif",
    radius: "14px",
    density: "balanced",
    frameStyle: "line",
    texture: "brass line and slow smoke",
    motionDuration: 860,
    scene: {
      layout: "club",
      transition: "smoke",
      asset: "/assets/themes/lounge-ambient.webp",
      assetMode: "cover",
      displayFont: 'Didot, "Bodoni 72", "Times New Roman", serif',
      bodyFont: 'Gill Sans, Optima, Candara, sans-serif',
    },
  },
};

const RULES: Array<[ThemeId, RegExp]> = [
  [
    "pixel",
    /(?:\b(8[ -]?bit|16[ -]?bit|chiptune|video game|game soundtrack|game ost|vgm|arcade)\b|电子游戏|游戏原声|芯片音乐)/i,
  ],
  [
    "cyber",
    /(?:\b(electronic|electronica|edm|techno|house|trance|synth|synthwave|ambient)\b|电子音乐|电子乐|舞曲|氛围音乐)/i,
  ],
  [
    "rock",
    /(?:\b(rock|metal|punk|grunge|hardcore|alternative rock)\b|摇滚|硬摇滚|朋克|金属|中国摇滚|独立摇滚)/i,
  ],
  [
    "bloom",
    /(?:\b(pop|dream pop|mandopop|c-?pop|female vocal|vocal pop)\b|国语流行|华语流行|粤语流行|流行女声|流行)/i,
  ],
  [
    "cinematic",
    /(?:\b(soundtrack|score|classical|orchestral|symphon|opera|film music)\b|原声音乐|电影原声|古典|管弦|交响|器乐曲)/i,
  ],
  [
    "lounge",
    /(?:\b(jazz|soul|blues|funk|swing|r&b|rhythm and blues)\b|爵士乐|灵魂乐|蓝调|放克)/i,
  ],
];

function metadataText(track?: Track): string {
  if (!track) return "";
  return [
    track.title,
    track.artist,
    track.displayArtist,
    track.album,
    track.genre,
    ...(track.genres?.map((genre) => genre.name) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLowerCase();
}

export function resolveThemeForTrack(track?: Track): VisualTheme {
  const metadata = metadataText(track);
  const match = RULES.find(([, expression]) => expression.test(metadata));
  return THEMES[match?.[0] ?? "prism"];
}

type ThemeCssProperties = CSSProperties & Record<`--${string}`, string>;

export function themeToCssVars(theme: VisualTheme): ThemeCssProperties {
  const artSize: Record<VisualTheme["scene"]["assetMode"], string> = {
    cover: "cover",
    tile: "512px 512px",
    pixel: "256px 256px",
  };
  const artPosition: Record<VisualTheme["scene"]["layout"], string> = {
    workstation: "center",
    console: "top left",
    garden: "center",
    quest: "top left",
    zine: "center",
    screening: "center top",
    club: "center",
  };
  return {
    "--theme-bg": theme.colors.background,
    "--theme-surface": theme.colors.surface,
    "--theme-surface-strong": theme.colors.surfaceStrong,
    "--theme-primary": theme.colors.primary,
    "--theme-secondary": theme.colors.secondary,
    "--theme-text": theme.colors.text,
    "--theme-muted": theme.colors.muted,
    "--theme-border": theme.colors.border,
    "--theme-art": `url("${theme.scene.asset}")`,
    "--theme-art-size": artSize[theme.scene.assetMode],
    "--theme-art-position": artPosition[theme.scene.layout],
    "--display-font": theme.scene.displayFont,
    "--body-font": theme.scene.bodyFont,
    "--card-radius": theme.radius,
    "--density": theme.density,
    "--frame-style": theme.frameStyle,
    "--texture": theme.texture,
    "--motion-duration": `${theme.motionDuration}ms`,
    "--control-duration": "150ms",
    "--drawer-duration": "280ms",
    "--theme-burst-duration": `${theme.motionDuration}ms`,
  };
}
