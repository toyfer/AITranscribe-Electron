const { spawn } = require("child_process");
const fs = require("fs");
const { createTempJob, safeDeleteFile } = require("../utils/fs-temp");
const { getNow } = require("../utils/time");

/**
 * One transcription run: FFmpeg → Faster-Whisper → copy CSV next to input.
 * Behavior preserved from the previous inline main.js pipeline.
 */
class TranscribeJob {
  /**
   * @param {object} options
   * @param {import('../runtime').RuntimeLayout} options.runtime
   * @param {(msg: string) => void} options.sendProcessMessage UI / notification channel
   * @param {(msg: string) => void} options.sendCommandOutput log textarea channel
   */
  constructor({ runtime, sendProcessMessage, sendCommandOutput }) {
    this.runtime = runtime;
    this.sendProcessMessage = sendProcessMessage;
    this.sendCommandOutput = sendCommandOutput;
  }

  /**
   * IPC entry: same signature as former runFFmpeg(_event, args).
   * @param {unknown} _event
   * @param {[string, { script: string, model: string }]} args
   */
  start(_event, args) {
    const inputPath = args[0];
    const modelArgs = args[1];
    const job = createTempJob();

    const { ffmpegPath, pythonPath, missing } = this.runtime.checkRuntimeLayout();
    if (missing.length > 0) {
      this.sendProcessMessage(
        `[${getNow()}:System]実行に必要なファイルが不足しています。\n${missing.join("\n")}`
      );
      return;
    }

    if (!inputPath || !fs.existsSync(inputPath)) {
      this.sendProcessMessage(`[${getNow()}:System]音声ファイルが見つかりません`);
      return;
    }

    const { scriptPath, modelPath } = this.runtime.resolveModelPaths(modelArgs);
    if (!fs.existsSync(scriptPath)) {
      this.sendProcessMessage(
        `[${getNow()}:System]Faster-Whisper.py が見つかりません: ${scriptPath}`
      );
      return;
    }
    if (!fs.existsSync(modelPath)) {
      this.sendProcessMessage(
        `[${getNow()}:System]モデルディレクトリが見つかりません（オフライン配置が必要）: ${modelPath}`
      );
      return;
    }

    this.#runFFmpeg({
      inputPath,
      modelArgs,
      job,
      ffmpegPath,
      pythonPath,
      scriptPath,
      modelPath,
    });
  }

  #runFFmpeg(ctx) {
    const { inputPath, job, ffmpegPath } = ctx;

    // shell を使わず引数配列で渡す（空白・日本語パス対応 / インジェクション回避）
    const ffmpegArgs = ["-y", "-i", inputPath, "-ar", "16000", job.tempWAV];
    console.log(ffmpegPath, ffmpegArgs.join(" "));

    const child = spawn(ffmpegPath, ffmpegArgs, {
      windowsHide: true,
    });

    child.stdout.on("data", (data) => {
      const line = `[${getNow()}:FFmpeg]${data}`;
      console.log(line);
      this.sendCommandOutput(line);
    });

    child.stderr.on("data", (data) => {
      const line = `[${getNow()}:FFmpeg]${data}`;
      console.log(line);
      this.sendCommandOutput(line);
    });

    child.on("error", (err) => {
      this.sendProcessMessage(`[${getNow()}:FFmpeg]起動に失敗しました: ${err.message}`);
      safeDeleteFile(job.tempWAV);
    });

    child.on("close", (code) => {
      if (code != 0) {
        this.sendProcessMessage(
          `[${getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`
        );
        safeDeleteFile(job.tempWAV);
        return;
      }
      console.log(`[${getNow()}:FFmpeg]child process exited with code ${code}`);
      this.sendCommandOutput(`[${getNow()}:FFmpeg]音声処理が完了しました`);
      this.#runWhisper(ctx);
    });
  }

  #runWhisper(ctx) {
    const { job, pythonPath, scriptPath, modelPath } = ctx;

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
      this.sendCommandOutput(line);
    });

    child.stderr.on("data", (data) => {
      const line = `[${getNow()}:Whisper]${data}`;
      console.log(line);
      this.sendCommandOutput(line);
    });

    child.on("error", (err) => {
      this.sendProcessMessage(`[${getNow()}:Whisper]起動に失敗しました: ${err.message}`);
      safeDeleteFile(job.tempWAV);
      safeDeleteFile(job.tempCSV);
    });

    child.on("close", (code) => {
      if (code != 0) {
        this.sendProcessMessage(
          `[${getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`
        );
        safeDeleteFile(job.tempWAV);
        safeDeleteFile(job.tempCSV);
        return;
      }
      console.log(`[${getNow()}:Whisper]child process exited with code ${code}`);
      this.sendCommandOutput(`[${getNow()}:Whisper]文字起こしが完了しました`);
      safeDeleteFile(job.tempWAV);
      this.#runAdjustment(ctx);
    });
  }

  #runAdjustment(ctx) {
    const { inputPath, job } = ctx;
    const outFile = `${inputPath}_[${getNow(true)}].csv`;

    fs.copyFile(job.tempCSV, outFile, (err) => {
      if (err) {
        this.sendProcessMessage(`[${getNow()}:System]${err}`);
      } else {
        this.sendProcessMessage(
          `[${getNow()}:System]文字起こしが完了しました\n出力: ${outFile}`
        );
      }
      safeDeleteFile(job.tempWAV);
      safeDeleteFile(job.tempCSV);
    });
  }
}

module.exports = { TranscribeJob };
