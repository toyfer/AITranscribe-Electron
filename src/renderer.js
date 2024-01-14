// TODO:関数と手続き型の処理の整理を行う

// 共通要素
const outputTextareaElement = document.getElementById('output-textarea'); // コンソール出力要素
var audioFile = new Audio(); // オーディオファイルのオブジェクト
var audioDuration = 0; // オーディオファイルの秒数初期値
var intervalId; // インターバルタイマー
var progressBar = new ProgressBar();

// ファイル選択要素
const fileSelectButton = document.getElementById('file-select-button'); // ファイル選択ボタン要素
const filePathElement = document.getElementById('file-path'); // ファイルパス表示欄要素

// ファイルのパス取得関数
async function getAudioFilePath(inputFilePathElement) {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
        inputFilePathElement.value = filePath;
        audioFile.src = filePath;
    } else {
        return;
    }
}

// ファイル選択ボタンクリックをリッスン
fileSelectButton.addEventListener('click', () => getAudioFilePath(fileSelectButton));
// ファイルパス表示欄クリックをリッスン
filePathElement.addEventListener('click', () => getAudioFilePath(filePathElement));

// 読み込んだ音声ファイルの秒数を取得するリッスン
audioFile.addEventListener('loadedmetadata', () => {
    console.log(this.duration); // デバッグ用としてコンソールに値を返す
    audioDuration = this.duration; // 読み込んだ音声ファイルの秒数を代入
});

// 秒数をhh:mm:ssに変換する関数
function formatTime(seconds) {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let remainingSeconds = seconds % 60;
    let formattedHours = hours < 10 ? "0" + hours : hours;
    let formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
    let formattedSeconds = remainingSeconds < 10 ? "0" + remainingSeconds : remainingSeconds;
    return formattedHours + ":" + formattedMinutes + ":" + formattedSeconds;
}

// コマンド実行要素
const selectModelElement = document.getElementById('select-model'); // 精度選択要素

// FFmpeg&Whisperの実行
const runFFmpeg = document.getElementById('run-ffmpeg'); // スタートボタン要素
runFFmpeg.addEventListener('click', () => { // スタートボタンのクリックをリッスン

    // 条件確認
    // ファイルの有無確認
    if (!filePathElement.value) {
        alert('音声ファイルを選択してください');
        return;
    }

    // モデルの選択確認
    if (selectModelElement.value == '精度を選択してください') {
        alert('精度を選択してください')
        return;
    }

    // console.log(selectModelElement.value); // コンソールに選択されたモデルを表示（デバッグ）

    // モデル選択の分岐
    // 併せて予想の秒数も計算する
    const selectModel = (() => {
        switch (selectModelElement.value) {
            case '1':
                audioDuration = audioDuration * 0.7;
                return {
                    model: 'Whisper\\models\\small',
                    script: 'Whisper\\Faster-Whisper.py'
                };
            case "2":
                audioDuration = audioDuration * 1.3;
                return {
                    model: 'Whisper\\models\\medium',
                    script: 'Whisper\\Faster-Whisper.py'
                }
        }
    }
    )();

    // FFmpegの引数設定(renderer)
    const FFmpegArgs = filePathElement.value;

    // Whisperの引数設定(rendere)
    const WhisperArgs = selectModel;

    // 各項目を無効化
    runFFmpeg.disabled = true;
    runFFmpeg.innerText = '処理中です…';
    filePathElement.disabled = true;
    fileSelectButton.disabled = true;
    selectModelElement.disabled = true;

    progressBar.startProgress(audioDuration);

    // メインプロセスの実行
    window.electronAPI.runFFmpeg([FFmpegArgs, WhisperArgs]);
});

// メインプロセスの標準出力を受け取る
window.electronAPI.returnCommand((event, output) => {
    console.log(output);
    outputTextareaElement.value += output;
    outputTextareaElement.scrollTop = outputTextareaElement.scrollHeight;
});

// メインプロセスの開始・終了通知を受け取る
window.electronAPI.processMassage((event, massage) => {
    const notificationTitle = 'Ai文字起こし';
    const notificationBody = massage;
    new Notification(notificationTitle, { body: notificationBody });

    // 各項目を有効化
    runFFmpeg.disabled = false;
    runFFmpeg.innerText = 'スタート';
    filePathElement.disabled = false;
    fileSelectButton.disabled = false;
    selectModelElement.disabled = false;

    // プログレスバーの終了
    progressBar.endProgress(intervalId);
});