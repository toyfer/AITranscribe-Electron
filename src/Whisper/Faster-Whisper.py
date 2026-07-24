# Faster-Whisper の実行（エアギャップ想定: モデルはローカルパスのみ使用）
from faster_whisper import WhisperModel
import sys
import os
import datetime
import socket
import csv


# 標準出力のエンコードを変更します
sys.stdout.reconfigure(encoding="utf-8")

start_time = datetime.datetime.now()

args = sys.argv

# 引数[1] はローカルモデルディレクトリ（HF キャッシュからコピーした CTranslate2 モデル）
# 引数[2] は処理する音声ファイル（WAV）のパス
if len(args) < 3:
    print("Usage: Faster-Whisper.py <model_dir> <wav_path>", file=sys.stderr)
    sys.exit(2)

models_path = args[1]
file_path = args[2]

if not os.path.isdir(models_path):
    print(f"Model directory not found: {models_path}", file=sys.stderr)
    sys.exit(1)

if not os.path.isfile(file_path):
    print(f"Audio file not found: {file_path}", file=sys.stderr)
    sys.exit(1)

# local_files_only 相当: パス指定の WhisperModel はローカルのみ参照
# （ネットから取りに行かせない運用。モデルは事前配置すること）
# CPU air-gap: int8。GPU がある場合は環境変数 AITRANSCRIBE_DEVICE / AITRANSCRIBE_COMPUTE で上書き可
device = os.environ.get("AITRANSCRIBE_DEVICE", "cpu")
compute_type = os.environ.get("AITRANSCRIBE_COMPUTE", "int8")
model = WhisperModel(models_path, device=device, compute_type=compute_type)

# 使用者ログ（Whisper ディレクトリ直下）
logfile_dir = os.path.dirname(os.path.abspath(__file__))
logfile_path = os.path.join(logfile_dir, "log.csv")
file_size = os.path.getsize(file_path)
host = socket.gethostname()
try:
    ip = socket.gethostbyname(host)
except OSError:
    ip = "unknown"

with open(logfile_path, "a", encoding="utf-8-sig", newline="") as log:
    writer = csv.writer(log)
    writer.writerow([file_path, models_path, file_size, start_time, host, ip, device, compute_type])

# vad_filter: 無音区間を落として幻覚・無駄計算を減らす（Silero VAD・fw 1.2.x）
# language=ja 固定（日本語用途。自動検出のオーバーヘッド回避）
result, _ = model.transcribe(
    file_path,
    beam_size=5,
    language="ja",
    vad_filter=True,
    vad_parameters=dict(min_silence_duration_ms=500),
)

with open(f"{file_path}.csv", "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["point", "start", "end", "text"])

    text_old = ""

    for segments in result:
        if text_old != segments.text:
            writer.writerow([segments.id, segments.start, segments.end, segments.text])
            print(f"[{segments.start}s --> {segments.end}s]:{segments.text}")
            text_old = segments.text
