const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require("electron");
const path = require("path");
const { CHANNELS } = require("./shared/channels");
const { RuntimeLayout } = require("./main/runtime");
const { TranscribeJob } = require("./main/jobs/transcribe");
const { SummarizeJob } = require("./main/jobs/summarize");
const { getNow } = require("./main/utils/time");
const { WindowManager } = require("./main/window-manager");

// エアギャップ配布想定: FFmpeg / Python Embeddable / Faster-Whisper モデルは
// リポジトリに含めず、実行時に src/Whisper 配下に配置する（README 参照）
// llama-cli / GGUF モデルも同様（手動配置・要約機能を使う場合のみ必要）

const runtime = new RuntimeLayout(__dirname);
const windows = new WindowManager();

const PRELOAD_PATH = path.join(__dirname, "preload.js");

// Build the per-window send helpers. Job classes only know about these
// functions, not about the WindowManager directly. The helpers route
// to the correct webContents (transcribe vs summarize) and never cross.
const sendTranscribeMessage = (m) => {
  windows.sendTranscribe(CHANNELS.PROCESS_MESSAGE, m);
  windows.setTranscribeProgressBar(-1);
};
const sendTranscribeCommand = (m) => {
  windows.sendTranscribeCommand(m);
};
const sendTranscribeProgress = (payload) => {
  windows.sendTranscribe(CHANNELS.PROCESS_PROGRESS, payload);
  if (payload && payload.pct != null && typeof payload.pct === "number") {
    windows.setTranscribeProgressBar(payload.pct / 100);
  }
};
const sendSummarizeMessage = (m) => {
  windows.sendSummarize(CHANNELS.PROCESS_MESSAGE, m);
};
const sendSummarizeLog = (m) => {
  windows.sendSummarizeLog(m);
};
const sendSummarizeProgress = (payload) => {
  windows.sendSummarize(CHANNELS.PROCESS_SUMMARY, payload);
};

const transcribeJob = new TranscribeJob({
  runtime,
  sendProcessMessage: sendTranscribeMessage,
  sendCommandOutput: sendTranscribeCommand,
  sendProgress: sendTranscribeProgress,
});

const summarizeJob = new SummarizeJob({
  runtime,
  sendProcessMessage: sendSummarizeMessage,
  sendLog: sendSummarizeLog,
  sendProgress: sendSummarizeProgress,
});

function createTranscribeWindow() {
  return windows.register(
    "transcribe",
    {
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 640,
      preload: PRELOAD_PATH,
    },
    path.join(__dirname, "index.html")
  );
}

// Notification API のパーミッションを明示的に許可 (B1 対策)
// file:// プロトコルでは既定で許可される場合もあるが、
// エアギャップ環境で通知が届かない事態を防ぐため明示的に設定する
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "notifications") return callback(true);
    callback(false);
  });
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // ─── dialog:* — route via event.sender so the parent window matches ───
  ipcMain.handle(CHANNELS.DIALOG_OPEN_FILE, handleFileOpen);
  ipcMain.handle(CHANNELS.DIALOG_OPEN_CSV, handleCsvOpen);
  ipcMain.handle(CHANNELS.DIALOG_SAVE_DOCX, handleDocxSave);
  ipcMain.handle(CHANNELS.LIST_LLMS, handleListLlms);

  // ─── Open summarize window — called from the transcribe window ───
  ipcMain.handle(CHANNELS.OPEN_SUMMARIZE_WINDOW, () => {
    return windows.openSummarizeWindow(PRELOAD_PATH) ? true : false;
  });

  // ─── Job dispatch ───
  // The job class uses `event.sender` to know which webContents initiated
  // the request. The WindowManager routes the resulting sends back to
  // that same webContents, so transcribe events only reach the transcribe
  // window and summarize events only reach the summarize window.
  ipcMain.on(CHANNELS.EXECUTE_RUN_FFMPEG, (event, args) => {
    transcribeJob.start(event, args);
  });
  // runWhisper is unused on the renderer side; main runs Whisper after FFmpeg.
  ipcMain.on(CHANNELS.EXECUTE_RUN_SUMMARIZE, (event, args) => {
    summarizeJob.start(event, args);
  });

  // Create the initial transcribe window.
  const tw = createTranscribeWindow();

  tw.webContents.once("did-finish-load", () => {
    const { missing, llamaMissing } = runtime.checkRuntimeLayout();
    sendTranscribeMessage(`[${getNow()}:System]システムを起動しました`);
    if (missing.length > 0) {
      sendTranscribeCommand(
        `[${getNow()}:System]エアギャップ用ランタイム未配置:\n- ${missing.join("\n- ")}\nREADME の配置手順を確認してください。`
      );
    }
    if (llamaMissing.length > 0) {
      // Broadcast to BOTH windows because the user might already have
      // the summarize window open.
      windows.broadcastProcessMessage(
        `[${getNow()}:System]要約機能を使うには追加配置が必要:\n- ${llamaMissing.join("\n- ")}`
      );
    }
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createTranscribeWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// ─── Dialog handlers — use event.sender as the parent window ───

async function handleFileOpen(event) {
  return handleAnyFileOpen(event, {
    title: "音声ファイルを選択",
    filters: [
      {
        name: "Audio",
        extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "wma", "mp4", "mkv"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
}

async function handleCsvOpen(event) {
  return handleAnyFileOpen(event, {
    title: "CSVファイルを選択",
    filters: [
      { name: "CSV (Whisper output)", extensions: ["csv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
}

async function handleAnyFileOpen(event, opts) {
  const browserWindow = windows.resolveFromEvent(event);
  const dialogOpts = {
    title: opts.title,
    properties: ["openFile"],
    filters: opts.filters,
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts);
  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

async function handleDocxSave(event, defaultName) {
  const browserWindow = windows.resolveFromEvent(event);
  const base = (defaultName && String(defaultName).trim()) || "summary.docx";
  const safe = base.toLowerCase().endsWith(".docx") ? base : `${base}.docx`;
  const dialogOpts = {
    title: "要約の保存先を選択",
    defaultPath: safe,
    filters: [
      { name: "Word Document", extensions: ["docx"] },
      { name: "All Files", extensions: ["*"] },
    ],
  };
  const result = browserWindow
    ? await dialog.showSaveDialog(browserWindow, dialogOpts)
    : await dialog.showSaveDialog(dialogOpts);
  if (result.canceled || !result.filePath) return null;
  let p = result.filePath;
  if (!/\.docx$/i.test(p)) p += ".docx";
  return p;
}

/**
 * List all GGUF models under Whisper/models/llm/.
 * Returns [{ name, path, sizeMB }] for the model selector dropdown.
 * @param {_event} _event - IPC event object (unused but required by ipcMain.handle signature)
 */
function handleListLlms(_event) {
  return runtime.listGgufModels();
}
