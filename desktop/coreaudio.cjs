const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const sourcePath = path.join(__dirname, "coreaudio-helper.swift");
const cacheDirectory = path.join(os.homedir(), "Library", "Caches", "MyNavidromeOutputServer");
const binaryPath = path.join(cacheDirectory, "coreaudio-helper");

async function ensureHelper() {
  fs.mkdirSync(cacheDirectory, { recursive: true });
  const sourceModified = fs.statSync(sourcePath).mtimeMs;
  const binaryModified = fs.existsSync(binaryPath) ? fs.statSync(binaryPath).mtimeMs : 0;
  if (binaryModified >= sourceModified) return binaryPath;
  await execFileAsync("xcrun", ["swiftc", "-O", sourcePath, "-o", binaryPath], {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
  return binaryPath;
}

async function runHelper(arguments_) {
  const executable = await ensureHelper();
  const { stdout } = await execFileAsync(executable, arguments_, {
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  const devices = JSON.parse(stdout || "[]");
  return Array.isArray(devices) ? devices : [];
}

async function listOutputDevices() {
  return runHelper(["list"]);
}

async function selectOutputDevice(deviceId) {
  if (!deviceId) return listOutputDevices();
  return runHelper(["set", deviceId]);
}

module.exports = {
  binaryPath,
  ensureHelper,
  listOutputDevices,
  selectOutputDevice,
};
