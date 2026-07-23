import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url);
const host = process.env.MY_NAVIDROME_DEV_HOST || "127.0.0.1";
const frontendPort = Math.max(1, Number(process.env.MY_NAVIDROME_DEV_PORT) || 5173);
const outputPort = Math.max(1, Number(process.env.MY_NAVIDROME_DEV_OUTPUT_PORT) || 5174);
const outputTarget = `http://127.0.0.1:${outputPort}`;

const outputRenderer = spawn(
  "./node_modules/.bin/electron",
  ["desktop/output-server-main.cjs"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      MY_NAVIDROME_OUTPUT_PORT: String(outputPort),
    },
  },
);

const vite = spawn(
  "./node_modules/.bin/vite",
  ["--host", host, "--port", String(frontendPort), "--strictPort"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      MY_NAVIDROME_OUTPUT_PROXY: outputTarget,
    },
  },
);

let shuttingDown = false;

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  vite.kill("SIGTERM");
  outputRenderer.kill("SIGTERM");
  process.exitCode = exitCode;
}

vite.on("exit", (code, signal) => {
  if (shuttingDown) return;
  if (signal) stop(0);
  else stop(code ?? 1);
});

outputRenderer.on("exit", (code, signal) => {
  if (shuttingDown) return;
  if (signal) stop(0);
  else stop(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stop(0));
}
