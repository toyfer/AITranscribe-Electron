document.addEventListener('DOMContentLoaded', function () {
    // CSVファイルの選択と処理
    document.getElementById('csvFileInput').addEventListener('change', handleCSVFile);

    // 音声ファイルの選択と再生
    document.getElementById('audioFileInput').addEventListener('change', handleAudioFile);

    // テキストリンクのクリックイベント
    document.addEventListener('click', handleTextLinkClick);

    async function handleCSVFile(e) {
        const file = e.target.files[0];
        const text = await readFileAsText(file, 'Shift_JIS');

        const lines = text.split('\n');
        const filteredLines = lines.filter(Boolean);

        let tableRows = '';
        for (let i = 0; i < filteredLines.length; i++) {
            const line = filteredLines[i];
            const columns = line.split(',');

            if (i === 0) {
                continue;
            }

            const point = columns[0];
            const start = parseInt(columns[1], 10);
            const end = parseInt(columns[2], 10);
            const text = columns[3];

            tableRows += `<tr data-start="${start}"><td>${point}</td><td>${start}</td><td>${end}</td><td class="text-link text-primary" data-start="${start}">${text}</td></tr>`;
        }

        document.getElementById('csvTableBody').innerHTML = tableRows;
    }

    function handleAudioFile(e) {
        const file = e.target.files[0];
        const audioPlayer = document.getElementById('audio');
        audioPlayer.src = URL.createObjectURL(file);
        audioPlayer.controls = true;
    }

    function handleTextLinkClick(e) {
        if (e.target.classList.contains('text-link')) {
            const start = e.target.getAttribute('data-start');
            document.querySelector('audio').currentTime = start;
            document.querySelector('audio').play();
        }
    }

    function readFileAsText(file, encoding) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function (e) {
                resolve(e.target.result);
            };

            reader.onerror = function (e) {
                reject(e);
            };

            reader.readAsText(file, encoding);
        });
    }
});
