import { useEffect, useState } from "react";

export interface ArtworkProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
  decorative?: boolean;
}
function initials(label: string): string {
  const words = label
    .replace(/\b(cover|artwork)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "♪";
}

export function Artwork({
  src,
  alt,
  className = "",
  eager = false,
  decorative = false,
}: ArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    if (decorative) {
      return (
        <span
          className={`artwork artwork--fallback ${className}`.trim()}
          aria-hidden="true"
        >
          <span aria-hidden="true">♪</span>
        </span>
      );
    }
    return (
      <span
        className={`artwork artwork--fallback ${className}`.trim()}
        role="img"
        aria-label={`${alt}; artwork unavailable`}
      >
        <span aria-hidden="true">{initials(alt)}</span>
      </span>
    );
  }

  return (
    <img
      className={`artwork ${className}`.trim()}
      src={src}
      alt={decorative ? "" : alt}
      aria-hidden={decorative || undefined}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
