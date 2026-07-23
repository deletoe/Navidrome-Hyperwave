import { spawn } from "node:child_process";

const electron = spawn("./node_modules/.bin/electron", ["desktop/output-server-main.cjs"], {
  cwd: new URL("../", import.meta.url),
  env: process.env,
  stdio: "inherit",
});

electron.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => electron.kill(signal));
}
