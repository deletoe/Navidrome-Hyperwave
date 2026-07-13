import type { CoverPalette } from "../types";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

interface ColorBucket extends Rgb {
  count: number;
  saturation: number;
  score: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation, l: lightness };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let base: [number, number, number];
  if (segment < 1) base = [chroma, x, 0];
  else if (segment < 2) base = [x, chroma, 0];
  else if (segment < 3) base = [0, chroma, x];
  else if (segment < 4) base = [0, x, chroma];
  else if (segment < 5) base = [x, 0, chroma];
  else base = [chroma, 0, x];
  const offset = l - chroma / 2;
  return {
    r: Math.round((base[0] + offset) * 255),
    g: Math.round((base[1] + offset) * 255),
    b: Math.round((base[2] + offset) * 255),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hexToRgb(value: string): Rgb | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return undefined;
  const packed = Number.parseInt(match[1]!, 16);
  return { r: (packed >> 16) & 255, g: (packed >> 8) & 255, b: packed & 255 };
}

export function mixHexColors(base: string, overlay: string, amount: number): string {
  const left = hexToRgb(base);
  const right = hexToRgb(overlay);
  if (!left || !right) return base;
  const weight = clamp(amount);
  return rgbToHex({
    r: left.r + (right.r - left.r) * weight,
    g: left.g + (right.g - left.g) * weight,
    b: left.b + (right.b - left.b) * weight,
  });
}

function normalizeAccent(color: Rgb): Rgb {
  const hsl = rgbToHsl(color);
  return hslToRgb({
    h: hsl.h,
    s: clamp(Math.max(hsl.s, 0.48), 0, 0.92),
    l: clamp(hsl.l, 0.43, 0.72),
  });
}

function colorDistance(left: Rgb, right: Rgb): number {
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;
  return Math.sqrt(red * red * 0.3 + green * green * 0.59 + blue * blue * 0.11);
}

export function extractPaletteFromPixels(data: Uint8ClampedArray): CoverPalette | undefined {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let index = 0; index + 3 < data.length; index += 4) {
    const alpha = data[index + 3]!;
    if (alpha < 170) continue;
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    const hsl = rgbToHsl({ r, g, b });
    if (hsl.l < 0.035 || hsl.l > 0.96 || (hsl.s < 0.055 && (hsl.l < 0.12 || hsl.l > 0.88))) {
      continue;
    }
    const qr = Math.min(240, Math.floor(r / 32) * 32 + 16);
    const qg = Math.min(240, Math.floor(g / 32) * 32 + 16);
    const qb = Math.min(240, Math.floor(b / 32) * 32 + 16);
    const key = `${qr}:${qg}:${qb}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const candidates: ColorBucket[] = Array.from(buckets.values(), (bucket) => {
    const color = {
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
    };
    const { s, l } = rgbToHsl(color);
    const middleWeight = 1 - Math.min(0.72, Math.abs(l - 0.52) * 1.2);
    return {
      ...color,
      count: bucket.count,
      saturation: s,
      score: bucket.count * (0.38 + s * 1.45) * middleWeight,
    };
  }).sort((left, right) => right.score - left.score);

  const first = candidates[0];
  if (!first) return undefined;
  const primary = normalizeAccent(first);
  const secondaryCandidate = candidates
    .slice(1, 28)
    .map((candidate) => ({
      candidate,
      score:
        colorDistance(primary, candidate) * (0.55 + candidate.saturation) +
        Math.log2(candidate.count + 1) * 10,
    }))
    .sort((left, right) => right.score - left.score)[0]?.candidate;
  const secondary = secondaryCandidate
    ? normalizeAccent(secondaryCandidate)
    : hslToRgb({ ...rgbToHsl(primary), h: (rgbToHsl(primary).h + 145) % 360 });
  const dark = mixHexColors("#05070d", rgbToHex(primary), 0.18);

  return {
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    dark,
  };
}

async function imageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Cover image could not be decoded"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function extractPaletteFromBlob(blob: Blob): Promise<CoverPalette | undefined> {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;

  let source: CanvasImageSource;
  let close: (() => void) | undefined;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    source = bitmap;
    close = () => bitmap.close();
  } else {
    source = await imageFromBlob(blob);
  }

  try {
    context.drawImage(source, 0, 0, 48, 48);
    return extractPaletteFromPixels(context.getImageData(0, 0, 48, 48).data);
  } finally {
    close?.();
  }
}
