// TODO:コマンドの出力を確認できるようになれば削除する
// 単にコマンドを実行できるデバッグモードを用意
const debugButton = document.getElementById('debug-mode'); // デバッグボタン要素
const inputCommandValue = document.getElementById('input-command'); // コマンド入力欄要素
const runButton = document.getElementById('run-button'); // 実行ボタン要素
const titleLabel = document.getElementById('title-label'); // タイトルラベル要素
var debugCount = 0; // クリック回数のカウント用

// タイトルラベルのクリックをリッスンし、クリック回数によってデバッグモードを有効にするか尋ねる
titleLabel.addEventListener('click', () => {
    debugCount += 1;
    if (debugCount == 10) {
        const debugMode = confirm('デバッグモードを有効にしますか');
        if (debugMode == true) {
            debugButton.hidden = false; // デバッグ有効化ボタンを表示させる
        } else {
            return;
        }
    } else {
        return;
    }
});

// デバッグ有効化ボタンのクリックをリッスン
debugButton.addEventListener('click', () => {
    inputCommandValue.hidden = false; // コマンド入力を表示させる
    runButton.hidden = false; // コマンド実行ボタンを表示させる
});

// デバッグ実行
runButton.addEventListener('click', () => {
    outputTextareaElement.value = null; // 実行結果を受け取る前に、テキストエリアを初期化する
    const command = inputCommandValue.value.trim(); // コマンドを取得する

    // コマンドが入力されていない場合は、アラートを出力して終了する
    if (command === '') {
        alert('コマンドを入力してください');
        return;
    } else {
        window.electronAPI.runCommand(command); // メインプロセスでコマンドを実行する
    }
});