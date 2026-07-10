import { useEffect, useState } from "react";

export interface ArtworkProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
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

export function Artwork({ src, alt, className = "", eager = false }: ArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
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
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
