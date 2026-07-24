[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)
[![Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

## ピン留め方針（Phase 3–4）

再現性のためバージョンを固定します。

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS（〜2028-04） |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | 26.x 最新 |
| @electron/asar | **3.2.18** | |
| Python Embeddable | **3.11.4** amd64 | |
| faster-whisper | **1.2.1**（最新・維持） | master tarball 禁止 |
| モデル small | Systran/faster-whisper-small | 速度 |
| モデル medium | Systran/faster-whisper-medium | バランス |
| モデル **turbo** | deepdml/faster-whisper-large-v3-turbo-ct2 | **効率（large 級・高速・日本語）** |

詳細比較: [docs/models.md](docs/models.md)

```bash
# オンライン機 — npm（package-lock に従う）
npm ci

# オンライン機 — Embeddable 上の pip
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

`package-lock.json` をコミット対象にします。更新は [regenerate-lock workflow](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) または意図した PR で。

### package-lock.json の再生成（GitHub Actions）

1. **Settings → Actions → General → Workflow permissions** → **Read and write permissions**
2. [Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) → **Run workflow**

## エアギャップ運用の前提（重要）

このリポジトリの Git には **ランタイム本体を含めません**。

| コンポーネント | Git に含むか | 理由 / 配置場所 |
| --- | --- | --- |
| Electron アプリ本体 | 含む | アプリロジック |
| `Faster-Whisper.py` / `requirements-whisper.txt` | 含む | 推論エントリと pip ピン |
| **FFmpeg (`ffmpeg.exe`)** | **含めない** | ライセンス都合 |
| **Python Embeddable** | **含めない** | 公式 embeddable を展開 |
| **モデル weights** | **含めない** | オンラインで取得しコピー |
| site-packages | 含めない | Embeddable 上に事前インストール |

### 実行時配置（`src/Whisper/`）

```
src/Whisper/
  ffmpeg.exe
  python.exe / python311.dll / Lib/ ...
  Faster-Whisper.py
  models/
    small/    # Systran/faster-whisper-small
    medium/   # Systran/faster-whisper-medium
    turbo/    # deepdml/faster-whisper-large-v3-turbo-ct2
```

### モデルの取得（オンライン機）

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
```

- **distil-*** 系は主に英語向けのため、日本語本線には使いません（[docs/models.md](docs/models.md)）
- アプリは `WhisperModel(ローカルpath)` のみ。実行時ネット不要
- 推論: CPU `int8` + `language=ja` + `vad_filter=True`（環境変数で device 上書き可）

### FFmpeg / Python Embeddable

- FFmpeg: 同梱しない。`src/Whisper/ffmpeg.exe` に配置
- Python: [3.11.4 Embeddable amd64](https://www.python.org/ftp/python/3.11.4/python-3.11.4-embed-amd64.zip) → `import site` 有効化 → `pip install -r requirements-whisper.txt`

## ディレクトリ構造

```
src/
  main.js / main/ / shared/ / preload.js / renderer.js ...
  Whisper/
  Transcribe-Suppoter/
docs/models.md
requirements-whisper.txt
```

## ローカル開発

```bash
npm ci   # または npm install
npm start
```

## ビルド（Windows）

```bash
npm run build_win
```

## セキュリティ（Electron）

- `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`
- preload + contextBridge のみ
- 子プロセスは `shell: false` + 引数配列

## GitHub Actions

| Workflow | 内容 |
| --- | --- |
| regenerate-lock | package-lock 再生成 → push（手動） |
| fullbuild | Node 24 + `npm ci` + small/medium/**turbo** モデルで組み立て |
| partialbuild | モデル除外寄りの部分ビルド |

## ロードマップ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0–3 | Critical / ピン / リファクタ / Electron 43 | **完了** |
| 4 | モデル（turbo）・VAD・npm ci | **本変更** |
| 5 | 配布・ライセンス・fuses | 予定 |

## 今後の課題

1. LICENSE / サードパーティ通知（FFmpeg 非同梱）
2. Electron fuses
3. 実機で turbo vs medium の体感時間・WER を確認
4. 必要なら large-v3 フルを第4オプションに追加
