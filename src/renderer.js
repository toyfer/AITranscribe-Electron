// TODO:関数と手続き型の処理の整理を行う

// 共通要素
const outputTextareaElement = document.getElementById('output-textarea'); // コンソール出力要素
var audioFile = new Audio(); // オーディオファイルの読み込み
var audioDuration = 0; // オーディオファイルの秒数
var intervalId; // インターバルタイマー

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

    // プログレスバーの開始
    startProgress(audioDuration);

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

    // プログレスバーの終了
    endProgress(intervalId);
});


// プログレスバーの開始
function startProgress(Duration) {
    const progressBar = document.getElementById('progress-bar'); // プログレスバー要素の取得
    const progress = document.getElementById('progress'); // プログレスグループ要素の取得
    // プログレスバーの初期化
    progress.hidden = false; // プログレスバーを表示する
    const duration = Duration; // オーディオファイルのタイムを取得
    let eapsedTime = 0; // 処理中の時間
    progressBar.style.width = '0%'; // プログレスバーの値を0%に設定
    progressBar.innerText = '0%'; // プログレスバーの値を0%に設定
    progressBar.setAttribute('class', 'progress-bar bg-success')
    progressBar.setAttribute('aria-valuenow', 0); // プログレスバーの値を0%に設定
    progressBar.setAttribute('aria-valuemin', 0); // プログレスバーの値を0%に設定
    progressBar.setAttribute('aria-valuemax', 100); // プログレスバーの値を100%に設定
    progressBar.setAttribute('style', 'width: 0%;'); // プログレスバーの値を0%に設定

    // プログレスバーのタイマー開始
    intervalId = setInterval(() => {
        progressBar.style.width = (eapsedTime / duration) * 100 + '%'; // プログレスバーの値を100%に設定
        progressBar.innerText = Math.floor((eapsedTime / duration) * 100 * 10) / 10 + '%'; // プログレスバーの値を100%に設定
        progressBar.setAttribute('aria-valuenow', Math.floor((eapsedTime / duration) * 100 * 10) / 10); // プログレスバーの値を100%に設定
        progressBar.setAttribute('aria-valuemin', 0); // プログレスバーの値を0%に設定
        progressBar.setAttribute('aria-valuemax', 100); // プログレスバーの値を100%に設定
        progressBar.setAttribute('style', 'width:' + Math.floor((eapsedTime / duration) * 100 * 10) / 10 + '%'); // プログレスバーの値を100%に設定

        // TODO:残り時間をどこかに表示させる
        eapsedTime += 1; // 1秒カウント

        // プログレスバーが想定時間より先に100%に到達するときの処理
        if (eapsedTime >= duration) {
            progressBar.style.width = '100%'; // プログレスバーの値を100%に設定
            progressBar.innerText = 'もう少しで完了します...'; // プログレスバー内に案内を表示
            progressBar.setAttribute('class', 'progress-bar progress-bar-striped progress-bar-animated') // プログレスバーの表示をストライプに変更
            progressBar.setAttribute('aria-valuenow', 100); // プログレスバーの値を100%に設定
            progressBar.setAttribute('aria-valuemin', 0); // プログレスバーの値の最小値を0%に設定
            progressBar.setAttribute('aria-valuemax', 100); // プログレスバーの値の最大値を100%に設定
            progressBar.setAttribute('style', 'width: 100%'); // プログレスバーの値を100%に設定
            clearInterval(intervalId); // 想定時間以上に更新しようとした場合は更新を停止する
        };
    }, 1000);
};

// プログレスバーの終了(プロセス終了時に呼び出される)
function endProgress(intervalId) {
    const progressBar = document.getElementById('progress-bar')
    progressBar.style.width = '100%'; // プログレスバーの値を100%に設定
    progressBar.innerText = '完了しました!'; // プログレスバーの値を100%に設定
    progressBar.setAttribute('class', 'progress-bar') // プログレスバーを通常食に変更
    progressBar.setAttribute('aria-valuenow', 100); // プログレスバーの値を100%に設定
    progressBar.setAttribute('aria-valuemin', 0); // プログレスバーの値を0%に設定
    progressBar.setAttribute('aria-valuemax', 100); // プログレスバーの値を100%に設定
    progressBar.setAttribute('style', 'width: 100%;'); // プログレスバーの値を100%に設定
    clearInterval(intervalId); // インターバルを終了する
};