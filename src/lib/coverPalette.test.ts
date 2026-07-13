import { describe, expect, it } from "vitest";

import { extractPaletteFromPixels, mixHexColors } from "./coverPalette";

function pixels(colors: Array<[number, number, number, number]>, repeats = 1) {
  return new Uint8ClampedArray(Array.from({ length: repeats }, () => colors).flat(2));
}

describe("cover palette extraction", () => {
  it("selects stable vivid accents and a constrained dark color", () => {
    const data = pixels(
      [
        [220, 40, 80, 255],
        [220, 40, 80, 255],
        [25, 180, 210, 255],
        [8, 8, 8, 255],
      ],
      40,
    );

    const palette = extractPaletteFromPixels(data);
    expect(palette).toEqual(extractPaletteFromPixels(data));
    expect(palette?.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette?.secondary).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette?.secondary).not.toBe(palette?.primary);
    expect(palette?.dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette?.dark).not.toBe(palette?.primary);
  });

  it("ignores transparent and empty extreme pixels", () => {
    expect(
      extractPaletteFromPixels(
        pixels([
          [255, 0, 0, 0],
          [0, 0, 0, 255],
          [255, 255, 255, 255],
        ]),
      ),
    ).toBeUndefined();
  });

  it("mixes valid hex colors and keeps invalid bases stable", () => {
    expect(mixHexColors("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHexColors("rgba(0,0,0,.5)", "#ffffff", 0.5)).toBe("rgba(0,0,0,.5)");
  });
});
