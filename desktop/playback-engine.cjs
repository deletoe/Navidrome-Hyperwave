const { NativePlaybackEngine } = require("./native-playback-engine.cjs");

function createPlaybackEngine(options, platform = process.platform) {
  if (platform === "darwin") return new NativePlaybackEngine(options);
  throw new Error(
    `No lightweight playback engine is registered for ${platform}. `
    + "Add a platform adapter without changing the WebSocket playback protocol.",
  );
}

module.exports = { createPlaybackEngine };
