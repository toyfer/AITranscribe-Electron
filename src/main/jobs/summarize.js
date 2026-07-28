const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const AIT_PREFIX = "__AIT__";

/**
 * One summarize run: read CSV -> call llama-cli -> parse token output ->
 * write .docx with the docx npm package.
 *
 * The summarize feature is optional and runs on the same air-gap
 * assumption as Whisper: llama-cli.exe and a GGUF model must be
 * placed manually under src/Whisper/{llama-cli.exe, models/llm/*.gguf}.
 *
 * Note: This class intentionally avoids private class fields (#name)
 * because Node.js 22.x (bundled in Electron 43) has a known syntax
 * checker bug that fails to track private field definitions when
 * multiple private methods coexist with local variable shadowing.
 * See: https://cri.dev/posts/2026-06-24-nodejs-syntax-checker-bug-private-fields-shadowing/
 *
 * Instead, per-instance state is stored in a WeakMap keyed by the
 * SummarizeJob instance. The methods are plain class methods.
 */

const stateMap = new WeakMap();

function getState(self) {
  let s = stateMap.get(self);
  if (!s) {
    s = { accumulated: "" };
    stateMap.set(self, s);
  }
  return s;
}

class SummarizeJob {
  constructor({ runtime, sendProcessMessage, sendLog, sendProgress }) {
    this.runtime = runtime;
    this.sendProcessMessage = sendProcessMessage;
    this.sendLog = sendLog || (() => {});
    this.sendProgress =
      typeof sendProgress === "function" ? sendProgress : () => {};
  }

  async start(_event, args) {
    const csvPath = args && args.csvPath;
    const outputPath = args && args.outputPath;
    const type = (args && args.type) || "bullets";
    const options = (args && args.options) || {};

    if (!csvPath || !outputPath) {
      this.sendProcessMessage(
        `[${this.ts()}:System]csvPath と outputPath は必須です`
      );
      return;
    }
    if (!fs.existsSync(csvPath)) {
      this.sendProcessMessage(
        `[${this.ts()}:System]CSV が見つかりません: ${csvPath}`
      );
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
          "Whisper/models/llm/ 配下に Qwen3-0.6B GGUF Q4_K_M などを手動配置してください。"
      );
      return;
    }
    const modelPath =
      options.modelPath && fs.existsSync(options.modelPath)
        ? options.modelPath
        : ggufPaths[0];

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
    const maxTokens = options.maxTokens || 1024;
    const ctxSize = options.ctxSize || 32768;
    const temperature = options.temperature || 0.4;

    this.emit({ type: "phase", phase: "load", label: "モデル読込中", pct: 0, mode: "indeterminate" });

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

    this.emit({ type: "phase", phase: "infer", label: "推論中", pct: 5, mode: "measured" });

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuf.value += chunk;
      this.handleStdoutLine(stdoutBuf);
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const line = `[${this.ts()}:llama]${chunk}`;
      this.sendLog(line);
    });

    child.on("error", (err) => {
      this.sendProcessMessage(
        `[${this.ts()}:llama]起動に失敗しました: ${err.message}`
      );
    });

    child.on("close", async (code) => {
      if (stdoutBuf.value.length) {
        this.handleStdoutLine({ value: stdoutBuf.value, flush: true });
        stdoutBuf.value = "";
      }
      const summaryText = (getState(this).accumulated || "").trim();
      const tTotal = (Date.now() - t0) / 1000;

      if (code !== 0) {
        this.sendProcessMessage(
          `[${this.ts()}:llama]エラー code=${code}`
        );
        this.emit({ type: "complete", pct: 0, ok: false });
        return;
      }
      if (!summaryText) {
        this.sendProcessMessage(
          `[${this.ts()}:llama]出力が空でした。モデルが配置されているか、ctx サイズが十分か確認してください。`
        );
        this.emit({ type: "complete", pct: 0, ok: false });
        return;
      }

      this.emit({ type: "phase", phase: "save", label: "docx 書き出し中", pct: 95, mode: "indeterminate" });
      try {
        await this.writeDocx({ outputPath, summaryText, type, csvPath });
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
    return (
      "以下は日本語の文字起こしです。要点を箇条書きで要約してください。\n" +
      "各項目は見出し+1行程度の簡潔な説明にしてください。\n\n" +
      "----\n" + text + "\n----"
    );
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
    state.accumulated = (state.accumulated || "") + buf.value;
    buf.value = "";
    const len = (state.accumulated || "").length;
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

  async writeDocx({ outputPath, summaryText, type, csvPath }) {
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
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = docx;

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
