class ProgressBar {
  constructor() {
    this.progressBar = document.getElementById("progress-bar");
    this.progress = document.getElementById("progress");
    this.progress.hidden = true;
    this.duration = 0;
    this.elapsedTime = 0;
    this.intervalId = null;
  }

  startProgress(duration) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.progress.hidden = false;
    this.duration = Math.max(Number(duration) || 1, 1);
    this.elapsedTime = 0;

    this.progressBar.style.width = "0%";
    this.progressBar.innerText = "0%";
    this.progressBar.setAttribute("class", "progress-bar bg-success");
    this.progressBar.setAttribute("aria-valuenow", 0);
    this.progressBar.setAttribute("aria-valuemin", 0);
    this.progressBar.setAttribute("aria-valuemax", 100);
    this.progressBar.setAttribute("style", "width: 0%;");

    this.intervalId = setInterval(() => {
      this.updateProgress();
    }, 1000);
  }

  updateProgress() {
    const ratio = Math.min(this.elapsedTime / this.duration, 1);
    const percent = Math.floor(ratio * 1000) / 10;

    this.progressBar.style.width = percent + "%";
    this.progressBar.innerText = percent + "%";
    this.progressBar.setAttribute("aria-valuenow", percent);
    this.progressBar.setAttribute("style", "width:" + percent + "%");

    this.elapsedTime += 1;

    if (this.elapsedTime >= this.duration) {
      // 想定時間超過: 完了待ち表示（実際の完了は processMessage で endProgress(true)）
      this.progressBar.style.width = "100%";
      this.progressBar.innerText = "もう少しで完了します...";
      this.progressBar.setAttribute(
        "class",
        "progress-bar progress-bar-striped progress-bar-animated"
      );
      this.progressBar.setAttribute("aria-valuenow", 100);
      this.progressBar.setAttribute("style", "width: 100%");
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  endProgress(completed = false) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.progressBar.style.width = "100%";
    this.progressBar.innerText = completed ? "完了しました!" : "もう少しで完了します...";
    this.progressBar.setAttribute(
      "class",
      completed ? "progress-bar bg-success" : "progress-bar progress-bar-striped progress-bar-animated"
    );
    this.progressBar.setAttribute("aria-valuenow", 100);
    this.progressBar.setAttribute("style", "width: 100%");
  }
}
