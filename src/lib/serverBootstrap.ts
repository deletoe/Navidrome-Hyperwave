import type { ConnectionInput } from "../hooks/useNavidrome";

interface BootstrapResponse {
  configured?: unknown;
  connection?: {
    serverUrl?: unknown;
    auth?: {
      type?: unknown;
      apiKey?: unknown;
    };
  };
}

export async function loadBoundConnection(
  fetcher: typeof fetch = fetch,
  origin = window.location.origin,
): Promise<ConnectionInput | undefined> {
  const response = await fetcher("/api/bootstrap", {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) return undefined;
  const payload = await response.json() as BootstrapResponse;
  if (payload.configured !== true) return undefined;
  const serverUrl = payload.connection?.serverUrl;
  const apiKey = payload.connection?.auth?.apiKey;
  if (
    typeof serverUrl !== "string"
    || typeof apiKey !== "string"
    || !apiKey
    || payload.connection?.auth?.type !== "apiKey"
  ) {
    return undefined;
  }
  const proxyUrl = new URL(serverUrl, origin);
  if (proxyUrl.origin !== origin || !proxyUrl.pathname.startsWith("/navidrome")) return undefined;
  return {
    serverUrl: proxyUrl.toString().replace(/\/$/, ""),
    auth: { type: "apiKey", apiKey },
  };
}
