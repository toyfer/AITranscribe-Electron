// Best-effort JSON extraction and Markdown rendering for the
// structured-summary mode of SummarizeJob. Split out from summarize.js
// to keep that file focused on the llama-cli lifecycle and to make this
// pure-function logic easier to unit-test in isolation.

const FENCE_RE = /^```(?:json)?\s*\n?|\n?```\s*$/g;

function tryParse(text) {
  try { return JSON.parse(text); } catch (_) { return undefined; }
}

/**
 * Pull a JSON object out of a model response.
 * Small local models sometimes wrap JSON in a code fence, prefix it with
 * prose, or add trailing commentary; try a few extraction strategies
 * before giving up.
 * @param {string} raw
 * @returns {object|null} canonical schema, or null on failure
 */
function parseStructured(raw) {
  const stripped = String(raw || "").replace(FENCE_RE, "").trim();
  const candidates = [String(raw || ""), stripped];
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(stripped.slice(first, last + 1));
  }
  for (const text of candidates) {
    const obj = tryParse(text);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      return normalizeStructured(obj);
    }
  }
  return null;
}

/**
 * Coerce arbitrary model output into the canonical schema. Missing keys
 * become empty arrays; entries with the wrong shape are dropped so
 * downstream code always sees well-typed values.
 * @param {*} v
 */
function normalizeStructured(v) {
  const s = (x) => (typeof x === "string" ? x.trim() : "");
  const o = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  const a = (x) => (Array.isArray(x) ? x : []);
  const n = (x) => (s(x) || null);

  const decisions = a(v.decisions)
    .map(o)
    .map((d) => ({ text: s(d.text), owner: n(d.owner) }))
    .filter((d) => d.text);

  const action_items = a(v.action_items)
    .map(o)
    .map((d) => ({ task: s(d.task), owner: n(d.owner), due: n(d.due) }))
    .filter((d) => d.task);

  const open_issues = a(v.open_issues)
    .map(o)
    .map((d) => ({ topic: s(d.topic), context: s(d.context) }))
    .filter((d) => d.topic);

  return { decisions, action_items, open_issues };
}

/**
 * Render a structured object as human-readable Markdown for the .docx
 * output. Sections with no entries are omitted entirely so the docx
 * stays focused on what was actually said.
 * @param {{decisions: Array, action_items: Array, open_issues: Array}} s
 */
function structuredToMarkdown(s) {
  const lines = [];
  const fmtOwner = (owner, due) => {
    const parts = [];
    if (owner) parts.push(`@${owner}`);
    if (due) parts.push(`(期限: ${due})`);
    return parts.length ? " " + parts.join(" ") : "";
  };

  if (s.decisions.length) {
    lines.push("## 決定事項", "");
    for (const d of s.decisions) {
      lines.push(`- ${d.text}${fmtOwner(d.owner)}`);
    }
    lines.push("");
  }

  if (s.action_items.length) {
    lines.push("## アクションアイテム", "");
    for (const a of s.action_items) {
      lines.push(`- ${a.task}${fmtOwner(a.owner, a.due)}`);
    }
    lines.push("");
  }

  if (s.open_issues.length) {
    lines.push("## 未解決の論点", "");
    for (const o of s.open_issues) {
      lines.push(`- ${o.topic}`);
      if (o.context) lines.push(`  - ${o.context}`);
    }
    lines.push("");
  }

  if (!lines.length) {
    return "_構造化JSONを抽出しましたが、決定事項・アクションアイテム・未解決論点はいずれも該当がありませんでした。_";
  }
  return lines.join("\n");
}

module.exports = { parseStructured, normalizeStructured, structuredToMarkdown };
