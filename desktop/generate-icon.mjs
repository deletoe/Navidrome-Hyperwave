import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "build", "icon.svg");
const destination = path.join(root, "build", "icon.icns");
const workspace = await mkdtemp(path.join(tmpdir(), "my-navidrome-icon-"));
const iconset = path.join(workspace, "icon.iconset");
const sourcePng = path.join(workspace, "icon.png");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

try {
  await mkdir(iconset, { recursive: true });
  await run("sips", ["-s", "format", "png", source, "--out", sourcePng]);
  const variants = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];
  for (const [size, filename] of variants) {
    await run("sips", ["-z", String(size), String(size), sourcePng, "--out", path.join(iconset, filename)]);
  }
  await run("iconutil", ["-c", "icns", iconset, "-o", destination]);
  console.log(`Generated ${destination}`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
