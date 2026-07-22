const crypto = require("node:crypto");

const SUBSONIC_VERSION = "1.16.1";
const CLIENT_NAME = "my-navidrome-output-server";

function normalizeServerUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function readConfiguration(environment) {
  const serverUrl = normalizeServerUrl(environment.MY_NAVIDROME_URL);
  const username = String(environment.MY_NAVIDROME_USERNAME || "");
  const password = String(environment.MY_NAVIDROME_PASSWORD || "");
  const apiKey = String(environment.MY_NAVIDROME_API_KEY || "");
  const auth = apiKey
    ? { type: "apiKey", apiKey }
    : username && password ? { type: "password", username, password } : undefined;
  return { serverUrl, auth };
}

function buildAuthParams(auth) {
  const common = { v: SUBSONIC_VERSION, c: CLIENT_NAME, f: "json" };
  if (auth.type === "apiKey") return { ...common, apiKey: auth.apiKey };
  const salt = crypto.randomBytes(12).toString("hex");
  const token = crypto.createHash("md5").update(`${auth.password}${salt}`).digest("hex");
  return { ...common, u: auth.username, s: salt, t: token };
}

function streamUrl(config, trackId) {
  if (!config.serverUrl || !config.auth) throw new Error("Output server is not configured for Navidrome");
  const url = new URL(`${config.serverUrl}/rest/stream.view`);
  const params = { ...buildAuthParams(config.auth), id: trackId };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

module.exports = {
  buildAuthParams,
  normalizeServerUrl,
  readConfiguration,
  streamUrl,
};
