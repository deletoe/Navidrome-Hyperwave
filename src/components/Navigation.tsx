import type { ServerInfo } from "../types";
import { AppIcon, type AppIconName } from "./AppIcon";

export type AppView =
  | "home"
  | "artists"
  | "search"
  | "favorites"
  | "studio"
  | "nowPlaying"
  | "album"
  | "artist"
  | "genre";
export type PrimaryView = Extract<
  AppView,
  "home" | "artists" | "search" | "favorites" | "studio"
>;

export interface NavigationProps {
  view: AppView;
  serverInfo?: ServerInfo;
  onNavigate: (view: PrimaryView) => void;
  onDisconnect: () => void;
}
const destinations: Array<{ id: PrimaryView; label: string; icon: AppIconName }> = [
  { id: "home", label: "Home", icon: "home" },
  { id: "artists", label: "Artists", icon: "artists" },
  { id: "search", label: "Search", icon: "search" },
  { id: "favorites", label: "Favorites", icon: "favorite" },
  { id: "studio", label: "Studio", icon: "studio" },
];

export function Navigation({ view, serverInfo, onNavigate, onDisconnect }: NavigationProps) {
  return (
    <aside className="navigation-rail">
      <header className="navigation-rail__brand">
        <span className="brand-mark" aria-hidden="true">
          MN
        </span>
        <div>
          <strong>My Navidrome</strong>
          <span>Archive channel 5.6</span>
        </div>
      </header>

      <nav className="primary-nav mobile-nav" aria-label="Primary navigation">
        {destinations.map((destination) => (
          <button
            type="button"
            key={destination.id}
            className={view === destination.id ? "is-active" : undefined}
            aria-current={view === destination.id ? "page" : undefined}
            onClick={() => onNavigate(destination.id)}
          >
            <span className="primary-nav__icon" aria-hidden="true">
              <AppIcon name={destination.icon} />
            </span>
            <span>{destination.label}</span>
          </button>
        ))}
      </nav>

      <section className="server-status" aria-labelledby="server-status-title">
        <p className="eyebrow" id="server-status-title">
          Live archive
        </p>
        <p>
          <span className="status-light" aria-hidden="true" />
          Connected
        </p>
        <dl>
          <div>
            <dt>Protocol</dt>
            <dd>{serverInfo?.openSubsonic ? "OpenSubsonic" : "Subsonic"}</dd>
          </div>
          <div>
            <dt>Server</dt>
            <dd>{serverInfo?.serverVersion || serverInfo?.version || "Ready"}</dd>
          </div>
        </dl>
        <button className="button-with-icon" type="button" onClick={onDisconnect}>
          <AppIcon name="disconnect" />
          Disconnect
        </button>
      </section>
    </aside>
  );
}
