const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  runFFmpeg: (args) => ipcRenderer.send("execute:runFFmpeg", args),
  // main 内で FFmpeg 完了後に Whisper へ進むため、renderer からは未使用
  runWhisper: (args) => ipcRenderer.send("execute:runWhisper", args),
  returnCommand: (output) => ipcRenderer.on("return:Command", output),
  processMessage: (message) => ipcRenderer.on("process:Message", message),
});
