export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter a Navidrome server address");

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid HTTP or HTTPS server address");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The server address must use HTTP or HTTPS");
  }
  if (!url.hostname) throw new Error("Enter a valid Navidrome server address");
  if (url.username || url.password) throw new Error("Put credentials in the fields below, not in the server URL");

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function formatDuration(seconds?: number): string {
  const total = Number.isFinite(seconds) && (seconds ?? 0) > 0 ? Math.floor(seconds ?? 0) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatCount(value?: number): string {
  const count = Number.isFinite(value) && (value ?? 0) > 0 ? value ?? 0 : 0;
  if (count < 1_000) return String(Math.floor(count));
  if (count < 10_000) return `${(Math.floor(count / 100) / 10).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.floor(count / 1_000)}k`;
  return `${(count / 1_000_000).toFixed(count < 10_000_000 ? 1 : 0)}m`;
}
