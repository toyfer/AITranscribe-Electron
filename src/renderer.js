/**
 * Renderer UI — UIController + MODEL_CATALOG.
 * Talks only via window.electronAPI (preload). ProgressBar is in progressbar.js.
 *
 * Local CTranslate2 dirs under src/Whisper/models/<dir>/ — see docs/models.md.
 * Progress: measured events (process:Progress); mul is cold-start fallback only.
 * Summarize: CSV -> LLM -> docx via process:Summary / return:Summary.
 * Model selector: listLlms() populates dropdown for GGUF model selection.
 */

/**
 * Single source of truth: UI id <-> local dir <-> HF source <-> fallback multiplier.
 * estimatedDurationMul ~ CPU int8 wall-time / audio length (rough fallback).
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
    estimatedDurationMul: 1.5,
    default: true,
  },
]);

/** Summary types (mirrors SummarizeJob). */
const SUMMARY_TYPES = [
  { id: "minutes", label: "議事録" },
  { id: "bullets", label: "箇条書き" },
  { id: "summary", label: "要約" },
];

/** Heuristic: messages that pertain to the summarize feature. */
const SUMMARY_MSG_REGEX = /要約|llama|GGUF|csvPath|docx|タイムアウト|ctx/;

class UIController {
  constructor() {
    this.outputTextareaElement = document.getElementById("output-textarea");
    this.summaryLogElement = document.getElementById("summary-log");
    this.fileSelectButton = document.getElementById("file-select-button");
    this.filePathElement = document.getElementById("file-path");
    this.runFFmpegButton = document.getElementById("run-ffmpeg");
    this.logClearButton = document.getElementById("log-clear-button");

    this.csvSelectButton = document.getElementById("csv-select-button");
    this.csvPathElement = document.getElementById("csv-path");
    this.runSummarizeButton = document.getElementById("run-summarize");
    this.summaryClearButton = document.getElementById("summary-clear-button");
    this.csvClearButton = document.getElementById("csv-clear-button");
    this.summaryTypeButtons = document.querySelectorAll('input[name="summary-type"]');
    this.logButtons = document.querySelectorAll("button[data-log-tab]");
    this.logPanes = document.querySelectorAll("[data-log-pane]");

    // LLM model selector elements
    this.llmModelSelect = document.getElementById("llm-model-select");
    this.llmModelInfo = document.getElementById("llm-model-info");

    // Parameter input elements
    this.paramCtx = document.getElementById("param-ctx");
    this.paramTokens = document.getElementById("param-tokens");
    this.paramTemp = document.getElementById("param-temp");

    this.modelButtons = document.querySelectorAll('input[name="model"]');

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();
    this.jobBusy = false;

    /** Full path kept internally; display shows filename only */
    this.fullFilePath = "";
    /** Full CSV path for summarization. */
    this.fullCsvPath = "";

    /** Available GGUF models from main process. */
    this.llmModels = [];

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
    this.#loadLlmModels();
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

  #getSelectedSummaryType() {
    const checked = document.querySelector('input[name="summary-type"]:checked');
    return checked ? checked.value : "bullets";
  }

  /** Extract filename from a full path (Windows backslash + POSIX forward slash). */
  #basename(fullPath) {
    if (!fullPath) return "";
    const normalized = fullPath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || "";
  }

  #appendSummaryLog(message) {
    if (!this.summaryLogElement) return;
    this.summaryLogElement.value +=
      `[${new Date().toLocaleTimeString("ja-JP")}] ${message}\n`;
    this.summaryLogElement.scrollTop = this.summaryLogElement.scrollHeight;
    // Auto-switch to the summary log tab so the user actually sees
    // the error rather than missing the transient toast.
    this.#switchLogTab("summary");
  }

  /**
   * Fetch available GGUF models from main process and populate the dropdown.
   */
  async #loadLlmModels() {
    if (!this.llmModelSelect) return;
    if (typeof window.electronAPI.listLlms !== "function") return;

    try {
      const models = await window.electronAPI.listLlms();
      this.llmModels = Array.isArray(models) ? models : [];

      // Clear placeholder
      this.llmModelSelect.innerHTML = "";

      if (this.llmModels.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "モデルが見つかりません";
        this.llmModelSelect.appendChild(opt);
        this.llmModelSelect.disabled = true;
        if (this.llmModelInfo) {
          this.llmModelInfo.textContent =
            "Whisper/models/llm/ にGGUFモデルを配置してください";
        }
        return;
      }

      this.llmModelSelect.disabled = false;
      for (const model of this.llmModels) {
        const opt = document.createElement("option");
        opt.value = model.path;
        opt.textContent = `${model.name} (${model.sizeMB} MB)`;
        this.llmModelSelect.appendChild(opt);
      }

      // Select first model by default
      this.llmModelSelect.value = this.llmModels[0].path;

      if (this.llmModelInfo) {
        const count = this.llmModels.length;
        const totalMB = this.llmModels.reduce((sum, m) => sum + m.sizeMB, 0);
        this.llmModelInfo.textContent =
          `${count} モデル利用可能 (合計 ${totalMB} MB)`;
      }
    } catch (err) {
      console.error("listLlms failed:", err);
      this.llmModelSelect.innerHTML = "";
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "モデル一覧取得エラー";
      this.llmModelSelect.appendChild(opt);
      this.llmModelSelect.disabled = true;
      if (this.llmModelInfo) {
        this.llmModelInfo.textContent = `エラー: ${err.message || err}`;
      }
    }
  }

  /**
   * Read parameter values from the UI inputs with validation.
   * @returns {{ ctxSize: number, maxTokens: number, temperature: number, modelPath: string }}
   */
  #getSummarizeOptions() {
    const ctxSize = Math.max(512, Math.min(32768, parseInt(this.paramCtx?.value, 10) || 4096));
    const maxTokens = Math.max(128, Math.min(8192, parseInt(this.paramTokens?.value, 10) || 1024));
    const temperature = Math.max(0, Math.min(2, parseFloat(this.paramTemp?.value) || 0.4));
    const modelPath = this.llmModelSelect?.value || "";

    return { ctxSize, maxTokens, temperature, modelPath };
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());
    this.logClearButton.addEventListener("click", () => {
      this.outputTextareaElement.value = "";
    });

    if (this.csvSelectButton) {
      this.csvSelectButton.addEventListener("click", () => this.#pickCsvFile());
    }
    if (this.runSummarizeButton) {
      this.runSummarizeButton.addEventListener("click", () => this.#onSummarize());
    }
    if (this.summaryClearButton) {
      this.summaryClearButton.addEventListener("click", () => {
        if (this.summaryLogElement) this.summaryLogElement.value = "";
      });
    }
    if (this.csvClearButton) {
      this.csvClearButton.addEventListener("click", () => {
        this.fullCsvPath = "";
        if (this.csvPathElement) this.csvPathElement.value = "";
      });
    }

    // Log tab switching
    for (const btn of this.logButtons) {
      btn.addEventListener("click", () => this.#switchLogTab(btn.dataset.logTab));
    }

    this.audioFile.addEventListener("loadedmetadata", () => {
      console.log(this.audioFile.duration);
      this.audioDuration = this.audioFile.duration;
    });
  }

  #switchLogTab(target) {
    for (const btn of this.logButtons) {
      const active = btn.dataset.logTab === target;
      btn.classList.toggle("btn-primary", active);
      btn.classList.toggle("btn-outline-primary", !active);
    }
    for (const pane of this.logPanes) {
      const active = pane.dataset.logPane === target;
      pane.classList.toggle("d-none", !active);
    }
  }

  #bindIpc() {
    window.electronAPI.returnCommand((_event, output) => {
      console.log(output);
      this.outputTextareaElement.value += output;
      this.outputTextareaElement.scrollTop = this.outputTextareaElement.scrollHeight;
    });

    if (window.electronAPI.returnSummary) {
      window.electronAPI.returnSummary((_event, output) => {
        console.log(output);
        if (this.summaryLogElement) {
          this.summaryLogElement.value += output;
          this.summaryLogElement.scrollTop = this.summaryLogElement.scrollHeight;
        }
      });
    }

    window.electronAPI.processMessage((_event, message) => {
      new Notification("Ai文字起こし", { body: message });

      // Mirror summarize-related messages to the summary log so the
      // user sees the actual error instead of relying on the transient
      // toast notification.
      if (SUMMARY_MSG_REGEX.test(String(message))) {
        this.#appendSummaryLog(message);
      }

      this.setUiBusy(false);
      this.setSummarizeUiBusy(false);
      if (this.progressBar.mode !== "idle") {
        const failed = /エラー|失敗|不足|見つかりません|タイムアウト/i.test(String(message));
        this.progressBar.endProgress(!failed);
      }
    });

    if (typeof window.electronAPI.processProgress === "function") {
      window.electronAPI.processProgress((_event, payload) => {
        console.log("[progress]", payload);
        this.progressBar.onProgressEvent(payload);
      });
    }

    if (typeof window.electronAPI.processSummary === "function") {
      window.electronAPI.processSummary((_event, payload) => {
        console.log("[summary progress]", payload);
        // Only update the progress bar, do NOT write phase labels
        // (e.g. "推論中 (123 chars)") to the summary log.
        // The actual inference text is streamed via returnSummary.
      });
    }
  }

  async #pickAudioFile() {
    try {
      const filePath = await window.electronAPI.openFile();
      if (filePath) {
        this.fullFilePath = filePath;
        this.filePathElement.value = this.#basename(filePath);
        this.audioFile.src = filePath.startsWith("file:")
          ? filePath
          : `file:///${filePath.replace(/\\/g, "/")}`;
      }
    } catch (err) {
      console.error(err);
      alert(`ファイル選択に失敗しました: ${err && err.message ? err.message : err}`);
    }
  }

  async #pickCsvFile() {
    try {
      const filePath = await window.electronAPI.openCsv();
      if (filePath) {
        this.fullCsvPath = filePath;
        this.csvPathElement.value = this.#basename(filePath);
      }
    } catch (err) {
      console.error(err);
      alert(`CSV 選択に失敗しました: ${err && err.message ? err.message : err}`);
    }
  }

  setUiBusy(isBusy) {
    this.jobBusy = isBusy;
    this.runFFmpegButton.disabled = isBusy;
    this.runFFmpegButton.innerText = isBusy ? "処理中…" : "スタート";
    this.fileSelectButton.disabled = isBusy;
    this.modelButtons.forEach((btn) => (btn.disabled = isBusy));
  }

  setSummarizeUiBusy(isBusy) {
    if (this.runSummarizeButton) {
      this.runSummarizeButton.disabled = isBusy;
      this.runSummarizeButton.innerText = isBusy ? "要約中…" : "要約を実行";
    }
    if (this.csvSelectButton) this.csvSelectButton.disabled = isBusy;
    if (this.csvClearButton) this.csvClearButton.disabled = isBusy;
    for (const btn of this.summaryTypeButtons) btn.disabled = isBusy;
    // Disable model selector and parameter inputs during inference
    if (this.llmModelSelect) this.llmModelSelect.disabled = isBusy;
    if (this.paramCtx) this.paramCtx.disabled = isBusy;
    if (this.paramTokens) this.paramTokens.disabled = isBusy;
    if (this.paramTemp) this.paramTemp.disabled = isBusy;
  }

  /** Map catalog id -> IPC payload. Does not mutate audioDuration. */
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
    this.progressBar.startProgress(selectModel.estimatedDuration);
    window.electronAPI.runFFmpeg([this.fullFilePath, selectModel]);
  }

  async #onSummarize() {
    if (!this.fullCsvPath) {
      alert("CSV ファイルを選択してください");
      return;
    }
    if (typeof window.electronAPI.saveDocx !== "function") {
      alert("docx 保存ダイアログが利用できません");
      return;
    }
    const baseName = this.#basename(this.fullCsvPath).replace(/\.csv$/i, "");
    const defaultName = `${baseName}_summary.docx`;
    let outputPath;
    try {
      outputPath = await window.electronAPI.saveDocx(defaultName);
    } catch (err) {
      console.error(err);
      alert(`保存先選択に失敗しました: ${err && err.message ? err.message : err}`);
      return;
    }
    if (!outputPath) return;

    // Read model and parameters from UI
    const options = this.#getSummarizeOptions();

    this.setSummarizeUiBusy(true);
    if (this.summaryLogElement) {
      this.summaryLogElement.value = "";
      this.summaryLogElement.value += `[${new Date().toLocaleTimeString("ja-JP")}] 要約を開始します\n`;
    }
    window.electronAPI.runSummarize({
      csvPath: this.fullCsvPath,
      outputPath,
      type: this.#getSelectedSummaryType(),
      options,
    });
  }
}

new UIController();
