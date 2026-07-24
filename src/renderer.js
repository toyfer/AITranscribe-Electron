/**
 * Renderer UI — Phase 2 UIController + Phase 4 model catalog.
 * Talks only via window.electronAPI (preload). ProgressBar is defined in progressbar.js.
 *
 * Models are CTranslate2 weights placed under src/Whisper/models/<dir>/ (air-gap).
 * See README for Hugging Face sources.
 */

/**
 * Single source of truth for UI options ↔ local model dirs.
 * estimatedDurationMul: rough CPU int8 wall-time vs audio length (progress bar only).
 *
 * Why turbo (not distil):
 * - large-v3-turbo: multilingual (JA OK), ~809M, decoder layers cut → much faster than large-v3
 * - distil-large-v3: English-oriented; poor fit for Japanese air-gap use
 */
const MODEL_CATALOG = Object.freeze([
  {
    id: "small",
    label: "高速 — small（CPU向け・軽量）",
    dir: "small",
    hf: "Systran/faster-whisper-small",
    estimatedDurationMul: 0.6,
    default: false,
  },
  {
    id: "turbo",
    label: "バランス（推奨）— large-v3-turbo（高精度を効率化）",
    dir: "turbo",
    hf: "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    estimatedDurationMul: 0.95,
    default: true,
  },
  {
    id: "medium",
    label: "精度 — medium（従来の精度重視）",
    dir: "medium",
    hf: "Systran/faster-whisper-medium",
    estimatedDurationMul: 1.3,
    default: false,
  },
  {
    id: "large-v3",
    label: "最高精度 — large-v3（CPUでは遅い）",
    dir: "large-v3",
    hf: "Systran/faster-whisper-large-v3",
    estimatedDurationMul: 3.0,
    default: false,
  },
]);

class UIController {
  constructor() {
    this.outputTextareaElement = document.getElementById("output-textarea");
    this.fileSelectButton = document.getElementById("file-select-button");
    this.filePathElement = document.getElementById("file-path");
    this.selectModelElement = document.getElementById("select-model");
    this.runFFmpegButton = document.getElementById("run-ffmpeg");
    this.modelHintElement = document.getElementById("model-hint");

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();

    this.#populateModelSelect();
    this.#bindEvents();
    this.#bindIpc();
    this.#updateModelHint();
  }

  #populateModelSelect() {
    this.selectModelElement.innerHTML = "";
    for (const entry of MODEL_CATALOG) {
      const opt = document.createElement("option");
      opt.value = entry.id;
      opt.textContent = entry.label;
      if (entry.default) opt.selected = true;
      this.selectModelElement.appendChild(opt);
    }
  }

  #findModel(id) {
    return MODEL_CATALOG.find((m) => m.id === id) || null;
  }

  #updateModelHint() {
    if (!this.modelHintElement) return;
    const entry = this.#findModel(this.selectModelElement.value);
    if (!entry) {
      this.modelHintElement.textContent = "";
      return;
    }
    this.modelHintElement.textContent =
      `配置先: src/Whisper/models/${entry.dir}/  ← ${entry.hf}（オフライン事前配置）`;
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.filePathElement.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());
    this.selectModelElement.addEventListener("change", () => this.#updateModelHint());

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

  selectModelConfig(modelId, durationSec) {
    const entry = this.#findModel(modelId);
    if (!entry) return null;

    return {
      model: `Whisper\\models\\${entry.dir}`,
      script: "Whisper\\Faster-Whisper.py",
      estimatedDuration: durationSec * entry.estimatedDurationMul,
      modelId: entry.id,
      hf: entry.hf,
    };
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

new UIController();
