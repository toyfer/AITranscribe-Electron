/**
 * Renderer UI — UIController + MODEL_CATALOG + settings modal.
 * Talks only via window.electronAPI (preload). ProgressBar is in progressbar.js.
 *
 * Settings (beam / hotwords / VAD) persist in localStorage.
 * Model default remains turbo (accuracy). Beam default is 3 (8GB-friendly).
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

/** Keep in sync with src/shared/transcribe-settings.js DEFAULTS */
const SETTINGS_STORAGE_KEY = "aitranscribe.settings.v1";
const SETTINGS_DEFAULTS = Object.freeze({
  beamSize: 3,
  hotwords: "",
  initialPrompt: "",
  vadFilter: true,
  vadMinSilenceMs: 500,
  conditionOnPreviousText: true,
});

function loadSettingsFromStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...SETTINGS_DEFAULTS };
    return normalizeSettings(parsed);
  } catch (err) {
    console.warn("[settings] load failed", err);
    return { ...SETTINGS_DEFAULTS };
  }
}

function saveSettingsToStorage(settings) {
  const normalized = normalizeSettings(settings);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  let beam = Number(src.beamSize);
  if (!Number.isFinite(beam)) beam = SETTINGS_DEFAULTS.beamSize;
  beam = Math.round(beam);
  if (beam < 1) beam = 1;
  if (beam > 10) beam = 10;
  if (![1, 3, 5].includes(beam)) {
    if (beam <= 2) beam = 1;
    else if (beam <= 4) beam = 3;
    else beam = 5;
  }

  let vadMs = Number(src.vadMinSilenceMs);
  if (!Number.isFinite(vadMs)) vadMs = SETTINGS_DEFAULTS.vadMinSilenceMs;
  vadMs = Math.round(vadMs);
  if (vadMs < 100) vadMs = 100;
  if (vadMs > 5000) vadMs = 5000;

  return {
    beamSize: beam,
    hotwords: String(src.hotwords ?? "").slice(0, 2000),
    initialPrompt: String(src.initialPrompt ?? "").slice(0, 2000),
    vadFilter: typeof src.vadFilter === "boolean" ? src.vadFilter : SETTINGS_DEFAULTS.vadFilter,
    vadMinSilenceMs: vadMs,
    conditionOnPreviousText:
      typeof src.conditionOnPreviousText === "boolean"
        ? src.conditionOnPreviousText
        : SETTINGS_DEFAULTS.conditionOnPreviousText,
  };
}

class UIController {
  constructor() {
    this.outputTextareaElement = document.getElementById("output-textarea");
    this.fileSelectButton = document.getElementById("file-select-button");
    this.filePathElement = document.getElementById("file-path");
    this.runFFmpegButton = document.getElementById("run-ffmpeg");
    this.logClearButton = document.getElementById("log-clear-button");
    this.openSettingsButton = document.getElementById("open-settings-button");

    this.modelButtons = document.querySelectorAll('input[name="model"]');

    this.settingsHotwords = document.getElementById("settings-hotwords");
    this.settingsInitialPrompt = document.getElementById("settings-initial-prompt");
    this.settingsVadFilter = document.getElementById("settings-vad-filter");
    this.settingsVadMs = document.getElementById("settings-vad-ms");
    this.settingsConditionPrev = document.getElementById("settings-condition-prev");
    this.settingsSaveButton = document.getElementById("settings-save-button");
    this.settingsResetButton = document.getElementById("settings-reset-button");
    this.settingsModalEl = document.getElementById("settings-modal");

    this.audioFile = new Audio();
    this.audioDuration = 0;
    this.progressBar = new ProgressBar();
    this.jobBusy = false;
    this.fullFilePath = "";
    this.settings = loadSettingsFromStorage();

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
    this.#fillSettingsForm(this.settings);
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

  #basename(fullPath) {
    if (!fullPath) return "";
    const normalized = fullPath.replace(/\\/g, "/");
    const parts = normalized.split("/");
    return parts[parts.length - 1] || "";
  }

  #getSelectedBeamSize() {
    const checked = document.querySelector('input[name="settings-beam"]:checked');
    const n = checked ? Number(checked.value) : SETTINGS_DEFAULTS.beamSize;
    return [1, 3, 5].includes(n) ? n : SETTINGS_DEFAULTS.beamSize;
  }

  #setBeamRadio(beamSize) {
    const v = [1, 3, 5].includes(Number(beamSize)) ? String(beamSize) : "3";
    const el = document.querySelector(`input[name="settings-beam"][value="${v}"]`);
    if (el) el.checked = true;
  }

  #fillSettingsForm(settings) {
    const s = normalizeSettings(settings);
    if (this.settingsHotwords) this.settingsHotwords.value = s.hotwords;
    if (this.settingsInitialPrompt) this.settingsInitialPrompt.value = s.initialPrompt;
    this.#setBeamRadio(s.beamSize);
    if (this.settingsVadFilter) this.settingsVadFilter.checked = s.vadFilter;
    if (this.settingsVadMs) this.settingsVadMs.value = String(s.vadMinSilenceMs);
    if (this.settingsConditionPrev) this.settingsConditionPrev.checked = s.conditionOnPreviousText;
  }

  #readSettingsForm() {
    return normalizeSettings({
      beamSize: this.#getSelectedBeamSize(),
      hotwords: this.settingsHotwords ? this.settingsHotwords.value : "",
      initialPrompt: this.settingsInitialPrompt ? this.settingsInitialPrompt.value : "",
      vadFilter: this.settingsVadFilter ? this.settingsVadFilter.checked : true,
      vadMinSilenceMs: this.settingsVadMs ? Number(this.settingsVadMs.value) : 500,
      conditionOnPreviousText: this.settingsConditionPrev
        ? this.settingsConditionPrev.checked
        : true,
    });
  }

  #bindEvents() {
    this.fileSelectButton.addEventListener("click", () => this.#pickAudioFile());
    this.runFFmpegButton.addEventListener("click", () => this.#onStart());
    this.logClearButton.addEventListener("click", () => {
      this.outputTextareaElement.value = "";
    });

    this.audioFile.addEventListener("loadedmetadata", () => {
      this.audioDuration = this.audioFile.duration;
    });

    if (this.settingsModalEl) {
      this.settingsModalEl.addEventListener("show.bs.modal", () => {
        this.#fillSettingsForm(this.settings);
      });
    }

    if (this.settingsSaveButton) {
      this.settingsSaveButton.addEventListener("click", () => {
        this.settings = saveSettingsToStorage(this.#readSettingsForm());
        if (window.bootstrap && this.settingsModalEl) {
          const modal = bootstrap.Modal.getInstance(this.settingsModalEl);
          if (modal) modal.hide();
        }
        if (this.outputTextareaElement) {
          this.outputTextareaElement.value +=
            `[設定] 保存しました（beam=${this.settings.beamSize}）\n`;
        }
      });
    }

    if (this.settingsResetButton) {
      this.settingsResetButton.addEventListener("click", () => {
        this.#fillSettingsForm(SETTINGS_DEFAULTS);
      });
    }
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

  setUiBusy(isBusy) {
    this.jobBusy = isBusy;
    this.runFFmpegButton.disabled = isBusy;
    this.runFFmpegButton.innerText = isBusy ? "処理中…" : "スタート";
    this.fileSelectButton.disabled = isBusy;
    this.modelButtons.forEach((btn) => (btn.disabled = isBusy));
    if (this.openSettingsButton) this.openSettingsButton.disabled = isBusy;
  }

  selectModelConfig(modelId, durationSec) {
    const entry = this.#findModel(modelId);
    if (!entry) return null;

    const dur = Number(durationSec) > 0 ? Number(durationSec) : 60;
    const settings = normalizeSettings(this.settings);

    return {
      model: `Whisper\\models\\${entry.dir}`,
      script: "Whisper\\Faster-Whisper.py",
      estimatedDuration: dur * entry.estimatedDurationMul,
      audioDurationSec: dur,
      modelId: entry.id,
      hf: entry.hf,
      options: {
        beamSize: settings.beamSize,
        hotwords: settings.hotwords,
        initialPrompt: settings.initialPrompt,
        vadFilter: settings.vadFilter,
        vadMinSilenceMs: settings.vadMinSilenceMs,
        conditionOnPreviousText: settings.conditionOnPreviousText,
      },
    };
  }

  #onStart() {
    if (!this.fullFilePath) {
      alert("音声ファイルを選択してください");
      return;
    }

    this.settings = loadSettingsFromStorage();

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
}

new UIController();
