import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { resolveThemeForTrack } from "../lib/themeEngine";
import { ThemeBurst } from "./ThemeBurst";

describe("ThemeBurst", () => {
  it("renders a single inert burst for an active track", () => {
    const theme = resolveThemeForTrack({
      id: "cyber",
      title: "Signal",
      genre: "Electronic",
    });

    const { container } = render(
      <ThemeBurst theme={theme} active sequence={3} />,
    );
    const burst = container.querySelector(".theme-burst");

    expect(burst).toHaveAttribute("aria-hidden", "true");
    expect(burst).toHaveAttribute("data-transition", "scan");
    expect(burst).toHaveAttribute("data-sequence", "3");
    expect(container.querySelectorAll(".theme-burst")).toHaveLength(1);
    expect(burst?.querySelectorAll("button, a, input, audio")).toHaveLength(0);
  });

  it("renders nothing before playback selects a personality", () => {
    const theme = resolveThemeForTrack();

    const { container } = render(
      <ThemeBurst theme={theme} active={false} sequence={0} />,
    );

    expect(container.querySelector(".theme-burst")).toBeNull();
  });
});
