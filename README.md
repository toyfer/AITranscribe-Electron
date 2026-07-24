[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)
[![Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

## ピン留め方針（Phase 3 + 4）

再現性のためバージョンを固定します。Electron / Node はサポート対象 major へ更新済みです。

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS（〜2028-04） |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | 26.x 最新。27.x は見送り |
| @electron/asar | **3.2.18** | |
| Python Embeddable | **3.11.4** amd64 | |
| faster-whisper | **1.2.1**（`requirements-whisper.txt`） | turbo エイリアス対応済み |
| モデル（推奨） | **turbo**（large-v3-turbo）+ small / medium | 詳細は [docs/models.md](docs/models.md) |

```bash
# オンライン機 — npm（package.json のピンに従う）
npm install

# オンライン機 — Embeddable 上の pip
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

`package-lock.json` をコミット対象にし、CI / ローカルとも可能な限り lock に従ってください。
`npm audit fix` で lock を勝手に書き換えない運用です（更新は意図した PR で）。

### package-lock.json の再生成（GitHub Actions）

1. **Settings → Actions → General → Workflow permissions** → **Read and write permissions**
2. [Actions → Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) → **Run workflow**

## エアギャップ運用の前提（重要）

このリポジトリの Git には **ランタイム本体を含めません**。

| コンポーネント | Git に含むか | 理由 / 配置場所 |
| --- | --- | --- |
| Electron アプリ本体（`src/*.js` 等） | 含む | アプリロジック |
| `Faster-Whisper.py` / `requirements-whisper.txt` | 含む | 推論エントリと pip ピン |
| **FFmpeg (`ffmpeg.exe`)** | **含めない** | ライセンス都合。利用側で配置 |
| **Python Embeddable** | **含めない** | 公式 embeddable を展開 |
| **Faster-Whisper モデル** | **含めない**（`.gitkeep` のみ） | オンラインで取得しコピー |
| site-packages（pip 結果） | 含めない | Embeddable 上に事前インストール |

### 実行時に必要な配置（`src/Whisper/` 配下）

```
src/Whisper/
  ffmpeg.exe
  python.exe                 # Python Embeddable 展開物
  Lib/ / Scripts/ 等
  Faster-Whisper.py
  models/
    small/                   # 高速
    turbo/                   # 推奨（large-v3-turbo）
    medium/                  # 精度
    large-v3/                # 最高精度（任意・重い）
```

アプリは起動時に `ffmpeg.exe` / `python.exe` の有無を確認し、実行時に選択モデルディレクトリの有無を確認します。**不足時はネットから取得せずエラーにします**。

### モデルについて（Phase 4）

詳細: **[docs/models.md](docs/models.md)**

| UI | 配置 dir | 取得元（CTranslate2） | 用途 |
| --- | --- | --- | --- |
| 高速 | `models/small/` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | CPU 軽量 |
| **バランス（既定）** | `models/turbo/` | [mobiuslabsgmbh/faster-whisper-large-v3-turbo](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo) | **高精度を効率化（JA 多言語）** |
| 精度 | `models/medium/` | [Systran/faster-whisper-medium](https://huggingface.co/Systran/faster-whisper-medium) | 従来の精度重視 |
| 最高精度 | `models/large-v3/` | [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3) | 最良精度・CPU では遅い |

```bash
# オンライン機 — 推奨セット
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo src/Whisper/models/turbo
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium
# 任意
# git clone --depth 1 https://huggingface.co/Systran/faster-whisper-large-v3 src/Whisper/models/large-v3
```

- **distil-whisper（英語寄り）は採用しない**（日本語エアギャップ向きではない）
- アプリは `WhisperModel(ローカルpath)` のみ。実行環境はオフラインでよい
- 既存の `small` / `medium` 配置はそのまま使える。既定 UI は turbo（未配置なら small 等に切替）

### FFmpeg について

- **同梱しない**（ライセンス方針）
- `src/Whisper/ffmpeg.exe` に配置

### Python Embeddable について

1. [Python 3.11.4 Embeddable amd64](https://www.python.org/ftp/python/3.11.4/python-3.11.4-embed-amd64.zip) を `src/Whisper/` に展開
2. `python311._pth` で `import site` を有効化
3. `get-pip.py` 後、`python.exe -m pip install -r requirements-whisper.txt`
4. フォルダごとエアギャップ機へコピー

## ディレクトリ構造（アプリ）

```
src/
  main.js / main/ / shared/ / preload.js / renderer.js ...
  Whisper/models/{small,turbo,medium,large-v3}/
docs/models.md
requirements-whisper.txt
```

## ローカル開発

```bash
npm install
# Whisper 配下に ffmpeg / Embeddable / models を配置してから
npm start
```

## ビルド（Windows）

```bash
npm run build_win
```

## セキュリティ（Electron）

- `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`
- preload + `contextBridge` のみ
- 子プロセスは `shell: false` + 引数配列

## GitHub Actions

| Workflow | 内容 |
| --- | --- |
| [regenerate-lock](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) | package-lock 再生成（手動） |
| fullbuild | Node 24 + small/turbo/medium を clone して組み立て |
| partialbuild | モデル除外寄りの部分ビルド |

## 出力

入力音声と同じディレクトリに、タイムスタンプ付き CSV を出力します。

## ロードマップ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0–3 | Critical / ピン / リファクタ / Electron 43 | **完了** |
| 4 | 効率モデル（turbo）・カタログ化 | **本変更** |
| 5 | 配布・ライセンス文書・fuses | 予定 |

## 今後の課題

1. LICENSE / サードパーティ通知（FFmpeg 非同梱）
2. Electron fuses
3. lock 反映後、fullbuild / partialbuild を `npm ci` に切替
4. 実機で turbo / medium の進捗倍率チューニング
