/**
 * Summarize-Suppoter renderer — separate window for the summarize feature.
 * Mirrors the SummarizeJob UIController logic that used to live in
 * src/renderer.js. Talks only via window.electronAPI (preload).
 *
 * UI: パラメータ + 要約種別 + CSV選択 + 進捗 + ログ
 */

const SUMMARY_MSG_REGEX = /要約|llama|GGUF|csvPath|docx|タイムアウト|ctx/;

class SummarizeSuppoterController {
  constructor() {
    this.summaryLogElement = document.getElementById("summary-log");
    this.csvSelectButton = document.getElementById("csv-select-button");
    this.csvPathElement = document.getElementById("csv-path");
    this.runSummarizeButton = document.getElementById("run-summarize");
    this.csvClearButton = document.getElementById("csv-clear-button");
    this.logClearButton = document.getElementById("log-clear-button");
    this.summaryTypeButtons = document.querySelectorAll('input[name="summary-type"]');
    this.progressPhase = document.getElementById("progress-phase");

    this.paramCtx = document.getElementById("param-ctx");
    this.paramTokens = document.getElementById("param-tokens");
    this.paramTemp = document.getElementById("param-temp");

    this.fullCsvPath = "";
    this.progressBar = new ProgressBar();
    this.jobBusy = false;

    if (!window.electronAPI) {
      const msg =
        "[System] preload が読み込めていません（window.electronAPI が未定義）。" +
        "sandbox preload で app モジュールを require していないか確認してください。";
      console.error(msg);
      if (this.summaryLogElement) {
        this.summaryLogElement.value = msg + "\n";
      }
      alert("内部エラー: ファイル選択 API が利用できません。アプリを再起動するか、開発者へ報告してください。");
      return;
    }

    this.#bindEvents();
    this.#bindIpc();
  }

  #basename(fullPath) {
    if (!fullPath) return "";
    const normalized = fullPath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || "";
  }

  #appendLog(message) {
    if (!this.summaryLogElement) return;
    this.summaryLogElement.value +=
      `[${new Date().toLocaleTimeString("ja-JP")}] ${message}\n`;
    this.summaryLogElement.scrollTop = this.summaryLogElement.scrollHeight;
  }

  #getSelectedSummaryType() {
    const checked = document.querySelector('input[name="summary-type"]:checked');
    return checked ? checked.value : "bullets";
  }

  /**
   * Read parameter values from the UI inputs with validation.
   * Uses Number.isFinite() so an explicit value of 0 (e.g. temperature=0)
   * is preserved instead of being replaced by the default.
   * @returns {{ ctxSize: number, maxTokens: number, temperature: number }}
   */
  #getSummarizeOptions() {
    const rawCtx = parseInt(this.paramCtx?.value, 10);
    const ctxSize = Math.max(
      512,
      Math.min(32768, Number.isFinite(rawCtx) ? rawCtx : 4096)
    );

    const rawTokens = parseInt(this.paramTokens?.value, 10);
    const maxTokens = Math.max(
      128,
      Math.min(8192, Number.isFinite(rawTokens) ? rawTokens : 1024)
    );

    const rawTemp = Number.parseFloat(this.paramTemp?.value);
    const temperature = Math.max(
      0,
      Math.min(2, Number.isFinite(rawTemp) ? rawTemp : 0.4)
    );

    return { ctxSize, maxTokens, temperature };
  }

  setUiBusy(isBusy) {
    this.jobBusy = isBusy;
    if (this.runSummarizeButton) {
      this.runSummarizeButton.disabled = isBusy;
      this.runSummarizeButton.innerText = isBusy ? "要約中…" : "要約を実行";
    }
    if (this.csvSelectButton) this.csvSelectButton.disabled = isBusy;
    if (this.csvClearButton) this.csvClearButton.disabled = isBusy;
    for (const btn of this.summaryTypeButtons) btn.disabled = isBusy;
  }

  #bindEvents() {
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
    if (this.logClearButton) {
      this.logClearButton.addEventListener("click", () => {
        if (this.summaryLogElement) this.summaryLogElement.value = "";
      });
    }
  }

  #bindIpc() {
    if (window.electronAPI.returnSummary) {
      window.electronAPI.returnSummary((_event, output) => {
        if (this.summaryLogElement) {
          this.summaryLogElement.value += output;
          this.summaryLogElement.scrollTop = this.summaryLogElement.scrollHeight;
        }
      });
    }

    if (window.electronAPI.processMessage) {
      window.electronAPI.processMessage((_event, message) => {
        // Mirror summarize-related messages to the log so the user sees
        // errors even if they miss the transient toast notification.
        if (SUMMARY_MSG_REGEX.test(String(message))) {
          this.#appendLog(message);
        }
        this.setUiBusy(false);
        if (this.progressBar.mode !== "idle") {
          const failed = /エラー|失敗|不足|見つかりません|タイムアウト/i.test(String(message));
          this.progressBar.endProgress(!failed);
        }
      });
    }

    if (typeof window.electronAPI.processSummary === "function") {
      window.electronAPI.processSummary((_event, payload) => {
        // Just route raw phases to the log for visibility
        if (payload && payload.label) {
          this.#appendLog(payload.label);
        }
      });
    }

    // processProgress is for the transcribe job — ignore here, but keep
    // the listener attached so the preload contract is satisfied.
    if (typeof window.electronAPI.processProgress === "function") {
      window.electronAPI.processProgress((_event, _payload) => {});
    }
    if (typeof window.electronAPI.returnCommand === "function") {
      window.electronAPI.returnCommand((_event, _output) => {});
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

    this.setUiBusy(true);
    if (this.summaryLogElement) {
      this.summaryLogElement.value = "";
      this.#appendLog("要約を開始します");
    }
    this.progressBar.startProgress(60);
    window.electronAPI.runSummarize({
      csvPath: this.fullCsvPath,
      outputPath,
      type: this.#getSelectedSummaryType(),
      options,
    });
  }
}

new SummarizeSuppoterController();
