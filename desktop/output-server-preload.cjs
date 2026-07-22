const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("outputServer", Object.freeze({
  onCommand(callback) {
    if (typeof callback !== "function") return () => undefined;
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("output-server:command", listener);
    return () => ipcRenderer.removeListener("output-server:command", listener);
  },
  ready() {
    ipcRenderer.send("output-server:ready");
  },
  publishState(state) {
    ipcRenderer.send("output-server:state", state);
  },
  publishDevices(devices) {
    ipcRenderer.send("output-server:devices", devices);
  },
}));
