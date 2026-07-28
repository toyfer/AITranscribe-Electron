const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { CHANNELS } = require("./shared/channels");
const { RuntimeLayout } = require("./main/runtime");
const { TranscribeJob } = require("./main/jobs/transcribe");
const { SummarizeJob } = require("./main/jobs/summarize");
const { getNow } = require("./main/utils/time");

// エアギャップ配布想定: FFmpeg / Python Embeddable / Faster-Whisper モデルは
// リポジトリに含めず、実行時に src/Whisper 配下に配置する（README 参照）
// llama-cli / GGUF モデルも同様（手動配置・要約機能を使う場合のみ必要）

let mainWindow;

const runtime = new RuntimeLayout(__dirname);

function createWindow() {
  mainWindow = new BrowserWindow({
    // 固定サイズ: リサイズによる UI 崩れを防ぐ
    // ログ・進捗が伸びてもウィンドウ内に収まるサイズに設計
    width: 800,
    height: 720,
    minWidth: 600,
    minHeight: 540,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true は維持。preload は electron のみ require すること（./shared 禁止）
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function sendProcessMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.PROCESS_MESSAGE, message);
    // Clear taskbar progress on any job completion (success or failure)
    mainWindow.setProgressBar(-1);
  }
}

function sendCommandOutput(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.RETURN_COMMAND, message);
  }
}

function sendProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.PROCESS_PROGRESS, payload);
    // Taskbar progress bar (0.0–1.0, -1 to clear)
    if (payload.pct != null && typeof payload.pct === "number") {
      mainWindow.setProgressBar(Math.max(0, Math.min(1, payload.pct / 100)));
    }
  }
}

function sendSummaryLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.RETURN_SUMMARY, message);
  }
}

function sendSummaryProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.PROCESS_SUMMARY, payload);
  }
}

const transcribeJob = new TranscribeJob({
  runtime,
  sendProcessMessage,
  sendCommandOutput,
  sendProgress,
});

const summarizeJob = new SummarizeJob({
  runtime,
  sendProcessMessage: sendProcessMessage,
  sendLog: sendSummaryLog,
  sendProgress: sendSummaryProgress,
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle(CHANNELS.DIALOG_OPEN_FILE, handleFileOpen);
  ipcMain.handle(CHANNELS.DIALOG_OPEN_CSV, handleCsvOpen);
  ipcMain.handle(CHANNELS.DIALOG_SAVE_DOCX, handleDocxSave);
  ipcMain.handle(CHANNELS.LIST_LLMS, handleListLlms);
  ipcMain.on(CHANNELS.EXECUTE_RUN_FFMPEG, (event, args) => {
    transcribeJob.start(event, args);
  });
  // runWhisper は FFmpeg 完了後に TranscribeJob 内から呼ぶ（preload の runWhisper は未使用）
  ipcMain.on(CHANNELS.EXECUTE_RUN_SUMMARIZE, (event, args) => {
    summarizeJob.start(event, args);
  });
  createWindow();

  mainWindow.webContents.once("did-finish-load", () => {
    const { missing, llamaMissing } = runtime.checkRuntimeLayout();
    sendProcessMessage(`[${getNow()}:System]システムを起動しました`);
    if (missing.length > 0) {
      sendCommandOutput(
        `[${getNow()}:System]エアギャップ用ランタイム未配置:\n- ${missing.join("\n- ")}\nREADME の配置手順を確認してください。`
      );
    }
    if (llamaMissing.length > 0) {
      sendProcessMessage(
        `[${getNow()}:System]要約機能を使うには追加配置が必要:\n- ${llamaMissing.join("\n- ")}`
      );
    }
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

async function handleFileOpen() {
  return handleAnyFileOpen({
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

async function handleCsvOpen() {
  return handleAnyFileOpen({
    title: "CSVファイルを選択",
    filters: [
      { name: "CSV (Whisper output)", extensions: ["csv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
}

async function handleAnyFileOpen(opts) {
  const browserWindow =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
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

async function handleDocxSave(_event, defaultName) {
  const browserWindow =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
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
