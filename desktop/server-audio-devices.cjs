const {
  listOutputDevices: listCoreAudioDevices,
  selectOutputDevice: selectCoreAudioDevice,
} = require("./coreaudio.cjs");

const SYSTEM_DEFAULT_DEVICE = {
  deviceId: "system-default",
  label: "Server system default",
  selected: true,
};

function createServerAudioDeviceAdapter(platform = process.platform) {
  if (platform === "darwin") {
    return {
      platform,
      backend: "coreaudio",
      canSelect: true,
      list: listCoreAudioDevices,
      select: selectCoreAudioDevice,
    };
  }
  return {
    platform,
    backend: platform === "win32" ? "wasapi-pending" : "pipewire-pending",
    canSelect: false,
    async list() {
      return [SYSTEM_DEFAULT_DEVICE];
    },
    async select(deviceId) {
      if (deviceId && deviceId !== SYSTEM_DEFAULT_DEVICE.deviceId) {
        throw new Error(`Per-device server output is not available on ${platform} yet`);
      }
      return [SYSTEM_DEFAULT_DEVICE];
    },
  };
}

module.exports = {
  SYSTEM_DEFAULT_DEVICE,
  createServerAudioDeviceAdapter,
};
