const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { CHANNELS } = require("./shared/channels");

// エアギャップ配布想定: FFmpeg / Python Embeddable / Faster-Whisper モデルは
// リポジトリに含めず、実行時に src/Whisper 配下へ配置する（README 参照）

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
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

function safeDeleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`[${getNow()}:System]一時ファイル削除失敗: ${filePath} ${error.message}`);
  }
}

function createTempJob() {
  const tempDir = os.tmpdir();
  const tempWAV = path.join(tempDir, `aitranscribe-${generateRandomString(12)}.wav`);
  const tempCSV = `${tempWAV}.csv`;
  return { tempWAV, tempCSV };
}

function getWhisperRoot() {
  return path.join(__dirname, "Whisper");
}

function resolveBundledPath(...segments) {
  return path.join(getWhisperRoot(), ...segments);
}

// 起動時に必須バイナリの有無だけ軽く確認（モデルは選択時に確認）
function checkRuntimeLayout() {
  const ffmpegPath = resolveBundledPath("ffmpeg.exe");
  const pythonPath = resolveBundledPath("python.exe");
  const missing = [];
  if (!fs.existsSync(ffmpegPath)) missing.push("Whisper/ffmpeg.exe（ライセンス都合で同梱しない・手動配置）");
  if (!fs.existsSync(pythonPath)) missing.push("Whisper/python.exe（Python Embeddable 展開先）");
  return { ffmpegPath, pythonPath, missing };
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle(CHANNELS.DIALOG_OPEN_FILE, handleFileOpen);
  ipcMain.on(CHANNELS.EXECUTE_RUN_FFMPEG, runFFmpeg);
  // runWhisper は FFmpeg 完了後に main 内から呼ぶ（preload の runWhisper は未使用）
  createWindow();

  mainWindow.webContents.once("did-finish-load", () => {
    const { missing } = checkRuntimeLayout();
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

// FFmpeg の実行（ジョブごとに一時ファイルを新規生成）
function runFFmpeg(_event, args) {
  const inputPath = args[0];
  const modelArgs = args[1];
  const job = createTempJob();

  const { ffmpegPath, pythonPath, missing } = checkRuntimeLayout();
  if (missing.length > 0) {
    sendProcessMessage(
      `[${getNow()}:System]実行に必要なファイルが不足しています。\n${missing.join("\n")}`
    );
    return;
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    sendProcessMessage(`[${getNow()}:System]音声ファイルが見つかりません`);
    return;
  }

  const scriptPath = path.join(__dirname, modelArgs.script);
  const modelPath = path.join(__dirname, modelArgs.model);
  if (!fs.existsSync(scriptPath)) {
    sendProcessMessage(`[${getNow()}:System]Faster-Whisper.py が見つかりません: ${scriptPath}`);
    return;
  }
  if (!fs.existsSync(modelPath)) {
    sendProcessMessage(
      `[${getNow()}:System]モデルディレクトリが見つかりません（オフライン配置が必要）: ${modelPath}`
    );
    return;
  }

  // shell を使わず引数配列で渡す（空白・日本語パス対応 / インジェクション回避）
  const ffmpegArgs = ["-y", "-i", inputPath, "-ar", "16000", job.tempWAV];
  console.log(ffmpegPath, ffmpegArgs.join(" "));

  const child = spawn(ffmpegPath, ffmpegArgs, {
    windowsHide: true,
  });

  child.stdout.on("data", (data) => {
    const line = `[${getNow()}:FFmpeg]${data}`;
    console.log(line);
    sendCommandOutput(line);
  });

  child.stderr.on("data", (data) => {
    const line = `[${getNow()}:FFmpeg]${data}`;
    console.log(line);
    sendCommandOutput(line);
  });

  child.on("error", (err) => {
    sendProcessMessage(`[${getNow()}:FFmpeg]起動に失敗しました: ${err.message}`);
    safeDeleteFile(job.tempWAV);
  });

  child.on("close", (code) => {
    if (code != 0) {
      sendProcessMessage(`[${getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`);
      safeDeleteFile(job.tempWAV);
      return;
    }
    console.log(`[${getNow()}:FFmpeg]child process exited with code ${code}`);
    sendCommandOutput(`[${getNow()}:FFmpeg]音声処理が完了しました`);
    runWhisper({ inputPath, modelArgs, job, pythonPath, scriptPath, modelPath });
  });
}

// Whisper（Faster-Whisper）の実行 — ローカル embeddable Python + ローカルモデルのみ使用
function runWhisper(ctx) {
  const { job, pythonPath, scriptPath, modelPath, inputPath, modelArgs } = ctx;

  const pythonArgs = [scriptPath, modelPath, job.tempWAV];
  console.log(pythonPath, pythonArgs.join(" "));

  const child = spawn(pythonPath, pythonArgs, {
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      // オフライン: ユーザーサイトやネット経由の追加取得を避ける
      PYTHONNOUSERSITE: "1",
    },
  });

  child.stdout.on("data", (data) => {
    const line = `[${getNow()}:Whisper]${data}`;
    console.log(line);
    sendCommandOutput(line);
  });

  child.stderr.on("data", (data) => {
    const line = `[${getNow()}:Whisper]${data}`;
    console.log(line);
    sendCommandOutput(line);
  });

  child.on("error", (err) => {
    sendProcessMessage(`[${getNow()}:Whisper]起動に失敗しました: ${err.message}`);
    safeDeleteFile(job.tempWAV);
    safeDeleteFile(job.tempCSV);
  });

  child.on("close", (code) => {
    if (code != 0) {
      sendProcessMessage(`[${getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`);
      safeDeleteFile(job.tempWAV);
      safeDeleteFile(job.tempCSV);
      return;
    }
    console.log(`[${getNow()}:Whisper]child process exited with code ${code}`);
    sendCommandOutput(`[${getNow()}:Whisper]文字起こしが完了しました`);
    safeDeleteFile(job.tempWAV);
    runAdjustment({ inputPath, job });
  });
}

function runAdjustment(ctx) {
  const { inputPath, job } = ctx;
  const outFile = `${inputPath}_[${getNow(true)}].csv`;

  fs.copyFile(job.tempCSV, outFile, (err) => {
    if (err) {
      sendProcessMessage(`[${getNow()}:System]${err}`);
    } else {
      sendProcessMessage(`[${getNow()}:System]文字起こしが完了しました\n出力: ${outFile}`);
    }
    safeDeleteFile(job.tempWAV);
    safeDeleteFile(job.tempCSV);
  });
}

function getNow(pathFlag = false) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  if (!pathFlag) {
    return `${year}/${month}/${date}_${hour}:${min}:${sec}`;
  }
  return `${year}-${month}-${date}_${hour}-${min}-${sec}`;
}

function generateRandomString(length) {
  let result = "";
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
