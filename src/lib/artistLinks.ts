import type { Album, ArtistRef, Track } from "../types";

export interface ResolvedArtistLink {
  id?: string;
  name: string;
}

export function resolveLinkedArtists(entity: Track | Album): ResolvedArtistLink[] {
  const fallbackName = "Unknown artist";
  const listedArtists = resolveListedArtists(entity.artists, fallbackName);
  if (listedArtists.length > 0) return listedArtists;

  const name = cleanLabel(entity.displayArtist) || cleanLabel(entity.artist) || fallbackName;
  const id = cleanId(entity.artistId);
  return [{ ...(id ? { id } : {}), name }];
}

function resolveListedArtists(
  artists: ArtistRef[] | undefined,
  fallback: string,
): ResolvedArtistLink[] {
  if (!Array.isArray(artists) || artists.length === 0) return [];

  const resolved: ResolvedArtistLink[] = [];
  const indexById = new Map<string, number>();
  const unresolvedIndexByName = new Map<string, number>();
  const namesWithIds = new Set<string>();

  for (const artist of artists) {
    if (!artist || typeof artist !== "object") continue;
    const id = cleanId(artist.id);
    const suppliedName = cleanLabel(artist.name);
    if (!id && !suppliedName) continue;
    const name = suppliedName || fallback;
    const normalizedName = normalizeName(name);

    if (id) {
      if (indexById.has(id)) continue;
      const unresolvedIndex = unresolvedIndexByName.get(normalizedName);
      if (unresolvedIndex !== undefined) {
        resolved[unresolvedIndex] = { id, name };
        unresolvedIndexByName.delete(normalizedName);
        indexById.set(id, unresolvedIndex);
      } else {
        indexById.set(id, resolved.length);
        resolved.push({ id, name });
      }
      namesWithIds.add(normalizedName);
      continue;
    }

    if (namesWithIds.has(normalizedName) || unresolvedIndexByName.has(normalizedName)) continue;
    unresolvedIndexByName.set(normalizedName, resolved.length);
    resolved.push({ name });
  }

  return resolved;
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id || undefined;
}

function cleanLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function normalizeName(value: string): string {
  return value.toLowerCase();
}
