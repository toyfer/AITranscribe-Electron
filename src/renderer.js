/**
 * Renderer UI — UIController + MODEL_CATALOG.
 * Talks only via window.electronAPI (preload). ProgressBar is in progressbar.js.
 *
 * Local CTranslate2 dirs under src/Whisper/models/<dir>/ — see docs/models.md.
 */

/**
 * Single source of truth: UI id ↔ local dir ↔ HF source ↔ progress multiplier.
 * estimatedDurationMul ≈ CPU int8 wall-time / audio length (rough).
 */
const MODEL_CATALOG = Object.freeze([
  {
    id: "small",
    label: "速度重視 — small（軽量・CPU向け）",
    dir: "small",
    hf: "Systran/faster-whisper-small",
    estimatedDurationMul: 0.7,
    default: false,
  },
  {
    id: "turbo",
    label: "精度重視（デフォルト）— large-v3-turbo",
    dir: "turbo",
    hf: "deepdml/faster-whisper-large-v3-turbo-ct2",
    estimatedDurationMul: 0.55,
    default: true,
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

    if (!window.electronAPI) {
      const msg =
        "[System] preload が読み込めていません（window.electronAPI が未定義）。" +
        "sandbox preload で app モジュールを require していないか確認してください。";
      console.error(msg);
      if (this.outputTextareaElement) {
        this.outputTextareaElement.value = msg + "\n";
      }
      alert("内部エラー: ファイル選択 API が利用できません。アプリを再起動するか、開発者へ報告してください。");
      return;
    }

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
      `配置: src/Whisper/models/${entry.dir}/  ← ${entry.hf}（オフライン事前配置・docs/models.md）`;
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
    try {
      const filePath = await window.electronAPI.openFile();
      if (filePath) {
        this.filePathElement.value = filePath;
        // file:// プロトコルでローカルパスを読む（Windows パスはそのままで可）
        this.audioFile.src = filePath.startsWith("file:")
          ? filePath
          : `file:///${filePath.replace(/\\/g, "/")}`;
      }
    } catch (err) {
      console.error(err);
      alert(`ファイル選択に失敗しました: ${err && err.message ? err.message : err}`);
    }
  }

  setUiBusy(isBusy) {
    this.runFFmpegButton.disabled = isBusy;
    this.runFFmpegButton.innerText = isBusy ? "処理中です…" : "スタート";
    this.filePathElement.disabled = isBusy;
    this.fileSelectButton.disabled = isBusy;
    this.selectModelElement.disabled = isBusy;
  }

  /** Map catalog id → IPC payload. Does not mutate audioDuration. */
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
