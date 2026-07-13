export type AuthMode = "password" | "apiKey";

export type AuthConfig =
  | { type: "password"; username: string; password: string }
  | { type: "apiKey"; apiKey: string };

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface Genre {
  value: string;
  songCount?: number;
  albumCount?: number;
}

export interface TrackGenre {
  name: string;
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  displayArtist?: string;
  artists?: ArtistRef[];
  album?: string;
  albumId?: string;
  artistId?: string;
  coverArt?: string;
  duration?: number;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  genres?: TrackGenre[];
  starred?: string;
  suffix?: string;
  contentType?: string;
}

export interface Album {
  id: string;
  name: string;
  artist?: string;
  displayArtist?: string;
  artists?: ArtistRef[];
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  created?: string;
  year?: number;
  genre?: string;
  genres?: TrackGenre[];
  starred?: string;
  song?: Track[];
}

export interface Artist {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  starred?: string;
  album?: Album[];
}

export interface SearchResult {
  song: Track[];
  album: Album[];
  artist: Artist[];
}

export interface StarredResult {
  song: Track[];
  album: Album[];
  artist: Artist[];
}

export interface ServerInfo {
  status: "ok";
  version: string;
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
}

export type ThemeId = "prism" | "cyber" | "bloom" | "pixel" | "rock" | "cinematic" | "lounge";

export interface VisualThemeColors {
  background: string;
  surface: string;
  surfaceStrong: string;
  primary: string;
  secondary: string;
  text: string;
  muted: string;
  border: string;
}

export interface VisualThemeScene {
  layout: "workstation" | "console" | "garden" | "quest" | "zine" | "screening" | "club";
  transition: "refract" | "scan" | "bloom" | "blocks" | "tear" | "curtain" | "smoke";
  asset: string;
  foregroundAsset: string;
  assetMode: "cover" | "tile" | "pixel";
  displayFont: string;
  bodyFont: string;
}

export interface VisualTheme {
  id: ThemeId;
  name: string;
  signal: string;
  colors: VisualThemeColors;
  fontFamily: "sans" | "mono" | "serif" | "rounded";
  radius: string;
  density: "compact" | "balanced" | "spacious";
  frameStyle: "soft" | "line" | "cut" | "hard" | "editorial";
  texture: string;
  motionDuration: number;
  scene: VisualThemeScene;
}
