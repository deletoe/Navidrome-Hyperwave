import { useEffect, useState } from "react";

import type { VisualTheme } from "../types";

interface ThemeBurstProps {
  theme: VisualTheme;
  active: boolean;
  sequence: number;
}

export function ThemeBurst({ theme, active, sequence }: ThemeBurstProps) {
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timeout = window.setTimeout(
      () => setVisible(false),
      theme.motionDuration + 48,
    );
    return () => window.clearTimeout(timeout);
  }, [active, sequence, theme.id, theme.motionDuration]);

  if (!active || !visible) return null;

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
