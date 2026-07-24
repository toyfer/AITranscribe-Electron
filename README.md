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

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | 26.x |
| faster-whisper | **1.2.1** | turbo エイリアス対応 |
| モデル（**UI 既定**） | **turbo** | large-v3 級を効率化 |
| モデル small / medium / large-v3 | 各 Systran 等 | 詳細 [docs/models.md](docs/models.md) |

```bash
npm ci
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

### package-lock 再生成

[Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)（Settings で Workflow **Read and write** が必要）

## モデル（Phase 4）

詳細: **[docs/models.md](docs/models.md)** — UI は `renderer.js` の **`MODEL_CATALOG`** が単一ソース。

| UI | dir | 取得元 | 用途 |
| --- | --- | --- | --- |
| 高速 | `models/small/` | Systran/faster-whisper-small | 軽量 CPU |
| **効率（既定）** | `models/turbo/` | deepdml/faster-whisper-large-v3-turbo-ct2 | **高精度を効率化・JA** |
| 精度 | `models/medium/` | Systran/faster-whisper-medium | 従来バランス |
| 最高精度 | `models/large-v3/` | Systran/faster-whisper-large-v3 | 任意・重い |

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium
# 任意
# git clone --depth 1 https://huggingface.co/Systran/faster-whisper-large-v3 src/Whisper/models/large-v3
```

- **distil-*** は英語寄りのため日本語本線では不採用
- 推論: CPU `int8` + `language=ja` + `vad_filter=True`（`AITRANSCRIBE_DEVICE` 等で上書き可）
- 既定 UI は turbo。未配置なら small 等に切替

## エアギャップ配置

```
src/Whisper/
  ffmpeg.exe / python.exe / Lib/ ...
  Faster-Whisper.py
  models/{small,turbo,medium,large-v3}/
```

不足時はネット取得せずエラー。

## 開発・ビルド

```bash
npm ci
npm start
npm run build_win
```

## セキュリティ

`contextIsolation` / `nodeIntegration: false` / `sandbox: true` / `shell: false` spawn

## Actions

| Workflow | 内容 |
| --- | --- |
| regenerate-lock | lock 再生成 |
| fullbuild | `npm ci` + small/medium/**turbo** |
| partialbuild | モデル除外寄り |

## ロードマップ

| Phase | 状態 |
| --- | --- |
| 0–3 | **完了** |
| 4 モデル効率化（turbo・VAD・catalog） | **完了寄り** |
| 5 配布・ライセンス・fuses | 予定 |
