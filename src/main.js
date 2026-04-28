const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Global variables
let mainWindow;

// 描写・プリロード関数
function createWindow() {
  // ブラウザウィンドウを作成
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadFile("./src/index.html");

  // 開発者ツールを開く（オプション）
  // mainWindow.webContents.openDevTools();
}

// アプリケーションの準備が完了したらウィンドウを作成
app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // デフォルトのメニューを非表示
  ipcMain.handle("dialog:openFile", handleFileOpen); // ファイル選択のリッスン
  ipcMain.on("execute:runFFmpeg", runFFmpeg); // FFmpeg用リッスン
  ipcMain.on("execute:runWhisper", runWhisper); // Whisper用リッスン（使わない）
  createWindow(); // ウィンドウ作成
  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  mainWindow.webContents.send(
    "process:Message",
    `[${getNow()}:System]システムを起動しました`
  );
});

// ウィンドウがすべて閉じられたらアプリを終了
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// 実行セクション
// ファイル選択ダイアログの表示
async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog();
  if (!canceled) {
    return filePaths[0];
  } else {
    return null;
  }
}

// 文字起こし開始
// 共通の変数を宣言
const tempDir = os.tmpdir(); // 一時ディレクトリのパスを取得
const tempWAV = path.join(tempDir, `${generateRandomString(10)}.wav`); // FFmpegで出力されるWAVファイルのパスを定義
const tempCSV = `${tempWAV}.csv`; // Whisperで出力されるCSVファイルのパスを定義

// FFmpegの実行
function runFFmpeg(_event, args) {
  // Cross-platform executable path handling
  const isWindows = process.platform === "win32";
  const ffmpegExe = isWindows ? "ffmpeg.exe" : "ffmpeg";
  const ffmpegPath = path.join(__dirname, "..", "resources", "ffmpeg", ffmpegExe);
  
  const FFmpegArgs = `"${ffmpegPath}" -y -i "${args[0]}" -ar 16000 "${tempWAV}"`;
  const command = isWindows ? `chcp 65001 && ${FFmpegArgs}` : FFmpegArgs;
  
  const process = spawn(command, [], {
    shell: true,
    windowsVerbatimArguments: isWindows,
  });
  console.log(FFmpegArgs);

  // 標準出力リッスン
  process.stdout.on("data", (data) => {
    console.log(`[${getNow()}:FFmpeg]${data}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:FFmpeg]${data}`
    );
  });

  // エラー出力リッスン
  process.stderr.on("data", (data) => {
    console.log(`[${getNow()}:FFmpeg]${data}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:FFmpeg]${data}`
    );
  });

  // 終了時リッスン
  process.on("close", (code) => {
    // エラーハンドリング
    if (code != 0) {
      mainWindow.webContents.send(
        "process:Message",
        `[${getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`
      );
      return;
    }
    console.log(`[${getNow()}:FFmpeg]child process exited with code ${code}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:FFmpeg]音声処理が完了しました`
    );
    runWhisper(args); // FFmpegの実行が完了時、Whisperを実行する
  });
}

// Whisperの実行
function runWhisper(args) {
  // Cross-platform executable path handling
  const isWindows = process.platform === "win32";
  const pythonExe = isWindows ? "python.exe" : "python";
  const pythonPath = path.join(__dirname, "..", "resources", "python", pythonExe);
  
  const WhisperArgs = `"${pythonPath}" "${path.join(__dirname, args[1].script)}" "${path.join(__dirname, args[1].model)}" "${tempWAV}"`;
  const command = isWindows 
    ? `set PYTHONIOENCODING=utf-8 && chcp 65001 && ${WhisperArgs}` 
    : `PYTHONIOENCODING=utf-8 ${WhisperArgs}`;
  
  const process = spawn(command, [], {
    shell: true,
    windowsVerbatimArguments: isWindows,
  });

  // 標準出力
  process.stdout.on("data", (data) => {
    console.log(`[${getNow()}:Whisper]${data}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:Whisper]${data}`
    );
  });

  // エラー出力
  process.stderr.on("data", (data) => {
    console.log(`[${getNow()}:Whisper]${data}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:Whisper]${data}`
    );
  });

  // 終了時出力
  process.on("close", (code) => {
    // エラーハンドリング
    if (code != 0) {
      mainWindow.webContents.send(
        "process:Message",
        `[${getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`
      );
      safeDeleteFile(tempWAV); // 一時ファイルを削除
      return;
    }
    console.log(`[${getNow()}:Whisper]child process exited with code ${code}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:Whisper]文字起こしが完了しました`
    );
    safeDeleteFile(tempWAV);
    runAdjustment(args);
  });
}

// 最終調整実行
function runAdjustment(args) {
  // tmpファイルのパスを取得
  const outFile = `${args[0]}_[${getNow(true)}].csv`;
  fs.copyFile(tempCSV, outFile, (err) => {
    if (err) {
      mainWindow.webContents.send(
        "process:Message",
        `[${getNow()}:System]${err}`
      );
      safeDeleteFile(tempWAV);
      safeDeleteFile(tempCSV);
    } else {
      mainWindow.webContents.send(
        "process:Message",
        `[${getNow()}:System]文字起こしが完了しました`
      );
      safeDeleteFile(tempWAV);
      safeDeleteFile(tempCSV);
      return;
    }
  });
}

// 時刻の取得関数
function getNow(pathFlag = null) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  if (!pathFlag) {
    return `${year}/${month}/${date}_${hour}:${min}:${sec}`;
  } else {
    return `${year}-${month}-${date}_${hour}-${min}-${sec}`;
  }
}

// ファイルを安全に削除するヘルパー関数
function safeDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[${getNow()}:System]Deleted temporary file: ${filePath}`);
    }
  } catch (error) {
    console.error(`[${getNow()}:System]Failed to delete file ${filePath}: ${error.message}`);
  }
}

// ランダム文字列を生成する関数（一時ファイル用）
function generateRandomString(length) {
  return Array(length)
    .fill()
    .map(() => Math.random().toString(36)[2])
    .join("");
}