import type { VisualTheme } from "../types";

interface ThemeBurstProps {
  theme: VisualTheme;
  active: boolean;
  sequence: number;
}

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
