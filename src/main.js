const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, webContents } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const iconv = require('iconv-lite');

//▼描写・プリロード
function createWindow() {
  // ブラウザウィンドウを作成
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('./src/index.html');

  // 開発者ツールを開きます（オプション）
  // mainWindow.webContents.openDevTools();
}

// アプリケーションの準備が完了したらウィンドウを作成
app.whenReady().then(() => {
  Menu.setApplicationMenu(null) // デフォルトのメニューを非表示
  ipcMain.handle('dialog:openFile', handleFileOpen); // ファイル選択のリッスン
  ipcMain.on('execute:runCommand', runCommand); // デバッグ用リッスン
  ipcMain.on('execute:runFFmpeg', runFFmpeg); // FFmpeg用リッスン
  ipcMain.on('execute:runAiTranscribe', runAiTranscribe); // AiTranscribe用リッスン（使わない）
  createWindow(); // ウィンドウ作成
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  mainWindow.webContents.send('process:Massage', `[${getNow()}:System]システムを起動しました`);
});

// ウィンドウがすべて閉じられたらアプリを終了
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

//▼実行セクション
// ファイル選択ダイアログ
async function handleFileOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog();
  if (!canceled) {
    return filePaths[0];
  } else {
    return null;
  }
}

// デバッグ実行ボタン
function runCommand(_, command) {
  const process = spawn(command, [], { shell: true, windowsVerbatimArguments: true });

  // 標準出力
  process.stdout.on('data', (data) => {
    console.log(`${getNow()}Debug.Stdout:${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}Debug.Command]${iconv.decode(data, "Shift_JIS")}`);
  });

  // エラー出力
  process.stderr.on('data', (data) => {
    console.log(`${getNow()}Debug.Stderr:${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}Debug.Command]${iconv.decode(data, "Shift_JIS")}`);
  });

  // 終了時出力
  process.on('close', (code) => {
    console.log(`child process exited with code ${code.toString}`);
    mainWindow.webContents.send('return:Command', code);
  });
}


// ▼文字起こし開始
// 共有セクションの実行
const tempDir = os.tmpdir(); // 一時ディレクトリのパスを取得
const tempWAV = `${tempDir}\\temp.wav` // FFmpegで出力されるWAVファイルのパスを定義
const tempCSV = `${tempWAV}.csv` // AiTranscribeで出力されるCSVファイルのパスを定義

// FFmpegの実行
function runFFmpeg(_event, args) {
  const FFmpegArgs = `${path.join(__dirname, 'AITranscribe\\ffmpeg.exe')} -y -i ${args[0]} -ar 16000 ${tempWAV}`;
  const process = spawn(`chcp 65001 && ${FFmpegArgs}`, [], { shell: true, windowsVerbatimArguments: true });
  console.log(FFmpegArgs)

  // 標準出力
  process.stdout.on('data', (data) => {
    console.log(`[${getNow()}:FFmpeg]${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:FFmpeg]${iconv.decode(data, "Shift_JIS")}`);
  });

  // エラー出力
  process.stderr.on('data', (data) => {
    console.log(`[${getNow()}:FFmpeg]${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:FFmpeg]${iconv.decode(data, "Shift_JIS")}`);
  });

  // 終了時出力
  process.on('close', (code) => {
    // エラーハンドリング
    if (code != 0) {
      mainWindow.webContents.send('process:Massage', `[${getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`);
      return;
    }
    console.log(`[${getNow()}:FFmpeg]child process exited with code ${code}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:FFmpeg]音声処理が完了しました`);
    runAiTranscribe(args)
  });
}

// AiTranscribeの実行
function runAiTranscribe(args) {
  const AiTranscribeArgs = `${path.join(__dirname, 'AiTranscribe\\python.exe')} ${path.join(__dirname, 'AiTranscribe\\AiTranscribe.py')} ${path.join(__dirname, args[1])} ${tempWAV}`;
  const process = spawn(`chcp 65001 && ${AiTranscribeArgs}`, [], { shell: true, windowsVerbatimArguments: true });

  // 標準出力
  process.stdout.on('data', (data) => {
    console.log(`[${getNow()}:AiTranscribe]${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:AiTranscribe]${iconv.decode(data, "Shift_JIS")}`);
  });

  // エラー出力
  process.stderr.on('data', (data) => {
    console.log(`[${getNow()}:AiTranscribe]${iconv.decode(data, "Shift_JIS")}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:AiTranscribe]${iconv.decode(data, "Shift_JIS")}`);
  });

  // 終了時出力
  process.on('close', (code) => {
    // エラーハンドリング
    if (code != 0) {
      mainWindow.webContents.send('process:Massage', `[${getNow()}:AiTranscribe]エラーが発生しました\n errorcode:${code}`);
      return;
    }
    console.log(`[${getNow()}:AiTranscribe]child process exited with code ${code}`);
    mainWindow.webContents.send('return:Command', `[${getNow()}:AiTranscribe]文字起こしが完了しました`);
    runAdjustment(args);
  });
}

// 最終調整実行
function runAdjustment(args) {
  // tmpファイルのパスを取得
  const outFile = `${args[0]}_[${getNow(true)}].csv`
  fs.copyFile(tempCSV, outFile, (err) => {
    if (err) {
      mainWindow.webContents.send('process:Massage', `[${getNow()}:System]${err}`)
      return;
    } else {
      mainWindow.webContents.send('process:Massage', `[${getNow()}:System]文字起こしが完了しました`);
      return
    }
  });
};

// 時刻の取得
function getNow(pathFlag = null) {
  const now = new Date();

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const hour = now.getHours();
  const min = now.getMinutes();
  const sec = now.getSeconds();

  if (!pathFlag) {
    return `${year}/${month}/${date}_${hour}:${min}:${sec}`
  } else {
    return `${year}-${month}-${date}_${hour}-${min}-${sec}`
  }
}

