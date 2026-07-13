import {
  ArrowLeft,
  CirclePlay,
  House,
  ListMusic,
  ListPlus,
  LoaderCircle,
  LogIn,
  LogOut,
  Maximize2,
  Palette,
  Pause,
  PencilLine,
  Play,
  RefreshCw,
  Repeat1,
  Repeat2,
  RotateCcw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  back: ArrowLeft,
  close: X,
  connect: LogIn,
  disconnect: LogOut,
  expand: Maximize2,
  favorite: Star,
  home: House,
  loading: LoaderCircle,
  mute: VolumeX,
  next: SkipForward,
  pause: Pause,
  play: Play,
  playCircle: CirclePlay,
  previous: SkipBack,
  queue: ListMusic,
  queueAdd: ListPlus,
  refresh: RefreshCw,
  repeat: Repeat2,
  repeatOne: Repeat1,
  retry: RotateCcw,
  revise: PencilLine,
  search: Search,
  shuffle: Shuffle,
  studio: Palette,
  trash: Trash2,
  volume: Volume2,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof ICONS;

export interface AppIconProps {
  name: AppIconName;
  className?: string;
  filled?: boolean;
  size?: number;
}

export function AppIcon({ name, className = "", filled = false, size = 18 }: AppIconProps) {
  const Icon = ICONS[name];
  return (
    <Icon
      className={`app-icon${className ? ` ${className}` : ""}`}
      size={size}
      strokeWidth={1.85}
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
      focusable="false"
    />
  );
}
