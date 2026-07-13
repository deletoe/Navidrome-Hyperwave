import { useEffect, useState } from "react";

export interface HeroMediaProps {
  asset: string;
  covers?: string[];
  className?: string;
}

interface HeroCoverSource {
  coverArt?: string;
}

type CoverUrlResolver = (coverArt?: string, size?: number) => string;

interface DecorativeImageProps {
  className: string;
  loading: "eager" | "lazy";
  src: string;
}

function DecorativeImage({ className, loading, src }: DecorativeImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <img
      className={className}
      src={src}
      alt=""
      draggable={false}
      loading={loading}
      decoding="async"
      hidden={failed}
      onError={() => setFailed(true)}
    />
  );
}

function normalizeCovers(covers: string[] | undefined) {
  const uniqueCovers = new Set<string>();

  for (const cover of covers ?? []) {
    const normalizedCover = cover.trim();
    if (normalizedCover) {
      uniqueCovers.add(normalizedCover);
    }

    if (uniqueCovers.size === 3) {
      break;
    }
  }

  return [...uniqueCovers];
}

export function resolveHeroCovers(
  activeCoverUrl: string | undefined,
  sourceGroups: readonly (readonly HeroCoverSource[])[],
  coverUrl: CoverUrlResolver,
) {
  const resolved: string[] = [];
  const seenUrls = new Set<string>();
  const seenCoverArt = new Set<string>();

  const addUrl = (value: string | undefined) => {
    const url = value?.trim();
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    resolved.push(url);
  };

  addUrl(activeCoverUrl);

  for (const group of sourceGroups) {
    for (const source of group) {
      if (resolved.length === 3) return resolved;

      const coverArt = source.coverArt?.trim();
      if (!coverArt || seenCoverArt.has(coverArt)) continue;
      seenCoverArt.add(coverArt);
      addUrl(coverUrl(coverArt, 512));
    }
  }

  return resolved;
}

export function HeroMedia({ asset, covers, className = "" }: HeroMediaProps) {
  const normalizedAsset = asset.trim();
  const media = [
    ...(normalizedAsset
      ? [{ className: "hero-media__artifact", key: "artifact", src: normalizedAsset }]
      : []),
    ...normalizeCovers(covers).map((src) => ({
      className: "hero-media__cover",
      key: `cover:${src}`,
      src,
    })),
  ];

  return (
    <div className={`hero-media${className ? ` ${className}` : ""}`} aria-hidden="true">
      {media.map((item, index) => (
        <DecorativeImage
          key={item.key}
          className={item.className}
          src={item.src}
          loading={index === 0 ? "eager" : "lazy"}
        />
      ))}
    </div>
  );
}
