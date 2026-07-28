const fs = require("fs");
const path = require("path");

/**
 * Air-gap runtime layout under src/Whisper/.
 * FFmpeg / Python Embeddable / Whisper models / llama-cli / GGUF are NOT in git.
 * preflight only checks local paths.
 */
class RuntimeLayout {
  /**
   * @param {string} appRootDir Absolute path to the app src root (typically __dirname of main.js).
   */
  constructor(appRootDir) {
    this.appRootDir = appRootDir;
  }

  getWhisperRoot() {
    return path.join(this.appRootDir, "Whisper");
  }

  resolveBundledPath(...segments) {
    return path.join(this.getWhisperRoot(), ...segments);
  }

  /**
   * Light check for required binaries (models checked when a job starts).
   * llama-cli / GGUF are optional: missing them is reported but does not block
   * the main transcription flow.
   * @returns {{
   *   ffmpegPath: string,
   *   pythonPath: string,
   *   llamaCliPath: string,
   *   ggufPaths: string[],
   *   missing: string[],
   *   llamaMissing: string[]
   * }}
   */
  checkRuntimeLayout() {
    const ffmpegPath = this.resolveBundledPath("ffmpeg.exe");
    const pythonPath = this.resolveBundledPath("python.exe");
    const llamaCliPath = this.resolveBundledPath(
      process.platform === "win32" ? "llama-cli.exe" : "llama-cli"
    );
    const ggufDir = this.resolveBundledPath("models", "llm");
    const missing = [];
    const llamaMissing = [];
    if (!fs.existsSync(ffmpegPath)) {
      missing.push("Whisper/ffmpeg.exe（ライセンス都合で同梱しない・手動配置）");
    }
    if (!fs.existsSync(pythonPath)) {
      missing.push("Whisper/python.exe（Python Embeddable 展開先）");
    }
    // llama-cli: warn but don't fail app start
    if (!fs.existsSync(llamaCliPath)) {
      llamaMissing.push(
        "Whisper/llama-cli.exe (llama.cpp 単一バイナリ・手動配置・要約機能を使う場合に必要)"
      );
    }
    // GGUF model directory: scan for *.gguf
    const ggufPaths = [];
    if (fs.existsSync(ggufDir)) {
      for (const name of fs.readdirSync(ggufDir)) {
        if (name.toLowerCase().endsWith(".gguf")) {
          ggufPaths.push(path.join(ggufDir, name));
        }
      }
    }
    if (ggufPaths.length === 0) {
      llamaMissing.push(
        "Whisper/models/llm/*.gguf (Qwen3-0.6B GGUF Q4_K_M 推奨・手動配置・要約機能を使う場合に必要)"
      );
    }
    return { ffmpegPath, pythonPath, llamaCliPath, ggufPaths, missing, llamaMissing };
  }

  /**
   * List all GGUF models under Whisper/models/llm/ with metadata.
   * Used by the model selector dropdown in the renderer.
   * @returns {Array<{ name: string, path: string, sizeMB: number }>}
   */
  listGgufModels() {
    const ggufDir = this.resolveBundledPath("models", "llm");
    const models = [];
    if (!fs.existsSync(ggufDir)) return models;
    for (const name of fs.readdirSync(ggufDir)) {
      if (!name.toLowerCase().endsWith(".gguf")) continue;
      const fullPath = path.join(ggufDir, name);
      try {
        const stat = fs.statSync(fullPath);
        models.push({
          name,
          path: fullPath,
          sizeMB: Math.round(stat.size / (1024 * 1024)),
        });
      } catch (_) {
        // skip unreadable files
      }
    }
    // Sort by size ascending (smaller models first = faster inference)
    models.sort((a, b) => a.sizeMB - b.sizeMB);
    return models;
  }

  /**
   * Resolve model/script paths from renderer modelArgs (relative to app root).
   * @param {{ script: string, model: string }} modelArgs
   */
  resolveModelPaths(modelArgs) {
    const scriptPath = path.join(this.appRootDir, modelArgs.script);
    const modelPath = path.join(this.appRootDir, modelArgs.model);
    return { scriptPath, modelPath };
  }
}

module.exports = { RuntimeLayout };
