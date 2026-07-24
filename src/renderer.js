// 共通要素
const outputTextareaElement = document.getElementById("output-textarea");
var audioFile = new Audio();
var audioDuration = 0;
var progressBar = new ProgressBar();

const fileSelectButton = document.getElementById("file-select-button");
const filePathElement = document.getElementById("file-path");
const selectModelElement = document.getElementById("select-model");
const runFFmpegButton = document.getElementById("run-ffmpeg");

async function getAudioFilePath() {
  const filePath = await window.electronAPI.openFile();
  if (filePath) {
    filePathElement.value = filePath;
    // file:// でメタデータ取得（ローカルパス）
    audioFile.src = filePath;
  }
}

fileSelectButton.addEventListener("click", () => getAudioFilePath());
filePathElement.addEventListener("click", () => getAudioFilePath());

audioFile.addEventListener("loadedmetadata", function () {
  console.log(this.duration);
  audioDuration = this.duration;
});

function setUiBusy(isBusy) {
  runFFmpegButton.disabled = isBusy;
  runFFmpegButton.innerText = isBusy ? "処理中です…" : "スタート";
  filePathElement.disabled = isBusy;
  fileSelectButton.disabled = isBusy;
  selectModelElement.disabled = isBusy;
}

function selectModelConfig(modelValue, durationSec) {
  switch (modelValue) {
    case "1":
      return {
        model: "Whisper\\models\\small",
        script: "Whisper\\Faster-Whisper.py",
        // 元の audioDuration は変更しない（連続実行で倍率が積み上がるのを防ぐ）
        estimatedDuration: durationSec * 0.7,
      };
    case "2":
      return {
        model: "Whisper\\models\\medium",
        script: "Whisper\\Faster-Whisper.py",
        estimatedDuration: durationSec * 1.3,
      };
    default:
      return null;
  }
}

runFFmpegButton.addEventListener("click", () => {
  if (!filePathElement.value) {
    alert("音声ファイルを選択してください");
    return;
  }

  const selectModel = selectModelConfig(selectModelElement.value, audioDuration || 60);
  if (!selectModel) {
    alert("精度を選択してください");
    return;
  }

  setUiBusy(true);
  progressBar.startProgress(selectModel.estimatedDuration);

  window.electronAPI.runFFmpeg([filePathElement.value, selectModel]);
});

window.electronAPI.returnCommand((_event, output) => {
  console.log(output);
  outputTextareaElement.value += output;
  outputTextareaElement.scrollTop = outputTextareaElement.scrollHeight;
});

// 開始・終了・エラー通知（UI 復帰の単一入口）
window.electronAPI.processMessage((_event, message) => {
  const notificationTitle = "Ai文字起こし";
  new Notification(notificationTitle, { body: message });

  setUiBusy(false);
  progressBar.endProgress(true);
});
