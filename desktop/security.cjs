const WEB_PROTOCOLS = new Set(["http:", "https:"]);

function isAllowedAppNavigation(target, appUrl, devServerUrl) {
  try {
    const targetUrl = new URL(target);
    if (devServerUrl && targetUrl.origin === new URL(devServerUrl).origin) return true;
    if (appUrl && targetUrl.href === appUrl) return true;
    return targetUrl.protocol === "file:" && appUrl?.startsWith("file:");
  } catch {
    return false;
  }
}

function isSafeExternalUrl(target) {
  try {
    return WEB_PROTOCOLS.has(new URL(target).protocol);
  } catch {
    return false;
  }
}

function withDesktopCorsHeaders(responseHeaders = {}) {
  const headers = { ...responseHeaders };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase().startsWith("access-control-")) delete headers[key];
  }
  headers["Access-Control-Allow-Origin"] = ["*"];
  headers["Access-Control-Allow-Headers"] = ["Accept, Content-Type, Range"];
  headers["Access-Control-Expose-Headers"] = [
    "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  ];
  return headers;
}

module.exports = {
  isAllowedAppNavigation,
  isSafeExternalUrl,
  withDesktopCorsHeaders,
};
