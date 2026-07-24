document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("csvFileInput").addEventListener("change", handleCSVFile);
  document.getElementById("audioFileInput").addEventListener("change", handleAudioFile);
  document.addEventListener("click", handleTextLinkClick);

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

  async function handleCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const text = await readFileAsText(file);
    const lines = text.split(/\r?\n/).filter(Boolean);

    let tableRows = "";
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
      tableRows +=
        `<tr data-start="${escapeHtml(startAttr)}">` +
        `<td>${escapeHtml(point)}</td>` +
        `<td>${escapeHtml(String(start))}</td>` +
        `<td>${escapeHtml(Number.isNaN(end) ? "" : String(end))}</td>` +
        `<td class="text-link text-primary" data-start="${escapeHtml(startAttr)}">${escapeHtml(cellText)}</td>` +
        `</tr>`;
    }

    document.getElementById("csvTableBody").innerHTML = tableRows;
  }

  function handleAudioFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const audioPlayer = document.getElementById("audio");
    audioPlayer.src = URL.createObjectURL(file);
    audioPlayer.controls = true;
  }

  function handleTextLinkClick(e) {
    if (e.target.classList.contains("text-link")) {
      const start = parseFloat(e.target.getAttribute("data-start"));
      if (Number.isNaN(start)) return;
      const audio = document.getElementById("audio");
      if (!audio || !audio.src) {
        alert("先に音声ファイルを選択してください");
        return;
      }
      audio.currentTime = start;
      audio.play();
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
