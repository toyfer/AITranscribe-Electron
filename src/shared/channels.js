/**
 * IPC channel names — single source of truth for the **main** process.
 *
 * Renderer talks only via preload's electronAPI.
 * Sandboxed preload MUST NOT require this file (only `require('electron')` works).
 * Keep string values in sync with the constants in src/preload.js.
 *
 * Phase 2: string literals centralized; wire protocol unchanged.
 */
const CHANNELS = Object.freeze({
  // renderer → main (invoke / handle)
  DIALOG_OPEN_FILE: "dialog:openFile",

  // renderer → main (send / on)
  EXECUTE_RUN_FFMPEG: "execute:runFFmpeg",
  /** Exposed on preload for compatibility; main runs Whisper after FFmpeg. */
  EXECUTE_RUN_WHISPER: "execute:runWhisper",

  // main → renderer (send / on)
  RETURN_COMMAND: "return:Command",
  PROCESS_MESSAGE: "process:Message",
});

module.exports = { CHANNELS };
