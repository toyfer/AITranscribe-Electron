const { contextBridge, ipcRenderer } = require("electron");
const { CHANNELS } = require("./shared/channels");

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke(CHANNELS.DIALOG_OPEN_FILE),
  runFFmpeg: (args) => ipcRenderer.send(CHANNELS.EXECUTE_RUN_FFMPEG, args),
  // main 内で FFmpeg 完了後に Whisper へ進むため、renderer からは未使用
  runWhisper: (args) => ipcRenderer.send(CHANNELS.EXECUTE_RUN_WHISPER, args),
  returnCommand: (output) => ipcRenderer.on(CHANNELS.RETURN_COMMAND, output),
  processMessage: (message) => ipcRenderer.on(CHANNELS.PROCESS_MESSAGE, message),
});
