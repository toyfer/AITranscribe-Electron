const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, webContents } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

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
  ipcMain.handle("dialog:openFile", handleFileOpen); // ファイル選択のIPCリッスン
  ipcMain.on("execute:runFFmpeg", runFFmpeg); // FFmpeg用のIPCリッスン
  ipcMain.on("execute:runWhisper", runWhisper); // Whisper用のIPCリッスン（使わない）
  createWindow(); // ウィンドウ作成
  mainWindow.webContents.send(
    "process:Massage",
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
  const FFmpegArgs = `${path.join(__dirname, "Whisper\\ffmpeg.exe")} -y -i ${args[0]
    } -ar 16000 ${tempWAV}`;
  const process = spawn(`chcp 65001 > nul && ${FFmpegArgs}`, [], {
    shell: true,
    windowsVerbatimArguments: true,
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
        "process:Massage",
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
  const WhisperArgs = `${path.join(
    __dirname,
    "Whisper\\python.exe"
  )} ${path.join(__dirname, args[1].script)} ${path.join(
    __dirname,
    args[1].model
  )} ${tempWAV}`;
  const process = spawn(`chcp 65001 > nul && ${WhisperArgs}`, [], {
    shell: true,
    windowsVerbatimArguments: true,
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
        "process:Massage",
        `[${getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`
      );
      fs.unlinkSync(tempWAV); // 一時ファイルを削除
      return;
    }
    console.log(`[${getNow()}:Whisper]child process exited with code ${code}`);
    mainWindow.webContents.send(
      "return:Command",
      `[${getNow()}:Whisper]文字起こしが完了しました`
    );
    if (fs.existsSync(tempWAV)) {
      fs.unlinkSync(tempWAV);
    }
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
        "process:Massage",
        `[${getNow()}:System]${err}`
      );
      if (fs.existsSync(tempWAV)) {
        fs.unlinkSync(tempWAV);
      }
    } else {
      mainWindow.webContents.send(
        "process:Massage",
        `[${getNow()}:System]文字起こしが完了しました`
      );
      if (fs.existsSync(tempWAV)) {
        fs.unlinkSync(tempWAV);
      }
      return;
    }
  });
}

// 時刻の取得関数
function getNow(pathFlag = false) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  if (!pathFlag) {65001
    return `${year}/${month}/${date}_${hour}:${min}:${sec}`;
  } else {
    return `${year}-${month}-${date}_${hour}-${min}-${sec}`;
  }
}

// 引数で指定されて文字数分ランダム文字列を生成して返す関数（一時ファイル用）
function generateRandomString(length) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}