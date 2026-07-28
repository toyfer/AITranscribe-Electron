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
 */
const CHANNELS = Object.freeze({
  // renderer → main (invoke / handle)
  DIALOG_OPEN_FILE: "dialog:openFile",
  /** Open file dialog limited to .csv (for summarization). */
  DIALOG_OPEN_CSV: "dialog:openCsv",
  /** Open save-as dialog for .docx output. */
  DIALOG_SAVE_DOCX: "dialog:saveDocx",
  /** List available GGUF models under Whisper/models/llm/. */
  LIST_LLMS: "dialog:listLlms",

  // renderer → main (send / on)
  EXECUTE_RUN_FFMPEG: "execute:runFFmpeg",
  /** Exposed on preload for compatibility; main runs Whisper after FFmpeg. */
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
