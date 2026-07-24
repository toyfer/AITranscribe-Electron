/**
 * Renderer UI — Phase 2 UIController.
 * Talks only via window.electronAPI (preload). ProgressBar is defined in progressbar.js.
 */
class UIController {
  constructor() {
    this.outputTextareaElement = document.getElementById("output-textarea");
    this.fileSelectButton = document.getElementById("file-select-button");
    this.filePathElement = document.getElementById("file-path");
    this.selectModelElement = document.getElementById("select-model");
    this.runFFmpegButton = document.getElementById("run-ffmpeg");

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();

    this.#bindEvents();
    this.#bindIpc();
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.filePathElement.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());

    this.audioFile.addEventListener("loadedmetadata", () => {
      console.log(this.audioFile.duration);
      this.audioDuration = this.audioFile.duration;
    });
  }

  #bindIpc() {
    window.electronAPI.returnCommand((_event, output) => {
      console.log(output);
      this.outputTextareaElement.value += output;
      this.outputTextareaElement.scrollTop = this.outputTextareaElement.scrollHeight;
    });

    // 開始・終了・エラー通知（UI 復帰の単一入口）
    window.electronAPI.processMessage((_event, message) => {
      new Notification("Ai文字起こし", { body: message });
      this.setUiBusy(false);
      this.progressBar.endProgress(true);
    });
  }

  async #pickAudioFile() {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
      this.filePathElement.value = filePath;
      // file:// でメタデータ取得（ローカルパス）
      this.audioFile.src = filePath;
    }
  }

  setUiBusy(isBusy) {
    this.runFFmpegButton.disabled = isBusy;
    this.runFFmpegButton.innerText = isBusy ? "処理中です…" : "スタート";
    this.filePathElement.disabled = isBusy;
    this.fileSelectButton.disabled = isBusy;
    this.selectModelElement.disabled = isBusy;
  }

  /**
   * Map UI model value → paths + estimated progress duration.
   * Does not mutate this.audioDuration (prevents stacked multipliers).
   *
   * Multipliers are rough CPU int8 wall-time vs audio length (air-gap PC).
   * turbo ≈ large-v3 quality with fewer decoder layers → often faster than medium.
   */
  selectModelConfig(modelValue, durationSec) {
    switch (modelValue) {
      case "1":
        return {
          model: "Whisper\\models\\small",
          script: "Whisper\\Faster-Whisper.py",
          estimatedDuration: durationSec * 0.7,
        };
      case "2":
        return {
          model: "Whisper\\models\\medium",
          script: "Whisper\\Faster-Whisper.py",
          estimatedDuration: durationSec * 1.3,
        };
      case "3":
        // large-v3-turbo (CTranslate2) — see docs/models.md
        return {
          model: "Whisper\\models\\turbo",
          script: "Whisper\\Faster-Whisper.py",
          estimatedDuration: durationSec * 0.55,
        };
      default:
        return null;
    }
  }

  #onStart() {
    if (!this.filePathElement.value) {
      alert("音声ファイルを選択してください");
      return;
    }

    const selectModel = this.selectModelConfig(
      this.selectModelElement.value,
      this.audioDuration || 60
    );
    if (!selectModel) {
      alert("モデルを選択してください");
      return;
    }

    this.setUiBusy(true);
    this.progressBar.startProgress(selectModel.estimatedDuration);
    window.electronAPI.runFFmpeg([this.filePathElement.value, selectModel]);
  }
}

// Bootstrap (classic script; ProgressBar already loaded via index.html)
new UIController();
