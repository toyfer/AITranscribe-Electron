import whisper
import logging
import sys
import os
import glob
import datetime

# 実行時間の計測をスタートします
start_time = datetime.datetime.now()

# AITranscribe-Electronの引数を取得します
args = sys.argv

# 引数[1]はモデルのパスです
models_path = args[1]

# 引数[2]は処理する音声ファイルのパスです
file_path = args[2]

# 使用するモデルを決定します
model = whisper.load_model(f"{models_path}")

# 推論を開始します
result = model.transcribe(
    file_path,verbose=True
    ,verbose=True
    ,beam_size=5
    ,language="ja"
    ,without_timestamps=False
    ,temperatune=0
)

# 推論の結果を格納してファイルに出力
with open(f"{file_path}.csv","w") as f:
    f.write("point,start,end,text\n")

    text_old = ""

    # 書き起こし結果を出力ファイルに書き込みます
    for segments in result["segments"]:
        # 推論が重複している場合はCSVに記述しない
        if text_old != segments['text']:
            f.write(f"{segments['id'],{segments['start']},{segments['end'],{segments['text']\n")
            text_old = segments['text']
