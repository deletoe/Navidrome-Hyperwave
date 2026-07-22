import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url);
const devUrl = "http://127.0.0.1:5173";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const vite = spawn(npmCommand, ["run", "dev"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

async function waitForVite() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (vite.exitCode !== null) throw new Error("Vite exited before the desktop app could start");
    try {
      const response = await fetch(devUrl);
      if (response.ok) return;
    } catch {
      // The local development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${devUrl}`);
}

let electron;
try {
  await waitForVite();
  electron = spawn("./node_modules/.bin/electron", ["."], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MY_NAVIDROME_DEV_SERVER_URL: devUrl },
  });
  electron.on("exit", (code) => {
    vite.kill("SIGTERM");
    process.exitCode = code ?? 0;
  });
} catch (error) {
  console.error(error);
  vite.kill("SIGTERM");
  process.exitCode = 1;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    electron?.kill(signal);
    vite.kill(signal);
  });
}
