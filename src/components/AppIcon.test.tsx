import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppIcon } from "./AppIcon";

describe("AppIcon", () => {
  it("renders a decorative, consistently styled SVG", () => {
    const { container } = render(<AppIcon name="play" />);
    const icon = container.querySelector("svg");

    expect(icon).toHaveClass("app-icon");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("focusable", "false");
    expect(icon).toHaveAttribute("width", "18");
    expect(icon).toHaveAttribute("height", "18");
  });
});
