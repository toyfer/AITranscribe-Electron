document.addEventListener("DOMContentLoaded", function () {
  const csvTableBody = document.getElementById("csvTableBody");
  const audioPlayer = document.getElementById("audio");

  document.getElementById("csvFileInput").addEventListener("change", handleCSVFile);
  document.getElementById("audioFileInput").addEventListener("change", handleAudioFile);
  csvTableBody.addEventListener("click", handleTableClick);
  audioPlayer.addEventListener("timeupdate", handleTimeUpdate);

  /** 行要素と開始時刻の対応表(再生位置ハイライト用)。CSV ロード時に組み替える。 */
  let rowSegments = [];
  /** 現在再生中とみなしている行要素(null = なし) */
  let currentRowEl = null;

  /**
   * Split one CSV line respecting double-quoted fields (commas inside text).
   * Whisper text often contains commas; simple split(',') breaks columns.
   */
  function parseCsvLine(line) {
    const columns = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        columns.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    columns.push(current);
    return columns;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(seconds) {
    if (Number.isNaN(seconds) || seconds == null) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function handleCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await readFileAsText(file);
    const lines = text.split(/\r?\n/).filter(Boolean);

    let tableRows = "";
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
      const columns = parseCsvLine(lines[i]);

      if (i === 0) {
        // header: point,start,end,text
        continue;
      }

      const point = columns[0] ?? "";
      // Whisper start/end are fractional seconds — parseFloat (not parseInt)
      const start = parseFloat(columns[1]);
      const end = parseFloat(columns[2]);
      const cellText = columns.slice(3).join(",") ?? "";

      if (Number.isNaN(start)) continue;

      const startAttr = String(start);
      const startLabel = formatTime(start);
      const endLabel = Number.isNaN(end) ? "" : formatTime(end);

      // 開始時刻は「ここから再生」ボタンとして描画する。
      // テキストセル(text-link)のクリック再生も従来どおり有効。
      tableRows +=
        `<tr data-start="${escapeHtml(startAttr)}">` +
        `<td>${escapeHtml(point)}</td>` +
        `<td><button type="button" class="ts-play" data-start="${escapeHtml(startAttr)}"` +
        ` title="${escapeHtml(startLabel)} から再生" aria-label="${escapeHtml(startLabel)} から再生">` +
        `<span class="play-glyph" aria-hidden="true">▶</span> ${escapeHtml(startLabel)}</button></td>` +
        `<td>${escapeHtml(endLabel)}</td>` +
        `<td class="text-link" data-start="${escapeHtml(startAttr)}">${escapeHtml(cellText)}</td>` +
        `</tr>`;

      starts.push(start);
    }

    csvTableBody.innerHTML = tableRows;

    // 欠損行は描画・記録のどちらも skip 済みなので、行要素と開始時刻は 1:1 で対応する
    rowSegments = Array.from(csvTableBody.children).map((el, idx) => ({
      el,
      start: starts[idx],
    }));
    currentRowEl = null;
  }

  function handleAudioFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    audioPlayer.src = URL.createObjectURL(file);
  }

  /** tbody へのイベント委譲: 再生ボタン優先、テキストセルはフォールバック */
  function handleTableClick(e) {
    const playButton = e.target.closest(".ts-play");
    if (playButton) {
      seekTo(parseFloat(playButton.getAttribute("data-start")));
      return;
    }

    const textCell = e.target.closest(".text-link");
    if (textCell) {
      seekTo(parseFloat(textCell.getAttribute("data-start")));
    }
  }

  function seekTo(start) {
    if (Number.isNaN(start)) return;
    if (!audioPlayer.src) {
      alert("先に音声ファイルを選択してください");
      return;
    }
    audioPlayer.currentTime = start;
    const p = audioPlayer.play();
    // 自動再生ポリシー等で拒否された場合でも握りつぶす(ユーザー操作起点のため通常発生しない)
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  /** 再生位置を含む最後の行をハイライトする */
  function handleTimeUpdate() {
    if (rowSegments.length === 0) return;
    const t = audioPlayer.currentTime;

    let hit = null;
    for (const seg of rowSegments) {
      if (seg.start <= t) hit = seg;
    }

    if (!hit) {
      clearCurrentRow();
      return;
    }
    if (currentRowEl === hit.el) return;

    clearCurrentRow();
    currentRowEl = hit.el;
    currentRowEl.classList.add("row-playing");
  }

  function clearCurrentRow() {
    if (currentRowEl) {
      currentRowEl.classList.remove("row-playing");
      currentRowEl = null;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (ev) {
        resolve(ev.target.result);
      };
      reader.onerror = function (ev) {
        reject(ev);
      };
      reader.readAsText(file, "UTF-8");
    });
  }
});
