/**
 * WindowManager — owns BrowserWindow references and routes IPC sends.
 *
 * Why: Previously, all IPC `send*()` helpers targeted a single `mainWindow`,
 * which was fine while the renderer was a single page. After splitting the
 * summarize feature into a separate BrowserWindow, the transcribe window
 * must receive only transcribe-related events and the summarize window
 * must receive only summarize-related events. This module is the single
 * source of truth for which window is which, and exposes per-window
 * send helpers that the job classes call into.
 *
 * IPC routing rules:
 *   - EXECUTE_RUN_FFMPEG  -> only the transcribe window can send it;
 *                            progress/log output goes back to the SAME
 *                            webContents that initiated the job.
 *   - EXECUTE_RUN_SUMMARIZE -> only the summarize window can send it;
 *                             output goes back to the same webContents.
 *   - dialog:* (invoke/handle) — routed via `event.sender` so the dialog
 *     parent is the requesting window.
 */
const { BrowserWindow } = require("electron");

class WindowManager {
  constructor() {
    /** @type {BrowserWindow|null} */
    this.transcribeWindow = null;
    /** @type {BrowserWindow|null} */
    this.summarizeWindow = null;
  }

  /**
   * Register a window. `role` is the routing key used by send helpers.
   * Returns the created BrowserWindow.
   */
  register(role, options, htmlFile) {
    const win = new BrowserWindow({
      width: options.width || 1280,
      height: options.height || 800,
      minWidth: options.minWidth || 960,
      minHeight: options.minHeight || 640,
      resizable: true,
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        additionalArguments: options.additionalArguments || [],
      },
    });
    win.loadFile(htmlFile);
    if (role === "transcribe") this.transcribeWindow = win;
    else if (role === "summarize") this.summarizeWindow = win;

    // Auto-unregister on close so we never send to a destroyed window.
    win.on("closed", () => {
      if (role === "transcribe" && this.transcribeWindow === win) {
        this.transcribeWindow = null;
      }
      if (role === "summarize" && this.summarizeWindow === win) {
        this.summarizeWindow = null;
      }
    });

    return win;
  }

  /**
   * Resolve a BrowserWindow from an `event.sender` (the webContents that
   * initiated an IPC). Returns the window that should receive replies
   * for this job, or null if the window is gone.
   */
  resolveFromEvent(event) {
    const wc = event && event.sender;
    if (!wc) return null;
    for (const w of [this.transcribeWindow, this.summarizeWindow]) {
      if (w && !w.isDestroyed() && w.webContents === wc) return w;
    }
    return null;
  }

  /**
   * Find the role of a given webContents.
   * @returns {"transcribe"|"summarize"|null}
   */
  roleOf(win) {
    if (win === this.transcribeWindow) return "transcribe";
    if (win === this.summarizeWindow) return "summarize";
    return null;
  }

  /**
   * Send a transcribe-related event to the transcribe window.
   * @param {string} channel
   * @param {*} payload
   */
  sendTranscribe(channel, payload) {
    const w = this.transcribeWindow;
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  /**
   * Send a summarize-related event to the summarize window.
   * @param {string} channel
   * @param {*} payload
   */
  sendSummarize(channel, payload) {
    const w = this.summarizeWindow;
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload);
    }
  }

  /**
   * Set taskbar progress for the transcribe window only.
   * (Summarize does not drive the taskbar because it is a long CPU job
   * that is not as time-critical as audio transcription.)
   */
  setTranscribeProgressBar(fraction) {
    const w = this.transcribeWindow;
    if (w && !w.isDestroyed()) {
      if (fraction == null) w.setProgressBar(-1);
      else w.setProgressBar(Math.max(0, Math.min(1, fraction)));
    }
  }

  /**
   * Open (or focus existing) summarize window. Returns the BrowserWindow.
   * Called from the main process when a renderer requests it via IPC.
   */
  openSummarizeWindow(preloadPath) {
    if (this.summarizeWindow && !this.summarizeWindow.isDestroyed()) {
      this.summarizeWindow.focus();
      return this.summarizeWindow;
    }
    return this.register(
      "summarize",
      {
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 640,
        preload: preloadPath,
      },
      require("path").join(__dirname, "..", "Summarize-Suppoter", "Summarize-Suppoter.html")
    );
  }

  /**
   * Broadcast a process:Message to BOTH windows (e.g. system startup
   * notice). Used only for truly global messages.
   */
  broadcastProcessMessage(message) {
    for (const w of [this.transcribeWindow, this.summarizeWindow]) {
      if (w && !w.isDestroyed()) {
        w.webContents.send("process:Message", message);
        w.setProgressBar(-1);
      }
    }
  }

  /**
   * For the transcribe window: send a command output log line.
   */
  sendTranscribeCommand(message) {
    this.sendTranscribe("return:Command", message);
  }

  /**
   * For the summarize window: send a llama-cli log line.
   */
  sendSummarizeLog(message) {
    this.sendSummarize("return:Summary", message);
  }
}

module.exports = { WindowManager };
