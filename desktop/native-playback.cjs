const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const sourcePath = path.join(__dirname, "native-playback-helper.swift");
const cacheDirectory = path.join(os.homedir(), "Library", "Caches", "MyNavidromeOutputServer");
const binaryPath = path.join(cacheDirectory, "native-playback-helper");

async function ensureNativePlaybackHelper() {
  if (process.platform !== "darwin") {
    throw new Error(`The native playback helper is not implemented for ${process.platform} yet`);
  }
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const sourceModified = fs.statSync(sourcePath).mtimeMs;
  const binaryModified = fs.existsSync(binaryPath) ? fs.statSync(binaryPath).mtimeMs : 0;
  if (binaryModified >= sourceModified) return binaryPath;
  await execFileAsync("xcrun", ["swiftc", "-O", sourcePath, "-o", binaryPath], {
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return binaryPath;
}

module.exports = {
  binaryPath,
  ensureNativePlaybackHelper,
};
