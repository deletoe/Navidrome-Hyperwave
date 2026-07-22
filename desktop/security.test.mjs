import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  isAllowedAppNavigation,
  isSafeExternalUrl,
  withDesktopCorsHeaders,
} = require("./security.cjs");

describe("desktop security policy", () => {
  it("keeps navigation inside the packaged app or active development origin", () => {
    expect(isAllowedAppNavigation(
      "file:///Applications/My%20Navidrome.app/Contents/Resources/app.asar/dist/index.html",
      "file:///Applications/My%20Navidrome.app/Contents/Resources/app.asar/dist/index.html",
    )).toBe(true);
    expect(isAllowedAppNavigation(
      "http://127.0.0.1:5173/search",
      "file:///app/dist/index.html",
      "http://127.0.0.1:5173",
    )).toBe(true);
    expect(isAllowedAppNavigation("https://example.com", "file:///app/dist/index.html")).toBe(false);
  });

  it("opens only ordinary web links outside the app", () => {
    expect(isSafeExternalUrl("https://navidrome.org")).toBe(true);
    expect(isSafeExternalUrl("mailto:person@example.com")).toBe(false);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("adds the response headers needed for remote covers and ranged audio", () => {
    const headers = withDesktopCorsHeaders({
      "Content-Type": ["audio/flac"],
      "access-control-allow-origin": ["https://old.example"],
    });
    expect(headers["Access-Control-Allow-Origin"]).toEqual(["*"]);
    expect(headers["Access-Control-Expose-Headers"][0]).toContain("Content-Range");
    expect(headers["access-control-allow-origin"]).toBeUndefined();
    expect(headers["Content-Type"]).toEqual(["audio/flac"]);
  });
});
