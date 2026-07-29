/**
 * IPC channel names — single source of truth for the **main** process.
 *
 * Renderer talks only via preload's electronAPI.
 * Sandboxed preload MUST NOT require this file (only `require('electron')` works).
 * Keep string values in sync with the constants in src/preload.js.
 *
 * Phase 2: string literals centralized; wire protocol unchanged.
 * Measured progress: PROCESS_PROGRESS added for structured job updates.
 * Summarize feature: SUMMARY_* channels added (CSV → docx).
 * Model selector: LIST_LLMS added for GGUF model discovery.
 * BrowserWindow split: OPEN_SUMMARIZE_WINDOW added for transcribe → summarize
 * window handoff. Per-window routing ensures transcribe events do not
 * leak into the summarize window and vice versa.
 *
 * NOTE: EXECUTE_RUN_WHISPER is defined for forward compatibility but is
 * NOT handled by main.js — Whisper is invoked by TranscribeJob internally
 * after FFmpeg completes. Calling window.electronAPI.runWhisper() from the
 * renderer will send a message that no handler listens to (silent no-op).
 */
const CHANNELS = Object.freeze({
  // renderer → main (invoke / handle)
  DIALOG_OPEN_FILE: "dialog:openFile",
  /** Open file dialog limited to .csv (for summarization). */
  DIALOG_OPEN_CSV: "dialog:openCsv",
  /** Open save-as dialog for .docx output. */
  DIALOG_SAVE_DOCX: "dialog:saveDocx",
  /** List available GGUF models under Whisper/models/llm/. */
  LIST_LLMS: "llm:listModels",
  /**
   * Request main to open (or focus) the dedicated Summarize-Suppoter
   * BrowserWindow. Called by the transcribe window's header link.
   */
  OPEN_SUMMARIZE_WINDOW: "window:openSummarize",

  // renderer → main (send / on)
  EXECUTE_RUN_FFMPEG: "execute:runFFmpeg",
  /**
   * UNUSED — defined for forward compatibility only.
   * Main invokes Whisper internally after FFmpeg completes (see TranscribeJob).
   * No ipcMain.on() handler exists for this channel.
   */
  EXECUTE_RUN_WHISPER: "execute:runWhisper",
  /** Start summarize job (CSV → LLM → docx). */
  EXECUTE_RUN_SUMMARIZE: "execute:runSummarize",

  // main → renderer (send / on)
  RETURN_COMMAND: "return:Command",
  /** Log lines for summarize (llama-cli stdout). */
  RETURN_SUMMARY: "return:Summary",
  PROCESS_MESSAGE: "process:Message",
  /** Structured progress / timing (object payload). */
  PROCESS_PROGRESS: "process:Progress",
  /** Structured progress for summarize (llama-cli token progress). */
  PROCESS_SUMMARY: "process:Summary",
});

module.exports = { CHANNELS };
