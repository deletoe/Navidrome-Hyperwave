export type DesktopCommand =
  | "back"
  | "navigate-home"
  | "navigate-artists"
  | "navigate-search"
  | "navigate-favorites"
  | "navigate-studio"
  | "show-now-playing"
  | "toggle-playback"
  | "previous-track"
  | "next-track"
  | "toggle-queue"
  | "audio-settings";

export interface DesktopPlaybackState {
  title: string;
  artist: string;
  isPlaying: boolean;
}

export interface MyNavidromeDesktopBridge {
  readonly isDesktop: true;
  readonly platform: string;
  readonly version: string;
  onCommand(callback: (command: DesktopCommand) => void): () => void;
  updatePlayback(state: DesktopPlaybackState): void;
}

declare global {
  interface Window {
    myNavidromeDesktop?: MyNavidromeDesktopBridge;
  }
}

export function isDesktopApp(): boolean {
  return window.myNavidromeDesktop?.isDesktop === true;
}
