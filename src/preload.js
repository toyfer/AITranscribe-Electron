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
const DIALOG_OPEN_CSV = "dialog:openCsv";
const DIALOG_SAVE_DOCX = "dialog:saveDocx";
const LIST_LLMS = "llm:listModels";
const EXECUTE_RUN_FFMPEG = "execute:runFFmpeg";
const EXECUTE_RUN_WHISPER = "execute:runWhisper";
const EXECUTE_RUN_SUMMARIZE = "execute:runSummarize";
const RETURN_COMMAND = "return:Command";
const RETURN_SUMMARY = "return:Summary";
const PROCESS_MESSAGE = "process:Message";
const PROCESS_PROGRESS = "process:Progress";
const PROCESS_SUMMARY = "process:Summary";

contextBridge.exposeInMainWorld("electronAPI", {
  openFile: () => ipcRenderer.invoke(DIALOG_OPEN_FILE),
  /** Open file dialog limited to .csv. */
  openCsv: () => ipcRenderer.invoke(DIALOG_OPEN_CSV),
  /** Open save-as dialog for .docx output. */
  saveDocx: (defaultName) => ipcRenderer.invoke(DIALOG_SAVE_DOCX, defaultName),
  /** List available GGUF models. Returns [{ name, path, sizeMB }]. */
  listLlms: () => ipcRenderer.invoke(LIST_LLMS),
  runFFmpeg: (args) => ipcRenderer.send(EXECUTE_RUN_FFMPEG, args),
  // main 内で FFmpeg 完了後に Whisper へ進むため、renderer からは未使用
  runWhisper: (args) => ipcRenderer.send(EXECUTE_RUN_WHISPER, args),
  /** Start summarize job. args = { csvPath, outputPath, type, options }. */
  runSummarize: (args) => ipcRenderer.send(EXECUTE_RUN_SUMMARIZE, args),
  returnCommand: (callback) => ipcRenderer.on(RETURN_COMMAND, callback),
  /** llama-cli stdout lines for the summarize job. */
  returnSummary: (callback) => ipcRenderer.on(RETURN_SUMMARY, callback),
  processMessage: (callback) => ipcRenderer.on(PROCESS_MESSAGE, callback),
  /** Measured progress / phase / timing (object from main). */
  processProgress: (callback) => ipcRenderer.on(PROCESS_PROGRESS, callback),
  /** Structured progress for summarize (object from main). */
  processSummary: (callback) => ipcRenderer.on(PROCESS_SUMMARY, callback),
});
