const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const AIT_PREFIX = "__AIT__";

const DEFAULT_CTX_SIZE = 4096;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.4;
const INFERENCE_TIMEOUT_MS = 10 * 60 * 1000;
// Qwen3.x emits reasoning blocks in either `<think>...</think>` or
// `[Start thinking] ... [End thinking]` form depending on the GGUF
// build and sampling flags. Strip both from the stream.
const THINKING_BLOCK_RE = /<think>[\s\S]*?<\/think>|\[Start thinking\][\s\S]*?(?:\[End thinking\]|$)/gi;
const BANNER_RE = /^[▄█\s]+|build\s+:|model\s+:|ftype\s+:|modalities\s+:|available commands:|\/exit|\/regen|\/clear|\/read|\/glob|Loading model/i;

const stateMap = new WeakMap();

function getState(self) {
  let s = stateMap.get(self);
  if (!s) {
    s = { accumulated: "", displayedLength: 0 };
    stateMap.set(self, s);
  }
  return s;
}

function resetState(self) {
  stateMap.set(self, { accumulated: "", displayedLength: 0 });
}

class SummarizeJob {
  constructor({ runtime, sendProcessMessage, sendLog, sendProgress }) {
    this.runtime = runtime;
    this.sendProcessMessage = sendProcessMessage;
    this.sendLog = sendLog || (() => {});
    this.sendProgress =
      typeof sendProgress === "function" ? sendProgress : () => {};
  }

  /**
   * Pick the best GGUF model from ggufPaths.
   * Preference (higher score wins, ties broken by smaller file):
   *   4. filename matches "qwen3.5-0.8b"
   *   3. filename matches "qwen3.5"
   *   2. filename matches "qwen3"
   *   1. anything else
   * Without this, the choice depends on fs.readdirSync() ordering
   * which is filesystem-dependent (NTFS sorts, ext4 may not).
   * @param {string[]} ggufPaths
   * @returns {string|null}
   */
  pickModel(ggufPaths) {
    if (!ggufPaths || ggufPaths.length === 0) return null;
    if (ggufPaths.length === 1) return ggufPaths[0];
    const scoreAndSize = (p) => {
      const name = path.basename(p).toLowerCase();
      let score = 1;
      if (name.includes("qwen3.5-0.8b")) score = 4;
      else if (name.includes("qwen3.5")) score = 3;
      else if (name.includes("qwen3")) score = 2;
      let sizeMB = Infinity;
      try { sizeMB = fs.statSync(p).size / (1024 * 1024); } catch (_) {}
      return { p, score, sizeMB };
    };
    const ranked = ggufPaths
      .map(scoreAndSize)
      .sort((a, b) => (b.score - a.score) || (a.sizeMB - b.sizeMB));
    return ranked[0].p;
  }

  async start(_event, args) {
    resetState(this);

    const csvPath = args && args.csvPath;
    const outputPath = args && args.outputPath;
    const type = (args && args.type) || "bullets";
    const options = (args && args.options) || {};

    if (!csvPath || !outputPath) {
      this.sendProcessMessage(`[${this.ts()}:System]csvPath と outputPath は必須です`);
      return;
    }
    if (!fs.existsSync(csvPath)) {
      this.sendProcessMessage(`[${this.ts()}:System]CSV が見つかりません: ${csvPath}`);
      return;
    }

    const { llamaCliPath, ggufPaths } = this.runtime.checkRuntimeLayout();
    if (!fs.existsSync(llamaCliPath)) {
      this.sendProcessMessage(
        `[${this.ts()}:System]llama-cli.exe が見つかりません: ${llamaCliPath}\n` +
          "Whisper/ 配下に llama-cli.exe を手動配置してください (https://github.com/ggerganov/llama.cpp)."
      );
      return;
    }
    if (ggufPaths.length === 0) {
      this.sendProcessMessage(
        `[${this.ts()}:System]GGUF モデルが見つかりません。\n` +
          "Whisper/models/llm/ 配下に Qwen3.5-0.8B GGUF Q4_K_M などを手動配置してください。"
      );
      return;
    }
    const modelPath = this.pickModel(ggufPaths);

    let csvText;
    try {
      csvText = fs.readFileSync(csvPath, "utf8");
    } catch (err) {
      this.sendProcessMessage(
        `[${this.ts()}:System]CSV 読み込み失敗: ${err.message}`
      );
      return;
    }

    const prompt = this.buildPrompt(csvText, type);
    const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    const ctxSize = options.ctxSize || DEFAULT_CTX_SIZE;
    const temperature = options.temperature != null ? options.temperature : DEFAULT_TEMPERATURE;

    const modelName = path.basename(modelPath);
    this.sendLog(`[${this.ts()}:System]モデル: ${modelName} (${ctxSize} ctx, ${maxTokens} tokens, temp ${temperature})\n`);

    this.emit({ type: "phase", phase: "load", label: "モデル読込中", pct: 0, mode: "indeterminate" });

    // -no-cnv disables conversation mode so llama-cli exits after the
    // single text completion instead of entering interactive mode.
    // --single-turn was previously added redundantly; the official README
    // documents -no-cnv as the canonical flag.
    const llamaArgs = [
      "-m", modelPath,
      "-p", prompt,
      "-n", String(maxTokens),
      "-c", String(ctxSize),
      "--temp", String(temperature),
      "--no-display-prompt",
      "--log-disable",
      "-no-cnv",
    ];

    const t0 = Date.now();
    const child = spawn(llamaCliPath, llamaArgs, { windowsHide: true });
    this.child = child;

    try { child.stdin.end(); } catch (_) {}

    const stdoutBuf = { value: "" };
    let timedOut = false;
    let errored = false;

    const timeoutHandle = setTimeout(() => {
      if (!child.killed && child.exitCode === null) {
        timedOut = true;
        child.kill();
        this.sendProcessMessage(
          `[${this.ts()}:System]タイムアウト: ${INFERENCE_TIMEOUT_MS / 1000}秒以内に応答がありませんでした。ctx サイズが小さすぎるか、モデルが大きすぎる可能性があります。`
        );
        this.sendLog(
          `[${this.ts()}:System]タイムアウト: llama-cli を強制終了します。\nヒント: 短いCSVで試すか、ctx 4096 を見直してください。\n`
        );
        this.emit({ type: "complete", pct: 0, ok: false });
      }
    }, INFERENCE_TIMEOUT_MS);

    this.emit({ type: "phase", phase: "infer", label: "推論中", pct: 5, mode: "measured" });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuf.value += chunk;
      this.handleStdoutLine(stdoutBuf);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const lines = chunk.split(/\r?\n/);
      const filtered = lines
        .filter((line) => !BANNER_RE.test(line.trim()))
        .join("\n");
      if (filtered.trim()) {
        this.sendLog(`[${this.ts()}:llama]${filtered}`);
      }
    });

    child.on("error", (err) => {
      // B1: clear the timeout so it doesn't fire after the process has
      // already failed. Emit 'complete' so the progress bar is reset.
      clearTimeout(timeoutHandle);
      errored = true;
      this.sendProcessMessage(
        `[${this.ts()}:llama]起動に失敗しました: ${err.message}`
      );
      this.emit({ type: "complete", pct: 0, ok: false });
    });

    child.on("close", async (code) => {
      clearTimeout(timeoutHandle);
      // B2: removed unused `flush: true` flag.
      if (stdoutBuf.value.length) {
        this.handleStdoutLine({ value: stdoutBuf.value });
        stdoutBuf.value = "";
      }
      // B1 follow-up: 'close' may still fire after 'error'; skip if so.
      if (errored) return;

      let summaryText = (getState(this).accumulated || "").trim();
      const tTotal = (Date.now() - t0) / 1000;

      if (timedOut) return;
      if (code !== 0) {
        this.sendProcessMessage(`[${this.ts()}:llama]エラー code=${code}`);
        this.emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      summaryText = summaryText.replace(THINKING_BLOCK_RE, "").trim();

      if (!summaryText) {
        this.sendProcessMessage(
          `[${this.ts()}:llama]出力が空でした。モデルが配置されているか、ctx サイズが十分か確認してください。`
        );
        this.emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      const parsed = this.parseStructuredOutput(summaryText, type);

      this.emit({ type: "phase", phase: "save", label: "docx 書き出し中", pct: 95, mode: "indeterminate" });
      try {
        await this.writeDocx({ outputPath, summaryText, parsed });
      } catch (err) {
        this.sendProcessMessage(
          `[${this.ts()}:System]docx 書き出し失敗: ${err.message}`
        );
        this.emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      this.sendProcessMessage(
        `[${this.ts()}:System]要約が完了しました\n出力: ${outputPath}\n所要: ${tTotal.toFixed(1)}s`
      );
      this.emit({
        type: "complete",
        pct: 100,
        ok: true,
        metrics: { t_total_sec: tTotal, output_path: outputPath, type },
      });
    });
  }

  /**
   * Build the LLM prompt from CSV text and requested summary type.
   * Each type now requests explicit ## section headers so the
   * post-processing layer (parseStructuredOutput / writeDocx) can
   * produce cleanly structured docx output.
   */
  buildPrompt(csvText, type) {
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = this.parseCsvLine(lines[i]);
      if (i === 0) continue;
      if (cols.length < 4) continue;
      rows.push(cols.slice(3).join(",").trim());
    }
    const text = rows.join("\n");

    if (type === "minutes") {
      return (
        "以下は会議の文字起こしです。以下のセクション構造に従って日本語で議事録を作成してください。\n\n" +
        "## 概要\n会議の目的と全体の結論を2-3文で\n\n" +
        "## 決定事項\n- 決定内容（発言者: 名前）\n\n" +
        "## アクションアイテム\n- タスク内容（担当: 名前）\n\n" +
        "## 未解決事項\n- 議題と経緯\n\n" +
        "上記4セクションを必ず含めてください。各項目は箇条書き（-）で記述してください。\n\n" +
        "----\n" + text + "\n----"
      );
    }
    if (type === "summary") {
      return (
        "以下は文字起こしです。日本語で200字程度の要約を「## 要約」のセクション見出し付きで作成してください。\n\n" +
        "----\n" + text + "\n----"
      );
    }
    // bullets (default)
    return (
      "以下は日本語の文字起こしです。以下のセクション構造に従って要点をまとめてください。\n\n" +
      "## 概要\n全体の要約を2-3文で\n\n" +
      "## 主な議論\n- 見出し: 説明\n\n" +
      "## アクションアイテム\n- タスク（担当: 名前）\n\n" +
      "上記3セクションを必ず含めてください。\n\n" +
      "----\n" + text + "\n----"
    );
  }

  /**
   * Parse the LLM output into structured sections by ## headers.
   * Returns { summary, decisions, actionItems, openIssues, discussionPoints }.
   * All fields are arrays of strings (bullet items) except summary which is
   * a single string. Empty arrays mean the section was not found.
   */
  parseStructuredOutput(text, type) {
    const result = {
      summary: "",
      decisions: [],
      actionItems: [],
      openIssues: [],
      discussionPoints: []
    };

    // Match ## SectionName optionally followed by content until next ## or end
    const sectionRegex = /##\s+(.+?)(?:\n([\s\S]*?))?(?=\n##\s+|\n*$)/g;
    let match;
    while ((match = sectionRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const content = (match[2] || "").trim();

      if (/概要|要約|サマリ/i.test(title)) {
        // Strip any remaining bullets from summary text
        result.summary = content.replace(/^[-*]\s+/gm, "").trim();
      } else if (/決定事項|決定|決議/i.test(title)) {
        result.decisions = this.parseBulletList(content);
      } else if (/アクションアイテム|アクション|行動|todo|担当/i.test(title)) {
        result.actionItems = this.parseBulletList(content);
      } else if (/未解決|課題|issue|問題点/i.test(title)) {
        result.openIssues = this.parseBulletList(content);
      } else if (/議論|discussion|要点|ポイント/i.test(title)) {
        result.discussionPoints = this.parseBulletList(content);
      }
    }

    return result;
  }

  /**
   * Extract bullet items from a section's content.
   * Handles both `- ` and `* ` prefixes.
   */
  parseBulletList(content) {
    const items = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const text = trimmed.replace(/^[-*]\s+/, "").trim();
        if (text) items.push(text);
      }
    }
    return items;
  }

  parseCsvLine(line) {
    const cols = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }

  handleStdoutLine(buf) {
    const state = getState(this);
    const chunk = buf.value;
    buf.value = "";

    state.accumulated += chunk;

    // Strip both `<think>...</think>` and `[Start thinking]...` blocks.
    // Using the full accumulated buffer handles tags split across chunks.
    // If `[End thinking]` never arrives, the trailing block is still
    // removed once the process finishes (close handler re-runs the regex).
    const cleaned = state.accumulated.replace(THINKING_BLOCK_RE, "");
    const delta = cleaned.slice(state.displayedLength);
    state.displayedLength = cleaned.length;

    if (delta) {
      this.sendLog(delta);
    }

    state.accumulated = cleaned;

    const len = cleaned.length;
    this.emit({ type: "phase", phase: "infer", label: `推論中 (${len} chars)`, pct: 0, mode: "indeterminate" });
  }

  ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  emit(payload) {
    try {
      this.sendProgress({ ...payload, ts: Date.now() });
    } catch (err) {
      console.error("[summary progress]", err);
    }
  }

  /**
   * Write the summary to a .docx file.
   * If `parsed` contains structured data (decisions, actionItems, etc.),
   * render them as proper docx sections with headings. Otherwise fall
   * back to the original Markdown-to-docx conversion.
   */
  async writeDocx({ outputPath, summaryText, parsed }) {
    let docx;
    try {
      docx = require("docx");
    } catch (err) {
      throw new Error(
        "`docx` パッケージが見つかりません。`npm install docx` を実行してください。 (" +
          err.message +
          ")"
      );
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;

    // Check if structured data is available
    const hasStructured = parsed &&
      (parsed.summary ||
       parsed.decisions.length > 0 ||
       parsed.actionItems.length > 0 ||
       parsed.openIssues.length > 0 ||
       parsed.discussionPoints.length > 0);

    if (hasStructured) {
      const paragraphs = [];

      // Title
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: "議事録", bold: true, size: 32 })],
        spacing: { after: 400 }
      }));

      // 概要
      if (parsed.summary) {
        paragraphs.push(new Paragraph({
          text: "概要",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 }
        }));
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: parsed.summary, size: 22 })],
          spacing: { after: 300 }
        }));
      }

      // 決定事項
      if (parsed.decisions.length > 0) {
        paragraphs.push(new Paragraph({
          text: "決定事項",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 }
        }));
        for (const d of parsed.decisions) {
          paragraphs.push(new Paragraph({
            text: d,
            bullet: { level: 0 },
            spacing: { after: 80 }
          }));
        }
      }

      // アクションアイテム
      if (parsed.actionItems.length > 0) {
        paragraphs.push(new Paragraph({
          text: "アクションアイテム",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 }
        }));
        for (const a of parsed.actionItems) {
          paragraphs.push(new Paragraph({
            text: a,
            bullet: { level: 0 },
            spacing: { after: 80 }
          }));
        }
      }

      // 未解決事項
      if (parsed.openIssues.length > 0) {
        paragraphs.push(new Paragraph({
          text: "未解決事項",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 }
        }));
        for (const o of parsed.openIssues) {
          paragraphs.push(new Paragraph({
            text: o,
            bullet: { level: 0 },
            spacing: { after: 80 }
          }));
        }
      }

      // 主な議論 (bullets type)
      if (parsed.discussionPoints.length > 0) {
        paragraphs.push(new Paragraph({
          text: "主な議論",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300 }
        }));
        for (const p of parsed.discussionPoints) {
          paragraphs.push(new Paragraph({
            text: p,
            bullet: { level: 0 },
            spacing: { after: 80 }
          }));
        }
      }

      const doc = new Document({
        creator: "AITranscribe-Electron",
        title: "議事録",
        sections: [{ children: paragraphs }],
      });
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(outputPath, buffer);
      return;
    }

    // Fallback: original Markdown-to-docx conversion
    const lines = summaryText.split(/\r?\n/);
    const paragraphs = [];

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (line === "") {
        paragraphs.push(new Paragraph({ text: "" }));
        continue;
      }
      if (/^##\s+/.test(line)) {
        paragraphs.push(
          new Paragraph({ text: line.replace(/^##\s+/, ""), heading: HeadingLevel.HEADING_2 })
        );
      } else if (/^#\s+/.test(line)) {
        paragraphs.push(
          new Paragraph({ text: line.replace(/^#\s+/, ""), heading: HeadingLevel.HEADING_1 })
        );
      } else if (/^-\s+/.test(line)) {
        paragraphs.push(
          new Paragraph({ text: line.replace(/^-\s+/, ""), bullet: { level: 0 } })
        );
      } else {
        paragraphs.push(new Paragraph({ children: [new TextRun({ text: line })] }));
      }
    }

    const doc = new Document({
      creator: "AITranscribe-Electron",
      title: "要約",
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
  }
}

module.exports = { SummarizeJob };
