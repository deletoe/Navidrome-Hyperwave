import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HeroMedia, resolveHeroCovers } from "./HeroMedia";

afterEach(cleanup);

describe("HeroMedia", () => {
  it("resolves only the unique cover URLs the collage can display", () => {
    const coverUrl = vi.fn((coverArt?: string) => (coverArt ? `/${coverArt}.webp` : ""));

    expect(
      resolveHeroCovers(
        "/active.webp",
        [[{ coverArt: "one" }, { coverArt: "one" }, { coverArt: "two" }, { coverArt: "three" }]],
        coverUrl,
      ),
    ).toEqual(["/active.webp", "/one.webp", "/two.webp"]);
    expect(coverUrl).toHaveBeenCalledTimes(2);
    expect(coverUrl).toHaveBeenNthCalledWith(1, "one", 512);
    expect(coverUrl).toHaveBeenNthCalledWith(2, "two", 512);
  });

  it("renders only decorative, non-interactive images with progressive loading", () => {
    const { container } = render(
      <HeroMedia asset="/theme.webp" covers={["/cover-one.webp", "/cover-two.webp"]} />,
    );
    const root = container.querySelector(".hero-media");
    const images = [...container.querySelectorAll("img")];

    expect(root).toHaveAttribute("aria-hidden", "true");
    expect(root).not.toBeNull();
    expect(root?.querySelector("a, button, input, select, textarea, [tabindex]")).toBeNull();
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveClass("hero-media__artifact");
    expect(images.slice(1).every((image) => image.classList.contains("hero-media__cover"))).toBe(
      true,
    );

    for (const image of images) {
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("draggable", "false");
      expect(image).toHaveAttribute("decoding", "async");
    }

    expect(images[0]).toHaveAttribute("loading", "eager");
    expect(images[1]).toHaveAttribute("loading", "lazy");
    expect(images[2]).toHaveAttribute("loading", "lazy");
  });

  it("drops empty covers, de-duplicates them, and caps the collage at three covers", () => {
    const { container } = render(
      <HeroMedia
        asset=" /theme.webp "
        covers={[
          "",
          " /cover-one.webp ",
          "/cover-two.webp",
          "/cover-one.webp",
          "   ",
          "/cover-three.webp",
          "/cover-four.webp",
        ]}
      />,
    );

    expect([...container.querySelectorAll(".hero-media__cover")].map((image) => image.getAttribute("src")))
      .toEqual(["/cover-one.webp", "/cover-two.webp", "/cover-three.webp"]);
    expect(container.querySelector(".hero-media__artifact")).toHaveAttribute("src", "/theme.webp");
  });

  it("does not emit empty image sources and makes the first available cover eager", () => {
    const { container } = render(<HeroMedia asset="   " covers={["", " /cover.webp "]} />);
    const images = container.querySelectorAll("img");

    expect(images).toHaveLength(1);
    expect(images[0]).toHaveClass("hero-media__cover");
    expect(images[0]).toHaveAttribute("src", "/cover.webp");
    expect(images[0]).toHaveAttribute("loading", "eager");
  });

  it("hides only a failed image", () => {
    const { container } = render(
      <HeroMedia asset="/theme.webp" covers={["/cover-one.webp", "/cover-two.webp"]} />,
    );
    const images = [...container.querySelectorAll("img")];

    fireEvent.error(images[1]);

    expect(images[0]).not.toHaveAttribute("hidden");
    expect(images[1]).toHaveAttribute("hidden");
    expect(images[2]).not.toHaveAttribute("hidden");
  });

  it("restores a failed image when its source changes without remounting the root", () => {
    const { container, rerender } = render(<HeroMedia asset="/theme-one.webp" />);
    const root = container.querySelector(".hero-media");
    const image = container.querySelector(".hero-media__artifact");

    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);
    expect(image).toHaveAttribute("hidden");

    rerender(<HeroMedia asset="/theme-two.webp" className="hero-media--alternate" />);

    expect(container.querySelector(".hero-media")).toBe(root);
    expect(container.querySelector(".hero-media__artifact")).toBe(image);
    expect(image).toHaveAttribute("src", "/theme-two.webp");
    expect(image).not.toHaveAttribute("hidden");
    expect(root).toHaveClass("hero-media--alternate");
  });
});
