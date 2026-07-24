/**
 * Progress UI — measured events preferred; optional cold-start fallback timer.
 */
class ProgressBar {
  constructor() {
    this.progressBar = document.getElementById("progress-bar");
    this.progress = document.getElementById("progress");
    this.phaseLabel = document.getElementById("progress-phase");
    this.progress.hidden = true;

    /** @type {'idle'|'fallback'|'measured'} */
    this.mode = "idle";
    this.fallbackDuration = 0;
    this.elapsedTime = 0;
    this.intervalId = null;
    this.currentPct = 0;
    this.phaseText = "";
    this.inferStartedAt = null;
    this.lastAudioPct = 0;
    this.lastMetrics = null;
  }

  /**
   * @param {number} [fallbackDurationSec] used only until first measured event
   */
  startProgress(fallbackDurationSec) {
    this.#clearTimer();
    this.mode = "fallback";
    this.fallbackDuration = Math.max(Number(fallbackDurationSec) || 1, 1);
    this.elapsedTime = 0;
    this.currentPct = 0;
    this.phaseText = "準備中…";
    this.inferStartedAt = null;
    this.lastAudioPct = 0;
    this.lastMetrics = null;

    this.progress.hidden = false;
    this.#paint(0, this.phaseText, { striped: false });

    this.intervalId = setInterval(() => this.#tickFallback(), 1000);
  }

  /**
   * Handle structured progress from main (process:Progress).
   * @param {object} payload
   */
  onProgressEvent(payload) {
    if (!payload || typeof payload !== "object") return;

    // First real event: switch off fallback timer (ETA uses inferStartedAt, not elapsedTime)
    if (this.mode === "fallback" || this.mode === "idle") {
      this.mode = "measured";
      this.#clearTimer();
    }

    if (payload.type === "complete") {
      this.lastMetrics = payload.metrics || null;
      const extra = this.#formatMetrics(payload.metrics);
      this.endProgress(true, extra);
      return;
    }

    if (payload.type === "timing") {
      // keep bar near end; label already set by phase
      return;
    }

    const pct = Math.max(
      this.currentPct,
      Math.min(100, Number(payload.pct) || 0)
    );
    this.currentPct = pct;

    let label = payload.label || payload.phase || "";
    if (payload.type === "progress" || payload.phase === "infer") {
      if (!this.inferStartedAt) this.inferStartedAt = Date.now();
      if (payload.audio_pct != null) {
        this.lastAudioPct = Number(payload.audio_pct) || 0;
      }
      const eta = this.#etaText();
      const audioBit =
        payload.audio_end != null && payload.duration != null
          ? ` ${Number(payload.audio_end).toFixed(0)}s / ${Number(payload.duration).toFixed(0)}s`
          : "";
      label = `推論中${audioBit}${eta}`;
    } else if (payload.mode === "indeterminate") {
      label = `${label}…`;
    }

    this.phaseText = label;
    const indeterminate =
      payload.mode === "indeterminate" && (payload.type === "phase" || !payload.type);
    this.#paint(pct, label, {
      striped: indeterminate || (pct > 0 && pct < 100 && payload.phase === "infer"),
    });
  }

  #etaText() {
    if (!this.inferStartedAt || this.lastAudioPct < 3) return "";
    const elapsed = (Date.now() - this.inferStartedAt) / 1000;
    const rate = this.lastAudioPct / 100;
    if (rate <= 0.01) return "";
    const remain = elapsed * (1 / rate - 1);
    if (!Number.isFinite(remain) || remain < 0) return "";
    if (remain < 5) return " · 残りわずか";
    if (remain < 90) return ` · 残り ~${Math.ceil(remain)}秒`;
    return ` · 残り ~${Math.ceil(remain / 60)}分`;
  }

  #formatMetrics(m) {
    if (!m) return "";
    const bits = [];
    if (m.t_total_sec != null) bits.push(`合計 ${Number(m.t_total_sec).toFixed(1)}s`);
    if (m.rtf_total != null) bits.push(`RTF ${Number(m.rtf_total).toFixed(2)}`);
    if (m.python && m.python.rtf_infer != null) {
      bits.push(`推論RTF ${Number(m.python.rtf_infer).toFixed(2)}`);
    }
    return bits.length ? bits.join(" / ") : "";
  }

  #tickFallback() {
    if (this.mode !== "fallback") {
      this.#clearTimer();
      return;
    }

    const ratio = Math.min(this.elapsedTime / this.fallbackDuration, 0.92);
    const percent = Math.floor(ratio * 1000) / 10;
    this.currentPct = percent;
    this.elapsedTime += 1;

    if (this.elapsedTime >= this.fallbackDuration) {
      this.#paint(92, "処理中（実測待ち）…", { striped: true });
      this.#clearTimer();
      return;
    }

    this.#paint(percent, `開始中… ${percent}%`, { striped: false });
  }

  #paint(percent, text, { striped = false } = {}) {
    const p = Math.max(0, Math.min(100, percent));
    // Visual fill on inner bar; ARIA on outer #progress (role="progressbar")
    this.progressBar.style.width = p + "%";
    this.progressBar.innerText = text || `${p}%`;
    this.progressBar.setAttribute("style", `width:${p}%`);
    this.progress.setAttribute("aria-valuenow", String(Math.round(p)));

    if (striped) {
      this.progressBar.setAttribute(
        "class",
        "progress-bar progress-bar-striped progress-bar-animated"
      );
    } else {
      this.progressBar.setAttribute("class", "progress-bar bg-success");
    }

    if (this.phaseLabel) {
      this.phaseLabel.textContent = text || "";
      this.phaseLabel.hidden = !text;
    }
  }

  #clearTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  endProgress(completed = false, extraText = "") {
    this.#clearTimer();
    this.mode = "idle";
    const label = completed
      ? extraText
        ? `完了しました! (${extraText})`
        : "完了しました!"
      : "もう少しで完了します...";
    this.currentPct = 100;
    this.#paint(100, label, { striped: !completed });
  }
}
