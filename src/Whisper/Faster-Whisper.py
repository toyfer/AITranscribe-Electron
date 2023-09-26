# Faster-Whisperの実行に必要なライブラリ
from faster_whisper import WhisperModel
import logging
import sys
import os
import datetime

# log取得に必要なライブラリ
import socket

# 実行時間の計測をスタートします
start_time = datetime.datetime.now()

# AITranscribe-Electronの引数を取得します
args = sys.argv

# 引数[1]はモデルのパスです
models_path = args[1]

# 引数[2]は処理する音声ファイルのパスです
file_path = args[2]

# 使用するモデルを決定します
model = WhisperModel(models_path, device="cpu", compute_type="int8")

# 使用者のログと記録を取ります
logfile_path = os.path.dirname(__file__)
file_size = os.path.getsize(file_path)
host = socket.gethostname()
ip = socket.gethostbyname(host)
with open(f"{logfile_path}log.csv","a", encoding="utf_8_sig") as log:
    log.write(f"{file_path},{models_path},{file_size},{start_time},{host},{ip}\n")

# 推論を開始します
result, _ = model.transcribe(
    file_path
    ,beam_size=5
    ,language="ja"
    )

# 推論の結果を格納してファイルに出力
with open(f"{file_path}.csv", "w", encoding="utf-8_sig") as f:
    f.write("point,start,end,text\n")

    text_old = ""

    # 書き起こし結果を出力ファイルに書き込みます
    for segments in result:
        # 推論が重複している場合はCSVに記述しない
        if text_old != segments.text:
            f.write(f"{segments.id},{segments.start},{segments.end},{segments.text}\n")
            print(f"[{segments.start}s --> {segments.end}s]:{segments.text}")
            text_old = segments.text