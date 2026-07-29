const { contextBridge, ipcRenderer } = require("electron");

/**
 * IMPORTANT (sandbox: true):
 * Sandboxed preload can only require('electron') and a few built-ins.
 * Do NOT require('./shared/channels') or other app files here — the preload
 * script fails silently and window.electronAPI never gets exposed, so the
 * file picker and all IPC appear broken.
 *
 * Keep these strings in sync with src/shared/channels.js (main process).
 *
 * NOTE: EXECUTE_RUN_WHISPER (runWhisper) is exposed for forward compatibility
 * but is NOT handled by main.js — see channels.js for details.
 * Calling window.electronAPI.runWhisper() is a silent no-op.
 */
const DIALOG_OPEN_FILE = "dialog:openFile";
const DIALOG_OPEN_CSV = "dialog:openCsv";
const DIALOG_SAVE_DOCX = "dialog:saveDocx";
const LIST_LLMS = "llm:listModels";
const OPEN_SUMMARIZE_WINDOW = "window:openSummarize";
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
  /**
   * Request main to open the dedicated Summarize-Suppoter BrowserWindow.
   * Returns true if a new window was created, false if an existing one
   * was focused. The transcribe window calls this from its header link.
   */
  openSummarizeWindow: () => ipcRenderer.invoke(OPEN_SUMMARIZE_WINDOW),
  runFFmpeg: (args) => ipcRenderer.send(EXECUTE_RUN_FFMPEG, args),
  /** UNUSED — no ipcMain handler. Main invokes Whisper after FFmpeg internally. */
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
