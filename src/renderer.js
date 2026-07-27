/**
 * Renderer UI — UIController + MODEL_CATALOG.
 * Talks only via window.electronAPI (preload). ProgressBar is in progressbar.js.
 *
 * Local CTranslate2 dirs under src/Whisper/models/<dir>/ — see docs/models.md.
 * Progress: measured events (process:Progress); mul is cold-start fallback only.
 */

/**
 * Single source of truth: UI id ↔ local dir ↔ HF source ↔ fallback multiplier.
 * estimatedDurationMul ≈ CPU int8 wall-time / audio length (rough fallback).
 */
const MODEL_CATALOG = Object.freeze([
  {
    id: "small",
    label: "速度重視",
    dir: "small",
    hf: "Systran/faster-whisper-small",
    estimatedDurationMul: 0.7,
    default: false,
  },
  {
    id: "turbo",
    label: "精度重視（推奨）",
    dir: "turbo",
    hf: "deepdml/faster-whisper-large-v3-turbo-ct2",
    // CPU int8 では small より重いのが普通（旧 0.55 は過小になりやすい）
    estimatedDurationMul: 1.5,
    default: true,
  },
]);

class UIController {
  constructor() {
    this.outputTextareaElement = document.getElementById("output-textarea");
    this.fileSelectButton = document.getElementById("file-select-button");
    this.filePathElement = document.getElementById("file-path");
    this.runFFmpegButton = document.getElementById("run-ffmpeg");
    this.logClearButton = document.getElementById("log-clear-button");
    this.modelButtons = document.querySelectorAll('input[name="model"]');

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();
    this.jobBusy = false;

    /** Full path kept internally; display shows filename only */
    this.fullFilePath = "";

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

    this.#populateModelButtons();
    this.#bindEvents();
    this.#bindIpc();
  }

  #populateModelButtons() {
    for (const entry of MODEL_CATALOG) {
      const radio = document.querySelector(`input[name="model"][value="${entry.id}"]`);
      if (radio) radio.checked = entry.default;
    }
  }

  #findModel(id) {
    return MODEL_CATALOG.find((m) => m.id === id) || null;
  }

  #getSelectedModelId() {
    const checked = document.querySelector('input[name="model"]:checked');
    return checked ? checked.value : MODEL_CATALOG.find((m) => m.default)?.id || "";
  }

  /** Extract filename from a full path (Windows backslash + POSIX forward slash). */
  #basename(fullPath) {
    if (!fullPath) return "";
    const normalized = fullPath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || "";
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());
    this.logClearButton.addEventListener("click", () => {
      this.outputTextareaElement.value = "";
    });

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
      // complete イベントが先に endProgress 済みなら mode === "idle"
      // processMessage は成功・失敗両方。metrics 付き complete が無い失敗時用
      if (this.progressBar.mode !== "idle") {
        const failed = /エラー|失敗|不足|見つかりません/i.test(String(message));
        this.progressBar.endProgress(!failed);
      }
    });

    if (typeof window.electronAPI.processProgress === "function") {
      window.electronAPI.processProgress((_event, payload) => {
        console.log("[progress]", payload);
        this.progressBar.onProgressEvent(payload);
      });
    }
  }

  async #pickAudioFile() {
    try {
      const filePath = await window.electronAPI.openFile();
      if (filePath) {
        this.fullFilePath = filePath;
        this.filePathElement.value = this.#basename(filePath);
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
    this.jobBusy = isBusy;
    this.runFFmpegButton.disabled = isBusy;
    this.runFFmpegButton.innerText = isBusy ? "処理中…" : "スタート";
    this.fileSelectButton.disabled = isBusy;
    this.modelButtons.forEach((btn) => (btn.disabled = isBusy));
  }

  /** Map catalog id → IPC payload. Does not mutate audioDuration. */
  selectModelConfig(modelId, durationSec) {
    const entry = this.#findModel(modelId);
    if (!entry) return null;

    const dur = Number(durationSec) > 0 ? Number(durationSec) : 60;

    return {
      model: `Whisper\\models\\${entry.dir}`,
      script: "Whisper\\Faster-Whisper.py",
      estimatedDuration: dur * entry.estimatedDurationMul,
      audioDurationSec: dur,
      modelId: entry.id,
      hf: entry.hf,
    };
  }

  #onStart() {
    if (!this.fullFilePath) {
      alert("音声ファイルを選択してください");
      return;
    }

    const selectModel = this.selectModelConfig(
      this.#getSelectedModelId(),
      this.audioDuration || 60
    );
    if (!selectModel) {
      alert("モデルを選択してください");
      return;
    }

    this.setUiBusy(true);
    // fallback timer only until first measured event arrives
    this.progressBar.startProgress(selectModel.estimatedDuration);
    window.electronAPI.runFFmpeg([this.fullFilePath, selectModel]);
  }
}

new UIController();
