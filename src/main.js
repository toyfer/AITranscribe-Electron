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
      // sandbox: true は維持。preload は electron のみ require すること（./shared 禁止）
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
  const browserWindow =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();

  const dialogOpts = {
    title: "音声ファイルを選択",
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "wma", "mp4", "mkv"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  };

  // 親ウィンドウを渡すとモーダルになり、背面に隠れて「出ない」ように見える問題を防ぐ
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOpts)
    : await dialog.showOpenDialog(dialogOpts);

  const { canceled, filePaths } = result;
  if (!canceled && filePaths && filePaths.length > 0) {
    return filePaths[0];
  }
  return null;
}
