class ProgressBar {
    constructor() {
        this.progressBar = document.getElementById('progress-bar');
        this.progress = document.getElementById('progress');
        this.progress.hidden = true;
        this.duration = 0;
        this.elapsedTime = 0;
        this.intervalId = null;
    }

    startProgress(duration) {
        this.progress.hidden = false;
        this.duration = duration;
        this.progressBar.style.width = '0%';
        this.progressBar.innerText = '0%';
        this.progressBar.setAttribute('class', 'progress-bar bg-success')
        this.progressBar.setAttribute('aria-valuenow', 0);
        this.progressBar.setAttribute('aria-valuemin', 0);
        this.progressBar.setAttribute('aria-valuemax', 100);
        this.progressBar.setAttribute('style', 'width: 0%;');

        this.intervalId = setInterval(() => {
            this.updateProgress();
        }, 1000);
    }

    updateProgress() {
        this.progressBar.style.width = (this.elapsedTime / this.duration) * 100 + '%';
        this.progressBar.innerText = Math.floor((this.elapsedTime / this.duration) * 100 * 10) / 10 + '%';
        this.progressBar.setAttribute('aria-valuenow', Math.floor((this.elapsedTime / this.duration) * 100 * 10) / 10);
        this.progressBar.setAttribute('aria-valuemin', 0);
        this.progressBar.setAttribute('aria-valuemax', 100);
        this.progressBar.setAttribute('style', 'width:' + Math.floor((this.elapsedTime / this.duration) * 100 * 10) / 10 + '%');

        this.elapsedTime += 1;

        if (this.elapsedTime >= this.duration) {
            this.endProgress();
        };
    }

    endProgress() {
        this.progressBar.style.width = '100%';
        this.progressBar.innerText = 'もう少しで完了します...';
        this.progressBar.setAttribute('class', 'progress-bar progress-bar-striped progress-bar-animated')
        this.progressBar.setAttribute('aria-valuenow', 100);
        this.progressBar.setAttribute('aria-valuemin', 0);
        this.progressBar.setAttribute('aria-valuemax', 100);
        this.progressBar.setAttribute('style', 'width: 100%');
        clearInterval(this.intervalId);
    }
}
