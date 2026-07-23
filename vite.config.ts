import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const outputProxyTarget = process.env.MY_NAVIDROME_OUTPUT_PROXY;

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: outputProxyTarget ? {
      "/api/audio": {
        target: outputProxyTarget,
      },
      "/api/bootstrap": {
        target: outputProxyTarget,
      },
      "/audio-control": {
        target: outputProxyTarget,
        ws: true,
      },
      "/navidrome": {
        target: outputProxyTarget,
      },
    } : undefined,
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/docs/requirements.md"],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    css: true,
  },
});
