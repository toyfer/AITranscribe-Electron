document.addEventListener('DOMContentLoaded', function () {
    // CSVファイルの選択と処理
    document.getElementById('csvFileInput').addEventListener('change', handleCSVFile);

    // 音声ファイルの選択と再生
    document.getElementById('audioFileInput').addEventListener('change', handleAudioFile);

    // テキストリンクのクリックイベント
    document.addEventListener('click', handleTextLinkClick);

    // CSVファイルを読み込んだ時に実行
    async function handleCSVFile(e) {
        const file = e.target.files[0];
        // UTF-8をデフォルトで想定
        const text = await readFileAsText(file);

        const lines = text.split('\n');
        const filteredLines = lines.filter(Boolean);

        let tableRows = '';
        for (let i = 0; i < filteredLines.length; i++) {
            const line = filteredLines[i];
            const columns = line.split(',');

            if (i === 0) {
                continue; // ヘッダー行はスキップする
            }

            const point = columns[0];
            const start = parseInt(columns[1], 10);
            const end = parseInt(columns[2], 10);
            const text = columns[3];

            // テーブルを生成し、テキストリンクを追加する
            tableRows += `<tr data-start="${start}"><td>${point}</td><td>${start}</td><td>${end}</td><td class="text-link text-primary" data-start="${start}">${text}</td></tr>`;
        }

        // 生成したテーブル行を挿入する
        document.getElementById('csvTableBody').innerHTML = tableRows;
    }

    // 音声ファイルを選択したときの処理を実行する関数
    function handleAudioFile(e) {
        const file = e.target.files[0];
        const audioPlayer = document.getElementById('audio');
        audioPlayer.src = URL.createObjectURL(file); // 音声ファイルのURLを設定する
        audioPlayer.controls = true; // オーディオプレイヤーのコントロールを有効にする
    }

    // テキストリンクがクリックされた時の処理を実行する関数
    function handleTextLinkClick(e) {
        if (e.target.classList.contains('text-link')) {
            const start = e.target.getAttribute('data-start');
            // クリックされたテキストリンクの位置から再生を開始する
            document.querySelector('audio').currentTime = start;
            document.querySelector('audio').play();
        }
    }

    // ファイルをテキストとして読み込む関数
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (e) {
                resolve(e.target.result);
            };

            reader.onerror = function (e) {
                reject(e);
            };

            reader.readAsText(file); // ファイルを指定したエンコーディングで読み込む
        });
    }
});
