const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const { CHANNELS } = require("./shared/channels");
const { RuntimeLayout } = require("./main/runtime");
const { TranscribeJob } = require("./main/jobs/transcribe");
const { getNow } = require("./main/utils/time");

// エアギャップ配布想定: FFmpeg / Python Embeddable / Faster-Whisper モデルは
// リポジトリに含めず、実行時に src/Whisper 配下へ配置する（README 参照）

let mainWindow;

const runtime = new RuntimeLayout(__dirname);

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

function sendProcessMessage(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.PROCESS_MESSAGE, message);
  }
}

function sendCommandOutput(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(CHANNELS.RETURN_COMMAND, message);
  }
}

const transcribeJob = new TranscribeJob({
  runtime,
  sendProcessMessage,
  sendCommandOutput,
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle(CHANNELS.DIALOG_OPEN_FILE, handleFileOpen);
  ipcMain.on(CHANNELS.EXECUTE_RUN_FFMPEG, (event, args) => {
    transcribeJob.start(event, args);
  });
  // runWhisper は FFmpeg 完了後に TranscribeJob 内から呼ぶ（preload の runWhisper は未使用）
  createWindow();

  mainWindow.webContents.once("did-finish-load", () => {
    const { missing } = runtime.checkRuntimeLayout();
    sendProcessMessage(`[${getNow()}:System]システムを起動しました`);
    if (missing.length > 0) {
      sendCommandOutput(
        `[${getNow()}:System]エアギャップ用ランタイム未配置:\n- ${missing.join("\n- ")}\nREADME の配置手順を確認してください。`
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
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "wma", "mp4", "mkv"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
}
