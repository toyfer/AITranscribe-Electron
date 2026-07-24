const { contextBridge, ipcRenderer } = require("electron");

/**
 * IMPORTANT (sandbox: true):
 * Sandboxed preload can only require('electron') and a few built-ins.
 * Do NOT require('./shared/channels') or other app files here — the preload
 * script fails silently and window.electronAPI never gets exposed, so the
 * file picker and all IPC appear broken.
 *
 * Keep these strings in sync with src/shared/channels.js (main process).
 */
const DIALOG_OPEN_FILE = "dialog:openFile";
const EXECUTE_RUN_FFMPEG = "execute:runFFmpeg";
const EXECUTE_RUN_WHISPER = "execute:runWhisper";
const RETURN_COMMAND = "return:Command";
const PROCESS_MESSAGE = "process:Message";

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke(DIALOG_OPEN_FILE),
  runFFmpeg: (args) => ipcRenderer.send(EXECUTE_RUN_FFMPEG, args),
  // main 内で FFmpeg 完了後に Whisper へ進むため、renderer からは未使用
  runWhisper: (args) => ipcRenderer.send(EXECUTE_RUN_WHISPER, args),
  returnCommand: (callback) => ipcRenderer.on(RETURN_COMMAND, callback),
  processMessage: (callback) => ipcRenderer.on(PROCESS_MESSAGE, callback),
});
