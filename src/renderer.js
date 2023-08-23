//▼デバッグモード
const debugButton = document.getElementById('debug-mode');
const inputCommandValue = document.getElementById('input-command');
const runButton = document.getElementById('run-button');
const titleLabel = document.getElementById('title-label');
var debugCount = 0;

titleLabel.addEventListener('click', () => {
    debugCount += 1;
    if (debugCount == 10) {
        const debugMode = confirm('デバッグモードを有効にしますか');
        if (debugMode == true) {
            debugButton.hidden = false;
        } else {
            return;
        } 
    } else {
        return;
    }
});

debugButton.addEventListener('click', () => {
    inputCommandValue.hidden = false;
    runButton.hidden = false;
});
//▲デバッグモード

//▼デバッグ実行
runButton.addEventListener('click', () => {

    // 実行結果を受け取る前に、テキストエリアを初期化する
    outputTextareaElement.value = null;

    // コマンドの取得
    const command = inputCommandValue.value.trim();

    // コマンドが入力されていない場合は、アラートを出力して終了する
    if (command === '') {
        alert('コマンドを入力してください');
        return;
    } else {
        // メインプロセスでコマンドを実行する
        window.electronAPI.runCommand(command);
    }
});
//▲デバッグ実行

//▼共有セクション
const outputTextareaElement = document.getElementById('output-textarea');

//▼ファイル選択セクション
const fileSelectButton = document.getElementById('file-select-button');
const filePathElement = document.getElementById('file-path');

// ファイル選択ダイアログを表示して、テキストボックスに保持
fileSelectButton.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
        filePathElement.value = filePath;
    } else {
        return;
    }
});
filePathElement.addEventListener('click', async () => {
    const filePath = await window.electronAPI.openFile();
    if (filePath) {
        filePathElement.value = filePath;
    } else {
        return;
    }
});

//▼コマンド実行セクション
const selectModelElement = document.getElementById('select-model');

// FFmpeg&Whisperの実行
const runFFmpeg = document.getElementById('run-ffmpeg');
runFFmpeg.addEventListener('click', () => {

    //▼前提条件確認
    // ファイルの有無確認
    if (!filePathElement.value) {
        alert('ファイルを選択してください');
        return;
    }

    // モデルの選択確認
    if (selectModelElement.value == '精度を選択してください') {
        alert('精度を選択してください')
        return;
    }
    console.log(selectModelElement.value);

    // モデル選択の分岐
    const selectModel = (() => {
        switch (selectModelElement.value) {
            case '1': return 'Whisper\\models\\base.pt';
            case '2': return 'Whisper\\models\\small.pt';
            case '3': return 'Whisper\\models\\small';
            default: return 'Whisper\\models\\base.pt';
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