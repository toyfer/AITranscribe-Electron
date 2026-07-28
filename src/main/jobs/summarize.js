const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/** Structured lines from llama-cli (JSONL per --log-format). */
const AIT_PREFIX = "__AIT__";

/**
 * One summarize run: read CSV → call llama-cli → parse token output →
 * write .docx with the docx npm package.
 *
 * Emits structured progress via sendProgress when provided.
 *
 * The summarize feature is optional and runs on the same air-gap
 * assumption as Whisper: llama-cli.exe and a GGUF model must be
 * placed manually under src/Whisper/{llama-cli.exe, models/llm/*.gguf}.
 */
class SummarizeJob {
  /**
   * @param {object} options
   * @param {import('../runtime').RuntimeLayout} options.runtime
   * @param {(msg: string) => void} options.sendProcessMessage UI / notification channel
   * @param {(msg: string) => void} options.sendLog llama-cli stdout (raw) log channel
   * @param {(payload: object) => void} [options.sendProgress] structured progress
   */
  constructor({ runtime, sendProcessMessage, sendLog, sendProgress }) {
    this.runtime = runtime;
    this.sendProcessMessage = sendProcessMessage;
    this.sendLog = sendLog || (() => {});
    this.sendProgress =
      typeof sendProgress === "function" ? sendProgress : () => {};
  }

  /**
   * IPC entry.
   * @param {unknown} _event
   * @param {{
   *   csvPath: string,
   *   outputPath: string,
   *   type: 'minutes'|'bullets'|'summary',
   *   options?: { modelPath?: string, maxTokens?: number, ctxSize?: number, temperature?: number }
   * }} args
   */
  async start(_event, args) {
    const csvPath = args && args.csvPath;
    const outputPath = args && args.outputPath;
    const type = (args && args.type) || "bullets";
    const options = (args && args.options) || {};

    if (!csvPath || !outputPath) {
      this.sendProcessMessage(
        `[${this.#ts()}:System]csvPath と outputPath は必須です`
      );
      return;
    }
    if (!fs.existsSync(csvPath)) {
      this.sendProcessMessage(
        `[${this.#ts()}:System]CSV が見つかりません: ${csvPath}`
      );
      return;
    }

    const { llamaCliPath, ggufPaths } = this.runtime.checkRuntimeLayout();
    if (!fs.existsSync(llamaCliPath)) {
      this.sendProcessMessage(
        `[${this.#ts()}:System]llama-cli.exe が見つかりません: ${llamaCliPath}\n` +
          "Whisper/ 配下に llama-cli.exe を手動配置してください (https://github.com/ggerganov/llama.cpp)."
      );
      return;
    }
    if (ggufPaths.length === 0) {
      this.sendProcessMessage(
        `[${this.#ts()}:System]GGUF モデルが見つかりません。\n` +
          "Whisper/models/llm/ 配下に Qwen3-0.6B GGUF Q4_K_M などを手動配置してください。"
      );
      return;
    }
    // modelPath priority: explicit > first GGUF found
    const modelPath =
      options.modelPath && fs.existsSync(options.modelPath)
        ? options.modelPath
        : ggufPaths[0];

    let csvText;
    try {
      csvText = fs.readFileSync(csvPath, "utf8");
    } catch (err) {
      this.sendProcessMessage(
        `[${this.#ts()}:System]CSV 読み込み失敗: ${err.message}`
      );
      return;
    }

    const prompt = this.#buildPrompt(csvText, type);
    const maxTokens = options.maxTokens || 1024;
    const ctxSize = options.ctxSize || 32768;
    const temperature = options.temperature || 0.4;

    this.#emit({ type: "phase", phase: "load", label: "モデル読込中", pct: 0, mode: "indeterminate" });

    // llama-cli args:
    //   -m  model.gguf
    //   -p  prompt
    //   -n  max tokens to generate
    //   -c  context size
    //   --temp temperature
    //   --no-display-prompt
    //   --log-disable
    //   --log-format json
    const args = [
      "-m", modelPath,
      "-p", prompt,
      "-n", String(maxTokens),
      "-c", String(ctxSize),
      "--temp", String(temperature),
      "--no-display-prompt",
      "--log-disable",
    ];

    const t0 = Date.now();
    const child = spawn(llamaCliPath, args, { windowsHide: true });
    this.child = child;
    const stdoutBuf = { value: "" };

    this.#emit({ type: "phase", phase: "infer", label: "推論中", pct: 5, mode: "measured" });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuf.value += chunk;
      this.#handleStdoutLine(stdoutBuf);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      // llama-cli emits a small amount of progress on stderr
      const line = `[${this.#ts()}:llama]${chunk}`;
      this.sendLog(line);
    });

    child.on("error", (err) => {
      this.sendProcessMessage(
        `[${this.#ts()}:llama]起動に失敗しました: ${err.message}`
      );
    });

    child.on("close", async (code) => {
      if (stdoutBuf.value.length) {
        this.#handleStdoutLine({ value: stdoutBuf.value, flush: true });
        stdoutBuf.value = "";
      }
      const summaryText = (this.accumulated || "").trim();
      const tTotal = (Date.now() - t0) / 1000;

      if (code !== 0) {
        this.sendProcessMessage(
          `[${this.#ts()}:llama]エラー code=${code}`
        );
        this.#emit({ type: "complete", pct: 0, ok: false });
        return;
      }
      if (!summaryText) {
        this.sendProcessMessage(
          `[${this.#ts()}:llama]出力が空でした。モデルが配置されているか、ctx サイズが十分か確認してください。`
        );
        this.#emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      // Write docx
      this.#emit({ type: "phase", phase: "save", label: "docx 書き出し中", pct: 95, mode: "indeterminate" });
      try {
        await this.#writeDocx({ outputPath, summaryText, type, csvPath });
      } catch (err) {
        this.sendProcessMessage(
          `[${this.#ts()}:System]docx 書き出し失敗: ${err.message}`
        );
        this.#emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      this.sendProcessMessage(
        `[${this.#ts()}:System]要約が完了しました\n出力: ${outputPath}\n所要: ${tTotal.toFixed(1)}s`
      );
      this.#emit({
        type: "complete",
        pct: 100,
        ok: true,
        metrics: { t_total_sec: tTotal, output_path: outputPath, type },
      });
    });
  }

  /**
   * Build the prompt depending on summary type.
   * @param {string} csvText
   * @param {'minutes'|'bullets'|'summary'} type
   */
  #buildPrompt(csvText, type) {
    // Strip header (point,start,end,text). Allow quoted commas.
    const lines = csvText.split(/\r?\n/).filter(Boolean);
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = this.#parseCsvLine(lines[i]);
      if (i === 0) continue; // header
      if (cols.length < 4) continue;
      rows.push(cols.slice(3).join(",").trim());
    }
    const text = rows.join("\n");

    if (type === "minutes") {
      return (
        "以下は会議の文字起こしです。日本語で議事録として整形してください。\n" +
        "出力はMarkdownで、議題ごとに「- 結論」「- 次のアクション」を含めてください。\n" +
        "発言者が特定できる場合は [発言者] 形式で示してください。\n\n" +
        "----\n" + text + "\n----"
      );
    }
    if (type === "summary") {
      return (
        "以下は文字起こしです。日本語で200字程度の要約を作成してください。\n\n" +
        "----\n" + text + "\n----"
      );
    }
    // bullets (default)
    return (
      "以下は日本語の文字起こしです。要点を箇条書きで要約してください。\n" +
      "各項目は見出し+1行程度の簡潔な説明にしてください。\n\n" +
      "----\n" + text + "\n----"
    );
  }

  /** Simple CSV line parser handling double-quoted fields. */
  #parseCsvLine(line) {
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

  /**
   * llama-cli emits a single text stream. We accumulate incrementally.
   * If --log-format json were used we would parse here, but the
   * simplest portable form is the plain text output.
   */
  #handleStdoutLine(buf) {
    // Simple: just drain the buffer as the generated text.
    this.accumulated = (this.accumulated || "") + buf.value;
    buf.value = "";
    // Emit a coarse progress (text length) for renderer.
    const len = (this.accumulated || "").length;
    this.#emit({ type: "phase", phase: "infer", label: `推論中 (${len} chars)`, pct: 0, mode: "indeterminate" });
  }

  #ts() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  #emit(payload) {
    try {
      this.sendProgress({ ...payload, ts: Date.now() });
    } catch (err) {
      console.error("[summary progress]", err);
    }
  }

  /**
   * Build and write a .docx file using the `docx` npm package.
   *
   * docx 9.x has "type": "module" in its package.json, but it also
   * provides a CommonJS entry point via exports.require.default
   * (dist/index.cjs). We use require() with the module's package
   * path to load the CJS bundle directly, avoiding any ESM syntax
   * detection in this file.
   *
   * Using dynamic import("docx") here would cause Node.js's module
   * loader to detect ESM syntax (the `import` keyword) in this file
   * and attempt to re-parse it as an ES module, which fails on the
   * private class fields (#ts, #buildPrompt, etc.) with a misleading
   * "Private field '#ts' must be declared in an enclosing class"
   * SyntaxError.
   */
  async #writeDocx({ outputPath, summaryText, type, csvPath }) {
    // Lazy require — only loaded when summarize is actually used.
    // We resolve the docx package's CJS entry point directly.
    let docx;
    try {
      // require("docx") resolves via exports map to dist/index.cjs
      docx = require("docx");
    } catch (err) {
      throw new Error(
        "`docx` パッケージが見つかりません。`npm install docx` を実行してください。 (" +
          err.message +
          ")"
      );
    }
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

    // Convert summary text to paragraphs. Support both plain text and
    // simple Markdown headings (# / ##) and bullet lines (- ).
    const lines = summaryText.split(/\r?\n/);
    const paragraphs = [];
    paragraphs.push(
      new Paragraph({
        text: "要約",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.LEFT,
      })
    );
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `種別: ${type}    ソース: ${path.basename(csvPath)}    生成日時: ${new Date().toLocaleString("ja-JP")}`,
            size: 18,
            italics: true,
          }),
        ],
      })
    );
    paragraphs.push(new Paragraph({ text: "" }));

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
      title: `要約 (${type}) — ${path.basename(csvPath)}`,
      description: "Generated by AITranscribe-Electron",
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
  }
}

module.exports = { SummarizeJob };
