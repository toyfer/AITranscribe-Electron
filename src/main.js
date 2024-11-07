const { app, BrowserWindow, ipcMain, dialog, Menu, Notification, webContents } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

class MainApp {
  constructor() {
    this.mainWindow = null;
    this.tempDir = os.tmpdir();
    this.tempWAV = path.join(this.tempDir, `${this.generateRandomString(10)}.wav`);
    this.tempCSV = `${this.tempWAV}.csv`;
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
      },
    });
    this.mainWindow.loadFile("./src/index.html");
  }

  initializeApp() {
    app.whenReady().then(() => {
      Menu.setApplicationMenu(null);
      ipcMain.handle("dialog:openFile", this.handleFileOpen);
      ipcMain.on("execute:runFFmpeg", this.runFFmpeg.bind(this));
      ipcMain.on("execute:runWhisper", this.runWhisper.bind(this));
      this.createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) this.createWindow();
      });
      this.mainWindow.webContents.send(
        "process:Massage",
        `[${this.getNow()}:System]システムを起動しました`
      );
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  }

  async handleFileOpen() {
    const { canceled, filePaths } = await dialog.showOpenDialog();
    if (!canceled) {
      return filePaths[0];
    } else {
      return null;
    }
  }

  runFFmpeg(_event, args) {
    const FFmpegArgs = `${path.join(__dirname, "Whisper\\ffmpeg.exe")} -y -i ${args[0]} -ar 16000 ${this.tempWAV}`;
    const process = spawn(`chcp 65001 && ${FFmpegArgs}`, [], {
      shell: true,
      windowsVerbatimArguments: true,
    });
    console.log(FFmpegArgs);

    process.stdout.on("data", (data) => {
      console.log(`[${this.getNow()}:FFmpeg]${data}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:FFmpeg]${data}`
      );
    });

    process.stderr.on("data", (data) => {
      console.log(`[${this.getNow()}:FFmpeg]${data}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:FFmpeg]${data}`
      );
    });

    process.on("close", (code) => {
      if (code != 0) {
        this.mainWindow.webContents.send(
          "process:Massage",
          `[${this.getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`
        );
        return;
      }
      console.log(`[${this.getNow()}:FFmpeg]child process exited with code ${code}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:FFmpeg]音声処理が完了しました`
      );
      this.runWhisper(args);
    });
  }

  runWhisper(args) {
    const WhisperArgs = `${path.join(__dirname, "Whisper\\python.exe")} ${path.join(__dirname, args[1].script)} ${path.join(__dirname, args[1].model)} ${this.tempWAV}`;
    const process = spawn(`chcp 65001 && ${WhisperArgs}`, [], {
      shell: true,
      windowsVerbatimArguments: true,
    });

    process.stdout.on("data", (data) => {
      console.log(`[${this.getNow()}:Whisper]${data}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:Whisper]${data}`
      );
    });

    process.stderr.on("data", (data) => {
      console.log(`[${this.getNow()}:Whisper]${data}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:Whisper]${data}`
      );
    });

    process.on("close", (code) => {
      if (code != 0) {
        this.mainWindow.webContents.send(
          "process:Massage",
          `[${this.getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`
        );
        fs.unlinkSync(this.tempWAV);
        return;
      }
      console.log(`[${this.getNow()}:Whisper]child process exited with code ${code}`);
      this.mainWindow.webContents.send(
        "return:Command",
        `[${this.getNow()}:Whisper]文字起こしが完了しました`
      );
      if (fs.existsSync(this.tempWAV)) {
        fs.unlinkSync(this.tempWAV);
      }
      this.runAdjustment(args);
    });
  }

  runAdjustment(args) {
    const outFile = `${args[0]}_[${this.getNow(true)}].csv`;
    fs.copyFile(this.tempCSV, outFile, (err) => {
      if (err) {
        this.mainWindow.webContents.send(
          "process:Massage",
          `[${this.getNow()}:System]${err}`
        );
        if (fs.existsSync(this.tempWAV)) {
          fs.unlinkSync(this.tempWAV);
        }
      } else {
        this.mainWindow.webContents.send(
          "process:Massage",
          `[${this.getNow()}:System]文字起こしが完了しました`
        );
        if (fs.existsSync(this.tempWAV)) {
          fs.unlinkSync(this.tempWAV);
        }
        return;
      }
    });
  }

  getNow(pathFlag = null) {
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

  generateRandomString(length) {
    return [...Array(length).map(() => Math.random().toString(36)[2]).join("")];
  }
}

const mainApp = new MainApp();
mainApp.initializeApp();
