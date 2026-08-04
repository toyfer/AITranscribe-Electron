# Faster-Whisper の実行（エアギャップ想定: モデルはローカルパスのみ使用）
# 進捗・計測: stdout に __AIT__{json} 行を出す（main がパースして UI へ）
# オプション: 第4引数に JSON ファイルパス（beam_size / hotwords 等）
from faster_whisper import WhisperModel
import sys
import os
import datetime
import socket
import csv
import json
import time


# 標準出力のエンコードを変更します
sys.stdout.reconfigure(encoding="utf-8")
# 行バッファ相当: Electron 側は PYTHONUNBUFFERED=1 / python -u も併用
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

AIT_PREFIX = "__AIT__"


def ait_emit(payload: dict) -> None:
    """Structured event for the Electron main process (one JSON object per line)."""
    print(AIT_PREFIX + json.dumps(payload, ensure_ascii=False), flush=True)


def load_options(path: str | None) -> dict:
    """Load optional JSON options written by Electron main. Safe defaults if missing."""
    defaults = {
        "beam_size": 3,
        "hotwords": "",
        "initial_prompt": "",
        "vad_filter": True,
        "vad_min_silence_ms": 500,
        "condition_on_previous_text": True,
    }
    if not path:
        return defaults
    if not os.path.isfile(path):
        print(f"Options file not found (using defaults): {path}", file=sys.stderr)
        return defaults
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return defaults
        out = dict(defaults)
        if "beam_size" in data:
            try:
                b = int(data["beam_size"])
                if 1 <= b <= 10:
                    out["beam_size"] = b
            except (TypeError, ValueError):
                pass
        if "hotwords" in data and data["hotwords"] is not None:
            out["hotwords"] = str(data["hotwords"]).strip()
        if "initial_prompt" in data and data["initial_prompt"] is not None:
            out["initial_prompt"] = str(data["initial_prompt"]).strip()
        if "vad_filter" in data:
            out["vad_filter"] = bool(data["vad_filter"])
        if "vad_min_silence_ms" in data:
            try:
                ms = int(data["vad_min_silence_ms"])
                if 100 <= ms <= 5000:
                    out["vad_min_silence_ms"] = ms
            except (TypeError, ValueError):
                pass
        if "condition_on_previous_text" in data:
            out["condition_on_previous_text"] = bool(data["condition_on_previous_text"])
        return out
    except Exception as exc:
        print(f"Failed to read options JSON (using defaults): {exc}", file=sys.stderr)
        return defaults


start_time = datetime.datetime.now()
t_script0 = time.perf_counter()

args = sys.argv

# 引数[1] はローカルモデルディレクトリ（HF キャッシュからコピーした CTranslate2 モデル）
# 引数[2] は処理する音声ファイル（WAV）のパス
# 引数[3] はオプション JSON（任意）
if len(args) < 3:
    print(
        "Usage: Faster-Whisper.py <model_dir> <wav_path> [options.json]",
        file=sys.stderr,
    )
    sys.exit(2)

models_path = args[1]
file_path = args[2]
options_path = args[3] if len(args) >= 4 else None
opts = load_options(options_path)

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

ait_emit({"type": "phase", "phase": "load"})
t_load0 = time.perf_counter()
model = WhisperModel(models_path, device=device, compute_type=compute_type)
t_load_sec = time.perf_counter() - t_load0
ait_emit({"type": "phase", "phase": "load", "t_load_sec": round(t_load_sec, 3)})

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
    writer.writerow(
        [
            file_path,
            models_path,
            file_size,
            start_time,
            host,
            ip,
            device,
            compute_type,
            opts.get("beam_size"),
        ]
    )

# vad_filter: 無音区間を落として幻覚・無駄計算を減らす（Silero VAD・fw 1.2.x）
# language=ja 固定（日本語用途。自動検出のオーバーヘッド回避）
# hotwords / initial_prompt: 固有名詞ヒント（辞書ではない・バイアス）
ait_emit({"type": "phase", "phase": "transcribe_setup"})
t_setup0 = time.perf_counter()

transcribe_kwargs = {
    "beam_size": int(opts["beam_size"]),
    "language": "ja",
    "vad_filter": bool(opts["vad_filter"]),
    "condition_on_previous_text": bool(opts["condition_on_previous_text"]),
}
if opts["vad_filter"]:
    transcribe_kwargs["vad_parameters"] = dict(
        min_silence_duration_ms=int(opts["vad_min_silence_ms"])
    )
if opts.get("hotwords"):
    transcribe_kwargs["hotwords"] = opts["hotwords"]
if opts.get("initial_prompt"):
    transcribe_kwargs["initial_prompt"] = opts["initial_prompt"]

print(
    f"[options] beam_size={transcribe_kwargs['beam_size']} "
    f"vad={transcribe_kwargs['vad_filter']} "
    f"hotwords_len={len(opts.get('hotwords') or '')} "
    f"prompt_len={len(opts.get('initial_prompt') or '')}",
    flush=True,
)

segments_gen, info = model.transcribe(file_path, **transcribe_kwargs)
t_setup_sec = time.perf_counter() - t_setup0

duration = float(getattr(info, "duration", 0.0) or 0.0)
duration_after_vad = float(getattr(info, "duration_after_vad", 0.0) or 0.0)
progress_denom = duration if duration > 0 else 1.0

ait_emit(
    {
        "type": "phase",
        "phase": "infer",
        "duration": round(duration, 3),
        "duration_after_vad": round(duration_after_vad, 3),
        "t_setup_sec": round(t_setup_sec, 3),
        "t_load_sec": round(t_load_sec, 3),
        "beam_size": int(opts["beam_size"]),
    }
)

t_infer0 = time.perf_counter()
last_end = 0.0
seg_count = 0

with open(f"{file_path}.csv", "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["point", "start", "end", "text"])

    text_old = ""

    for segment in segments_gen:
        # 音声タイムライン進捗（VAD で飛びがあっても end の単調増加で更新）
        if segment.end is not None and segment.end > last_end:
            last_end = float(segment.end)
        seg_count += 1
        pct = min(100.0, 100.0 * last_end / progress_denom)
        ait_emit(
            {
                "type": "progress",
                "phase": "infer",
                "segment_id": segment.id,
                "audio_end": round(last_end, 3),
                "duration": round(duration, 3),
                "duration_after_vad": round(duration_after_vad, 3),
                "pct": round(pct, 2),
                "wall_sec": round(time.perf_counter() - t_infer0, 3),
            }
        )

        if text_old != segment.text:
            writer.writerow([segment.id, segment.start, segment.end, segment.text])
            print(
                f"[{segment.start}s --> {segment.end}s]:{segment.text}",
                flush=True,
            )
            text_old = segment.text

t_infer_sec = time.perf_counter() - t_infer0

# 末尾無音などで 100% に届かない場合の締め
if last_end < progress_denom:
    last_end = progress_denom
    ait_emit(
        {
            "type": "progress",
            "phase": "infer",
            "segment_id": seg_count,
            "audio_end": round(last_end, 3),
            "duration": round(duration, 3),
            "duration_after_vad": round(duration_after_vad, 3),
            "pct": 100.0,
            "wall_sec": round(t_infer_sec, 3),
        }
    )

ait_emit({"type": "phase", "phase": "write"})
t_python_sec = time.perf_counter() - t_script0
rtf_infer = (t_infer_sec / duration) if duration > 0 else None
rtf_python = (t_python_sec / duration) if duration > 0 else None
end_time = datetime.datetime.now()

# 追加ログ行（終了時刻・所要）— 既存列互換のため別行で追記
with open(logfile_path, "a", encoding="utf-8-sig", newline="") as log:
    writer = csv.writer(log)
    writer.writerow(
        [
            "timing",
            file_path,
            end_time,
            round(t_load_sec, 3),
            round(t_setup_sec, 3),
            round(t_infer_sec, 3),
            round(t_python_sec, 3),
            round(duration, 3),
            round(duration_after_vad, 3),
            round(rtf_infer, 4) if rtf_infer is not None else "",
            device,
            compute_type,
        ]
    )

ait_emit(
    {
        "type": "timing",
        "t_load_sec": round(t_load_sec, 3),
        "t_setup_sec": round(t_setup_sec, 3),
        "t_infer_sec": round(t_infer_sec, 3),
        "t_write_sec": 0.0,
        "t_python_sec": round(t_python_sec, 3),
        "duration": round(duration, 3),
        "duration_after_vad": round(duration_after_vad, 3),
        "rtf_infer": round(rtf_infer, 4) if rtf_infer is not None else None,
        "rtf_python": round(rtf_python, 4) if rtf_python is not None else None,
        "segments": seg_count,
        "device": device,
        "compute_type": compute_type,
        "beam_size": int(opts["beam_size"]),
    }
)
ait_emit({"type": "done"})
