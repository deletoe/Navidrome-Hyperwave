import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

async function hiddenPrompt(prompt) {
  if (!stdin.isTTY || !stdout.isTTY) return "";
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const handleData = (character) => {
      if (character === "\u0003") {
        stdin.setRawMode(false);
        stdout.write("\n");
        process.exit(130);
      }
      if (character === "\r" || character === "\n") {
        stdin.off("data", handleData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (character === "\u007f") {
        value = value.slice(0, -1);
        return;
      }
      if (character >= " ") value += character;
    };
    stdin.on("data", handleData);
  });
}

const environment = { ...process.env };
const passwordAuthIncomplete = !environment.MY_NAVIDROME_API_KEY
  && (!environment.MY_NAVIDROME_USERNAME || !environment.MY_NAVIDROME_PASSWORD);
if (stdin.isTTY && (!environment.MY_NAVIDROME_URL || passwordAuthIncomplete)) {
  const lines = createInterface({ input: stdin, output: stdout });
  if (!environment.MY_NAVIDROME_URL) {
    environment.MY_NAVIDROME_URL = (await lines.question("Navidrome server URL: ")).trim();
  }
  if (!environment.MY_NAVIDROME_API_KEY) {
    if (!environment.MY_NAVIDROME_USERNAME) {
      environment.MY_NAVIDROME_USERNAME = (await lines.question("Navidrome username: ")).trim();
    }
    lines.close();
    if (!environment.MY_NAVIDROME_PASSWORD) {
      environment.MY_NAVIDROME_PASSWORD = await hiddenPrompt("Navidrome password (not saved): ");
    }
  } else {
    lines.close();
  }
}

const electron = spawn("./node_modules/.bin/electron", ["desktop/output-server-main.cjs"], {
  cwd: new URL("../", import.meta.url),
  env: environment,
  stdio: "inherit",
});

electron.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => electron.kill(signal));
}
