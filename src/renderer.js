/**
 * Renderer UI — UIController + MODEL_CATALOG.
 * Talks only via window.electronAPI (preload). ProgressBar is in progressbar.js.
 *
 * Local CTranslate2 dirs under src/Whisper/models/<dir>/ — see docs/models.md.
 * Progress: measured events (process:Progress); mul is cold-start fallback only.
 * Summarize: CSV -> LLM -> docx via process:Summary / return:Summary.
 *
 * Summarize model: Qwen3.5-0.8B is hard-coded; main process auto-detects
 * the GGUF under Whisper/models/llm/. User no longer picks the model.
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
    this.csvClearButton = document.getElementById("csv-clear-button");
    this.summaryTypeButtons = document.querySelectorAll('input[name="summary-type"]');
    this.logButtons = document.querySelectorAll("button[data-log-tab]");
    this.logPanes = document.querySelectorAll("[data-log-pane]");

    // Parameter input elements (Qwen3.5-0.8B model is fixed, no selector)
    this.paramCtx = document.getElementById("param-ctx");
    this.paramTokens = document.getElementById("param-tokens");
    this.paramTemp = document.getElementById("param-temp");

    this.modelButtons = document.querySelectorAll('input[name="model"]');

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();
    this.jobBusy = false;

    this.fullFilePath = "";
    this.fullCsvPath = "";

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
    this.#switchLogTab("summary");
  }

  /**
   * Read parameter values from the UI inputs with validation.
   * Model is hard-coded to Qwen3.5-0.8B in main process; renderer
   * does not pass modelPath (SummarizeJob auto-picks the GGUF).
   * @returns {{ ctxSize: number, maxTokens: number, temperature: number }}
   */
  #getSummarizeOptions() {
    const ctxSize = Math.max(512, Math.min(32768, parseInt(this.paramCtx?.value, 10) || 4096));
    const maxTokens = Math.max(128, Math.min(8192, parseInt(this.paramTokens?.value, 10) || 1024));
    const temperature = Math.max(0, Math.min(2, parseFloat(this.paramTemp?.value) || 0.4));

    return { ctxSize, maxTokens, temperature };
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());
    this.logClearButton.addEventListener("click", () => {
      // M2: clear the active log pane (transcribe or summary).
      this.#clearActiveLog();
    });

    if (this.csvSelectButton) {
      this.csvSelectButton.addEventListener("click", () => this.#pickCsvFile());
    }
    if (this.runSummarizeButton) {
      this.runSummarizeButton.addEventListener("click", () => this.#onSummarize());
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

  #clearActiveLog() {
    // Find which log pane is currently visible
    for (const pane of this.logPanes) {
      if (!pane.classList.contains("d-none")) {
        pane.value = "";
        return;
      }
    }
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
