const { spawn } = require("child_process");
const fs = require("fs");
const { createTempJob, safeDeleteFile } = require("../utils/fs-temp");
const { getNow } = require("../utils/time");

/** Structured lines from Faster-Whisper.py (stdout). */
const AIT_PREFIX = "__AIT__";

/**
 * One transcription run: FFmpeg → Faster-Whisper → copy CSV next to input.
 * Emits measured progress via sendProgress when provided.
 */
class TranscribeJob {
  /**
   * @param {object} options
   * @param {import('../runtime').RuntimeLayout} options.runtime
   * @param {(msg: string) => void} options.sendProcessMessage UI / notification channel
   * @param {(msg: string) => void} options.sendCommandOutput log textarea channel
   * @param {(payload: object) => void} [options.sendProgress] structured progress
   */
  constructor({ runtime, sendProcessMessage, sendCommandOutput, sendProgress }) {
    this.runtime = runtime;
    this.sendProcessMessage = sendProcessMessage;
    this.sendCommandOutput = sendCommandOutput;
    this.sendProgress =
      typeof sendProgress === "function" ? sendProgress : () => {};
  }

  /**
   * IPC entry: same signature as former runFFmpeg(_event, args).
   * @param {unknown} _event
   * @param {[string, object]} args
   */
  start(_event, args) {
    const inputPath = args[0];
    const modelArgs = args[1] || {};
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

    const audioDurationSec = Number(modelArgs.audioDurationSec);
    const estimatedDurationSec = Number(modelArgs.estimatedDuration);

    this.#runFFmpeg({
      inputPath,
      modelArgs,
      job,
      ffmpegPath,
      pythonPath,
      scriptPath,
      modelPath,
      audioDurationSec:
        Number.isFinite(audioDurationSec) && audioDurationSec > 0
          ? audioDurationSec
          : null,
      estimatedDurationSec:
        Number.isFinite(estimatedDurationSec) && estimatedDurationSec > 0
          ? estimatedDurationSec
          : null,
      metrics: {
        t0: Date.now(),
        tFfmpeg: null,
        tWhisper: null,
        tTotal: null,
        python: null,
      },
      stdoutBuf: "",
    });
  }

  #emit(payload) {
    try {
      this.sendProgress({ ...payload, ts: Date.now() });
    } catch (err) {
      console.error("[progress]", err);
    }
  }

  #runFFmpeg(ctx) {
    const { inputPath, job, ffmpegPath } = ctx;

    this.#emit({
      type: "phase",
      phase: "ffmpeg",
      label: "音声変換中 (FFmpeg)",
      pct: 0,
      mode: "indeterminate",
    });

    // shell を使わず引数配列で渡す（空白・日本語パス対応 / インジェクション回避）
    const ffmpegArgs = ["-y", "-i", inputPath, "-ar", "16000", job.tempWAV];
    console.log(ffmpegPath, ffmpegArgs.join(" "));

    const tFfmpegStart = Date.now();
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
      ctx.metrics.tFfmpeg = (Date.now() - tFfmpegStart) / 1000;

      if (code != 0) {
        this.sendProcessMessage(
          `[${getNow()}:FFmpeg]エラーが発生しました\n errorcode:${code}`
        );
        safeDeleteFile(job.tempWAV);
        return;
      }
      console.log(`[${getNow()}:FFmpeg]child process exited with code ${code}`);
      this.sendCommandOutput(
        `[${getNow()}:FFmpeg]音声処理が完了しました (${ctx.metrics.tFfmpeg.toFixed(2)}s)`
      );
      this.#emit({
        type: "phase",
        phase: "ffmpeg_done",
        label: "音声変換完了",
        pct: 2,
        sec: ctx.metrics.tFfmpeg,
      });
      this.#runWhisper(ctx);
    });
  }

  #runWhisper(ctx) {
    const { job, pythonPath, scriptPath, modelPath } = ctx;

    this.#emit({
      type: "phase",
      phase: "load",
      label: "モデル読込中",
      pct: 3,
      mode: "indeterminate",
    });

    const pythonArgs = ["-u", scriptPath, modelPath, job.tempWAV];
    console.log(pythonPath, pythonArgs.join(" "));

    const tWhisperStart = Date.now();
    const child = spawn(pythonPath, pythonArgs, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        PYTHONUNBUFFERED: "1",
        // オフライン: ユーザーサイトやネット経由の追加取得を避ける
        PYTHONNOUSERSITE: "1",
      },
    });

    // StringDecoder via setEncoding: avoid splitting multibyte UTF-8 (JP text / JSON)
    // across data chunk boundaries (toString per Buffer is unsafe).
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      this.#onWhisperStdout(ctx, data);
    });

    child.stderr.setEncoding("utf8");
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
      // flush incomplete buffer as log
      if (ctx.stdoutBuf && ctx.stdoutBuf.length) {
        this.#handleWhisperLine(ctx, ctx.stdoutBuf);
        ctx.stdoutBuf = "";
      }

      ctx.metrics.tWhisper = (Date.now() - tWhisperStart) / 1000;

      if (code != 0) {
        this.sendProcessMessage(
          `[${getNow()}:Whisper]エラーが発生しました\n errorcode:${code}`
        );
        safeDeleteFile(job.tempWAV);
        safeDeleteFile(job.tempCSV);
        return;
      }
      console.log(`[${getNow()}:Whisper]child process exited with code ${code}`);
      this.sendCommandOutput(
        `[${getNow()}:Whisper]文字起こしが完了しました (${ctx.metrics.tWhisper.toFixed(2)}s)`
      );
      safeDeleteFile(job.tempWAV);
      this.#runAdjustment(ctx);
    });
  }

  #onWhisperStdout(ctx, chunk) {
    ctx.stdoutBuf = (ctx.stdoutBuf || "") + chunk;
    let idx;
    while ((idx = ctx.stdoutBuf.indexOf("\n")) >= 0) {
      const line = ctx.stdoutBuf.slice(0, idx).replace(/\r$/, "");
      ctx.stdoutBuf = ctx.stdoutBuf.slice(idx + 1);
      if (line.length) this.#handleWhisperLine(ctx, line);
    }
  }

  #handleWhisperLine(ctx, line) {
    if (line.startsWith(AIT_PREFIX)) {
      const raw = line.slice(AIT_PREFIX.length);
      let evt;
      try {
        evt = JSON.parse(raw);
      } catch (err) {
        this.sendCommandOutput(`[${getNow()}:Whisper][ait-parse-error]${raw}\n`);
        return;
      }
      this.#onAitEvent(ctx, evt);
      return;
    }

    const out = `[${getNow()}:Whisper]${line}\n`;
    console.log(out.trimEnd());
    this.sendCommandOutput(out);
  }

  #onAitEvent(ctx, evt) {
    if (!evt || typeof evt !== "object") return;

    if (evt.type === "phase") {
      const phase = evt.phase || "unknown";
      const labels = {
        load: "モデル読込中",
        transcribe_setup: "前処理 (VAD / 特徴量)",
        infer: "推論中",
        write: "CSV 書き出し",
      };
      // Map python phases into overall job % bands (ffmpeg used 0–2)
      let pct = 5;
      if (phase === "load") pct = 4;
      else if (phase === "transcribe_setup") pct = 8;
      else if (phase === "infer") pct = 10;
      else if (phase === "write") pct = 96;

      this.#emit({
        type: "phase",
        phase,
        label: labels[phase] || phase,
        pct,
        mode: phase === "infer" ? "measured" : "indeterminate",
        t_load_sec: evt.t_load_sec,
        duration: evt.duration,
        duration_after_vad: evt.duration_after_vad,
      });

      if (evt.duration != null) {
        this.sendCommandOutput(
          `[${getNow()}:Whisper]phase=${phase}` +
            (evt.duration != null ? ` duration=${Number(evt.duration).toFixed(2)}s` : "") +
            (evt.duration_after_vad != null
              ? ` after_vad=${Number(evt.duration_after_vad).toFixed(2)}s`
              : "") +
            (evt.t_load_sec != null ? ` t_load=${Number(evt.t_load_sec).toFixed(2)}s` : "") +
            "\n"
        );
      }
      return;
    }

    if (evt.type === "progress") {
      // Reserve 10–95% of the bar for inference audio progress
      const audioPct = Math.max(0, Math.min(100, Number(evt.pct) || 0));
      const jobPct = 10 + (audioPct / 100) * 85;
      this.#emit({
        type: "progress",
        phase: "infer",
        label: "推論中",
        pct: jobPct,
        audio_pct: audioPct,
        audio_end: evt.audio_end,
        duration: evt.duration,
        duration_after_vad: evt.duration_after_vad,
        segment_id: evt.segment_id,
        mode: "measured",
        wall_sec: evt.wall_sec,
      });
      return;
    }

    if (evt.type === "timing") {
      ctx.metrics.python = evt;
      const parts = [
        `t_load=${Number(evt.t_load_sec || 0).toFixed(2)}s`,
        `t_setup=${Number(evt.t_setup_sec || 0).toFixed(2)}s`,
        `t_infer=${Number(evt.t_infer_sec || 0).toFixed(2)}s`,
        `t_write=${Number(evt.t_write_sec || 0).toFixed(2)}s`,
        `t_python=${Number(evt.t_python_sec || 0).toFixed(2)}s`,
      ];
      if (evt.rtf_infer != null) {
        parts.push(`rtf_infer=${Number(evt.rtf_infer).toFixed(3)}`);
      }
      if (evt.duration != null) {
        parts.push(`audio=${Number(evt.duration).toFixed(2)}s`);
      }
      this.sendCommandOutput(`[${getNow()}:Whisper][timing] ${parts.join(" ")}\n`);
      this.#emit({
        type: "timing",
        phase: "timing",
        label: "計測完了",
        pct: 97,
        python: evt,
      });
      return;
    }

    if (evt.type === "done") {
      this.#emit({
        type: "phase",
        phase: "python_done",
        label: "Python 完了",
        pct: 98,
      });
    }
  }

  #runAdjustment(ctx) {
    const { inputPath, job } = ctx;
    const outFile = `${inputPath}_[${getNow(true)}].csv`;

    this.#emit({
      type: "phase",
      phase: "save",
      label: "結果を保存中",
      pct: 99,
    });

    fs.copyFile(job.tempCSV, outFile, (err) => {
      ctx.metrics.tTotal = (Date.now() - ctx.metrics.t0) / 1000;

      // Do not emit complete / success metrics when the output file was not saved.
      if (err) {
        this.sendProcessMessage(`[${getNow()}:System]${err}`);
        safeDeleteFile(job.tempWAV);
        safeDeleteFile(job.tempCSV);
        return;
      }

      const audioDur =
        (ctx.metrics.python && ctx.metrics.python.duration) ||
        ctx.audioDurationSec ||
        null;
      const rtfTotal =
        audioDur && audioDur > 0 ? ctx.metrics.tTotal / audioDur : null;

      const summaryBits = [
        `ffmpeg=${(ctx.metrics.tFfmpeg ?? 0).toFixed(2)}s`,
        `whisper=${(ctx.metrics.tWhisper ?? 0).toFixed(2)}s`,
        `total=${(ctx.metrics.tTotal ?? 0).toFixed(2)}s`,
      ];
      if (rtfTotal != null) summaryBits.push(`rtf=${rtfTotal.toFixed(3)}`);
      if (ctx.modelArgs && ctx.modelArgs.modelId) {
        summaryBits.push(`model=${ctx.modelArgs.modelId}`);
      }

      this.sendCommandOutput(
        `[${getNow()}:System][metrics] ${summaryBits.join(" ")}\n`
      );

      this.#emit({
        type: "complete",
        phase: "complete",
        label: "完了",
        pct: 100,
        metrics: {
          t_ffmpeg_sec: ctx.metrics.tFfmpeg,
          t_whisper_sec: ctx.metrics.tWhisper,
          t_total_sec: ctx.metrics.tTotal,
          audio_duration_sec: audioDur,
          rtf_total: rtfTotal,
          model_id: ctx.modelArgs && ctx.modelArgs.modelId,
          python: ctx.metrics.python,
        },
      });

      const rtfNote =
        rtfTotal != null
          ? `\n所要 ${ctx.metrics.tTotal.toFixed(1)}s / RTF ${rtfTotal.toFixed(2)}`
          : "";
      this.sendProcessMessage(
        `[${getNow()}:System]文字起こしが完了しました\n出力: ${outFile}${rtfNote}`
      );
      safeDeleteFile(job.tempWAV);
      safeDeleteFile(job.tempCSV);
    });
  }
}

module.exports = { TranscribeJob };
