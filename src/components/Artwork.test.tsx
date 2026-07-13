import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Artwork } from "./Artwork";

afterEach(cleanup);

describe("Artwork", () => {
  it("keeps semantic artwork named and provides a readable fallback", () => {
    const { rerender } = render(<Artwork src="/cover.webp" alt="Blue Hour cover" />);

    expect(screen.getByRole("img", { name: "Blue Hour cover" })).toHaveAttribute(
      "src",
      "/cover.webp",
    );

    rerender(<Artwork alt="Blue Hour cover" />);
    expect(screen.getByRole("img", { name: /Blue Hour cover; artwork unavailable/i })).toBeVisible();
  });

  it("keeps decorative images and their fallbacks out of the accessibility tree", () => {
    const { container, rerender } = render(
      <Artwork src="/thumbnail.webp" alt="" decorative />,
    );

    const image = container.querySelector("img");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<Artwork alt="" decorative />);
    expect(container.querySelector(".artwork--fallback")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("recovers from a failed image when its source changes", () => {
    const { container, rerender } = render(<Artwork src="/broken.webp" alt="Album cover" />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(screen.getByRole("img", { name: /artwork unavailable/i })).toBeVisible();

    rerender(<Artwork src="/working.webp" alt="Album cover" />);
    expect(screen.getByRole("img", { name: "Album cover" })).toHaveAttribute(
      "src",
      "/working.webp",
    );
  });
});
