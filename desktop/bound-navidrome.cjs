const crypto = require("node:crypto");
const { Readable } = require("node:stream");

function argumentValue(arguments_, name) {
  const inline = arguments_.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function parseBoundNavidrome(arguments_ = process.argv.slice(2), environment = process.env) {
  const input = argumentValue(arguments_, "--navidrome-login") || environment.MY_NAVIDROME_LOGIN;
  if (!input) return undefined;
  let loginUrl;
  try {
    loginUrl = new URL(input);
  } catch {
    throw new Error("--navidrome-login must be an HTTP URL containing username and password");
  }
  if (!["http:", "https:"].includes(loginUrl.protocol)) {
    throw new Error("--navidrome-login must use http:// or https://");
  }
  const username = decodeURIComponent(loginUrl.username);
  const password = decodeURIComponent(loginUrl.password);
  if (!username || !password) {
    throw new Error("--navidrome-login must include both username and password in the URL");
  }
  loginUrl.username = "";
  loginUrl.password = "";
  loginUrl.search = "";
  loginUrl.hash = "";
  loginUrl.pathname = loginUrl.pathname.replace(/\/+$/, "");
  return {
    serverUrl: loginUrl.toString().replace(/\/$/, ""),
    username,
    password,
    proxyToken: crypto.randomBytes(24).toString("hex"),
  };
}

function bootstrapPayload(config, request) {
  if (!config) return { configured: false };
  const host = request.headers.host || "127.0.0.1:5173";
  return {
    configured: true,
    connection: {
      serverUrl: `http://${host}/navidrome`,
      auth: { type: "apiKey", apiKey: config.proxyToken },
    },
  };
}

function upstreamUrl(config, requestUrl) {
  const incoming = new URL(requestUrl, "http://localhost");
  if (!incoming.pathname.startsWith("/navidrome/rest/")) return undefined;
  if (incoming.searchParams.get("apiKey") !== config.proxyToken) return undefined;
  incoming.searchParams.delete("apiKey");
  for (const name of ["u", "p", "t", "s"]) incoming.searchParams.delete(name);
  const salt = crypto.randomBytes(12).toString("hex");
  incoming.searchParams.set("u", config.username);
  incoming.searchParams.set("s", salt);
  incoming.searchParams.set("t", crypto.createHash("md5").update(`${config.password}${salt}`).digest("hex"));
  incoming.searchParams.set("v", incoming.searchParams.get("v") || "1.16.1");
  incoming.searchParams.set("c", incoming.searchParams.get("c") || "my-navidrome-5-6");
  incoming.searchParams.set("f", incoming.searchParams.get("f") || "json");
  const upstream = new URL(config.serverUrl);
  upstream.pathname = `${upstream.pathname.replace(/\/+$/, "")}${incoming.pathname.slice("/navidrome".length)}`;
  upstream.search = incoming.search;
  return upstream;
}

async function proxyNavidromeRequest(config, request, response) {
  const target = upstreamUrl(config, request.url || "/");
  if (!target) {
    response.writeHead(403, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const headers = { Accept: request.headers.accept || "*/*" };
  if (request.headers.range) headers.Range = request.headers.range;
  const upstreamResponse = await fetch(target, {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "manual",
  });
  const responseHeaders = { "Cache-Control": "private, no-store" };
  for (const name of [
    "accept-ranges",
    "content-disposition",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = upstreamResponse.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  response.writeHead(upstreamResponse.status, responseHeaders);
  if (request.method === "HEAD" || !upstreamResponse.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstreamResponse.body).pipe(response);
}

module.exports = {
  bootstrapPayload,
  parseBoundNavidrome,
  proxyNavidromeRequest,
  upstreamUrl,
};
