const fs = require("fs");
const path = require("path");

/**
 * Air-gap runtime layout under src/Whisper/.
 * FFmpeg / Python Embeddable / models are NOT in git — preflight only checks local paths.
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
   * @returns {{ ffmpegPath: string, pythonPath: string, missing: string[] }}
   */
  checkRuntimeLayout() {
    const ffmpegPath = this.resolveBundledPath("ffmpeg.exe");
    const pythonPath = this.resolveBundledPath("python.exe");
    const missing = [];
    if (!fs.existsSync(ffmpegPath)) {
      missing.push("Whisper/ffmpeg.exe（ライセンス都合で同梱しない・手動配置）");
    }
    if (!fs.existsSync(pythonPath)) {
      missing.push("Whisper/python.exe（Python Embeddable 展開先）");
    }
    return { ffmpegPath, pythonPath, missing };
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
