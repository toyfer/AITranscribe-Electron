const fs = require("fs");
const os = require("os");
const path = require("path");
const { getNow, generateRandomString } = require("./time");

function safeDeleteFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error(`[${getNow()}:System]一時ファイル削除失敗: ${filePath} ${error.message}`);
  }
}

/** Create per-job temp WAV/CSV paths under os.tmpdir(). */
function createTempJob() {
  const tempDir = os.tmpdir();
  const tempWAV = path.join(tempDir, `aitranscribe-${generateRandomString(12)}.wav`);
  const tempCSV = `${tempWAV}.csv`;
  return { tempWAV, tempCSV };
}

module.exports = { safeDeleteFile, createTempJob };
