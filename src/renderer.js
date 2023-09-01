// TODO:関数と手続き型の処理の整理を行う

// 共通要素
const outputTextareaElement = document.getElementById('output-textarea'); // コンソール出力要素
var audioFile = new Audio(); // オーディオファイルの読み込み

// ファイル選択要素
const fileSelectButton = document.getElementById('file-select-button'); // ファイル選択ボタン要素
const filePathElement = document.getElementById('file-path'); // ファイルパス表示欄要素

// ファイル選択ダイアログを表示して、テキストボックスに保持
// ファイルパスの保持と併せて、音声ファイルを読み込む
fileSelectButton.addEventListener('click', async () => { // ファイル選択ボタンクリックをリッスン
    const filePath = await window.electronAPI.openFile(); // main.jsで処理
    if (filePath) {
        filePathElement.value = filePath;
        audioFile.src = filePath;
    } else {
        return;
    }
});
filePathElement.addEventListener('click', async () => { // ファイルパス表示欄クリックをリッスン
    const filePath = await window.electronAPI.openFile(); // main.jsで処理
    if (filePath) {
        filePathElement.value = filePath;
        audioFile.src = filePath
    } else {
        return;
    }
});

// 読み込んだ音声ファイルの秒数を取得するリッスン
audioFile.addEventListener('loadedmetadata', function () {
    const duration = convertSecondsToHMS(audioFile.duration); // 取得した秒数をhh:mm:ss形式に変換してdurationに格納する
    console.log(duration); // デバッグ用としてコンソールに値を返す
});

// 秒数をhh:mm:ssに変換する関数
function convertSecondsToHMS(seconds) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    var remainingSeconds = seconds % 60;
    var formattedHours = hours < 10 ? "0" + hours : hours;
    var formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
    var formattedSeconds = remainingSeconds < 10 ? "0" + remainingSeconds : remainingSeconds;
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
    const selectModel = (() => {
        switch (selectModelElement.value) {
            case '1':
                return {
                    model: 'Whisper\\models\\small',
                    script: 'Whisper\\Faster-Whisper.py'
                };
            case "2":
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

    // メインプロセスの実行
    window.electronAPI.runFFmpeg([FFmpegArgs, WhisperArgs]);
});

// メインプロセスの標準出力を受け取る
window.electronAPI.returnCommand((_event, output) => {
    console.log(output);
    outputTextareaElement.value += output;
    outputTextareaElement.scrollTop = outputTextareaElement.scrollHeight;
});

// メインプロセスの開始・終了通知を受け取る
window.electronAPI.processMassage((_event, massage) => {
    const notificationTitle = 'Ai文字起こし';
    const notificationBody = massage;
    new Notification(notificationTitle, { body: notificationBody });

    // 各項目を有効化
    runFFmpeg.disabled = false;
    runFFmpeg.innerText = 'スタート';
    filePathElement.disabled = false;
    fileSelectButton.disabled = false;
    selectModelElement.disabled = false;
});