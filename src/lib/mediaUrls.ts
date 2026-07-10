export type MediaUrlBuilder = (
  kind: "cover" | "stream",
  id: string,
  size?: number,
) => string;

export function createStableMediaUrlResolver(buildUrl: MediaUrlBuilder) {
  const cache = new Map<string, string>();

  function resolve(kind: "cover" | "stream", id: string, size?: number): string {
    const key = `${kind}:${id}:${size ?? "source"}`;
    const existing = cache.get(key);
    if (existing !== undefined) return existing;
    const value = buildUrl(kind, id, size);
    cache.set(key, value);
    return value;
  }

  return {
    cover(id?: string, size = 512): string {
      return id ? resolve("cover", id, size) : "";
    },
    stream(id: string): string {
      return resolve("stream", id);
    },
    clear(): void {
      cache.clear();
    },
  };
}

export type StableMediaUrlResolver = ReturnType<typeof createStableMediaUrlResolver>;
