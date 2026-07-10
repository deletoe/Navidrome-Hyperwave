import { describe, expect, it, vi } from "vitest";

import { createStableMediaUrlResolver } from "./mediaUrls";

describe("stable media URL resolver", () => {
  it("keeps cover and stream URLs stable within a session", () => {
    const build = vi.fn((kind: "cover" | "stream", id: string, size?: number) =>
      `${kind}:${id}:${size ?? "source"}:${Math.random()}`,
    );
    const resolver = createStableMediaUrlResolver(build);

    expect(resolver.cover("cover-1", 480)).toBe(resolver.cover("cover-1", 480));
    expect(resolver.stream("song-1")).toBe(resolver.stream("song-1"));
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("uses distinct cache entries for different cover sizes", () => {
    let version = 0;
    const resolver = createStableMediaUrlResolver(
      (kind, id, size) => `${kind}:${id}:${size}:${version++}`,
    );

    expect(resolver.cover("cover", 240)).not.toBe(resolver.cover("cover", 640));
  });

  it("caches an intentionally empty builder result", () => {
    const build = vi.fn(() => "");
    const resolver = createStableMediaUrlResolver(build);

    expect(resolver.cover("missing")).toBe("");
    expect(resolver.cover("missing")).toBe("");
    expect(build).toHaveBeenCalledTimes(1);
  });
});
