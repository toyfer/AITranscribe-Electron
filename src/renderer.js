class UIHandler {
    constructor() {
        this.outputTextareaElement = document.getElementById('output-textarea');
        this.audioFile = new Audio();
        this.audioDuration = 0;
        this.intervalId = null;

        this.fileSelectButton = document.getElementById('file-select-button');
        this.filePathElement = document.getElementById('file-path');

        this.selectModelElement = document.getElementById('select-model');
        this.runFFmpegButton = document.getElementById('run-ffmpeg');

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        this.fileSelectButton.addEventListener('click', async () => {
            const filePath = await window.electronAPI.openFile();
            if (filePath) {
                this.filePathElement.value = filePath;
                this.audioFile.src = filePath;
            }
        });

        this.filePathElement.addEventListener('click', async () => {
            const filePath = await window.electronAPI.openFile();
            if (filePath) {
                this.filePathElement.value = filePath;
                this.audioFile.src = filePath;
            }
        });

        this.audioFile.addEventListener('loadedmetadata', () => {
            this.audioDuration = this.audioFile.duration;
        });

        this.runFFmpegButton.addEventListener('click', () => {
            this.handleRunFFmpeg();
        });

        window.electronAPI.returnCommand((_event, output) => {
            this.handleReturnCommand(output);
        });

        window.electronAPI.processMassage((_event, massage) => {
            this.handleProcessMassage(massage);
        });
    }

    handleRunFFmpeg() {
        if (!this.filePathElement.value) {
            alert('音声ファイルを選択してください');
            return;
        }

        if (this.selectModelElement.value == '精度を選択してください') {
            alert('精度を選択してください');
            return;
        }

        const selectModel = this.getSelectModel();
        const FFmpegArgs = this.filePathElement.value;
        const WhisperArgs = selectModel;

        this.disableElements();
        this.startProgress(this.audioDuration);

        window.electronAPI.runFFmpeg([FFmpegArgs, WhisperArgs]);
    }

    getSelectModel() {
        switch (this.selectModelElement.value) {
            case '1':
                this.audioDuration *= 0.7;
                return {
                    model: 'Whisper\\models\\small',
                    script: 'Whisper\\Faster-Whisper.py'
                };
            case '2':
                this.audioDuration *= 1.3;
                return {
                    model: 'Whisper\\models\\medium',
                    script: 'Whisper\\Faster-Whisper.py'
                };
        }
    }

    disableElements() {
        this.runFFmpegButton.disabled = true;
        this.runFFmpegButton.innerText = '処理中です…';
        this.filePathElement.disabled = true;
        this.fileSelectButton.disabled = true;
        this.selectModelElement.disabled = true;
    }

    handleReturnCommand(output) {
        this.outputTextareaElement.value += output;
        this.outputTextareaElement.scrollTop = this.outputTextareaElement.scrollHeight;
    }

    handleProcessMassage(massage) {
        const notificationTitle = 'Ai文字起こし';
        const notificationBody = massage;
        new Notification(notificationTitle, { body: notificationBody });

        this.enableElements();
        this.endProgress();
    }

    enableElements() {
        this.runFFmpegButton.disabled = false;
        this.runFFmpegButton.innerText = 'スタート';
        this.filePathElement.disabled = false;
        this.fileSelectButton.disabled = false;
        this.selectModelElement.disabled = false;
    }

    startProgress(duration) {
        const progressBar = document.getElementById('progress-bar');
        const progress = document.getElementById('progress');
        progress.hidden = false;
        let elapsedTime = 0;
        progressBar.style.width = '0%';
        progressBar.innerText = '0%';
        progressBar.setAttribute('class', 'progress-bar bg-success');
        progressBar.setAttribute('aria-valuenow', 0);
        progressBar.setAttribute('aria-valuemin', 0);
        progressBar.setAttribute('aria-valuemax', 100);
        progressBar.setAttribute('style', 'width: 0%;');

        this.intervalId = setInterval(() => {
            progressBar.style.width = (elapsedTime / duration) * 100 + '%';
            progressBar.innerText = Math.floor((elapsedTime / duration) * 100 * 10) / 10 + '%';
            progressBar.setAttribute('aria-valuenow', Math.floor((elapsedTime / duration) * 100 * 10) / 10);
            progressBar.setAttribute('aria-valuemin', 0);
            progressBar.setAttribute('aria-valuemax', 100);
            progressBar.setAttribute('style', 'width:' + Math.floor((elapsedTime / duration) * 100 * 10) / 10 + '%');

            elapsedTime += 1;

            if (elapsedTime >= duration) {
                progressBar.style.width = '100%';
                progressBar.innerText = 'もう少しで完了します...';
                progressBar.setAttribute('class', 'progress-bar progress-bar-striped progress-bar-animated');
                progressBar.setAttribute('aria-valuenow', 100);
                progressBar.setAttribute('aria-valuemin', 0);
                progressBar.setAttribute('aria-valuemax', 100);
                progressBar.setAttribute('style', 'width: 100%');
                clearInterval(this.intervalId);
            }
        }, 1000);
    }

    endProgress() {
        const progressBar = document.getElementById('progress-bar');
        progressBar.style.width = '100%';
        progressBar.innerText = '完了しました!';
        progressBar.setAttribute('class', 'progress-bar');
        progressBar.setAttribute('aria-valuenow', 100);
        progressBar.setAttribute('aria-valuemin', 0);
        progressBar.setAttribute('aria-valuemax', 100);
        progressBar.setAttribute('style', 'width: 100%;');
        clearInterval(this.intervalId);
    }
}

const uiHandler = new UIHandler();
