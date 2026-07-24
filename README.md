[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)
[![Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16 kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

**ライセンス（アプリ本体）:** [MIT](./LICENSE) — Copyright (c) 2023-2026 toyfer  
**サードパーティ・非同梱ランタイム:** [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)  
**配布手順:** [docs/distribution.md](./docs/distribution.md)  
**モデル選定:** [docs/models.md](./docs/models.md)

## ピン留め（v2.4.0）

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | + electronFuses |
| アプリ version | **2.4.0** | |
| faster-whisper | **1.2.1** | |
| モデル（**UI 既定**） | **large-v3-turbo** | 精度重視 |
| モデル（速度） | **small** | 速度重視 |

```bash
npm ci
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

## モデル（UI 2択）

| UI | dir | 取得元 |
| --- | --- | --- |
| 速度重視 | `models/small/` | Systran/faster-whisper-small |
| **精度重視（デフォルト）** | `models/turbo/` | deepdml/faster-whisper-large-v3-turbo-ct2 |

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
```

- 推論: CPU `int8` + `language=ja` + `vad_filter=True`

## エアギャップ配置

```
src/Whisper/
  ffmpeg.exe / python.exe / Lib/ ...
  Faster-Whisper.py
  models/{small,turbo}/
```

## 開発・ビルド

```bash
npm ci
npm start
npm run build_win
```

## リリース

タグ `v*` を push すると fullbuild が走り、成功時に **GitHub Release の Assets** へ Windows zip が添付されます。

## セキュリティ

`contextIsolation` / `sandbox` / `nodeIntegration: false` / `shell: false` spawn / Electron fuses（配布ビルド）  
詳細: [SECURITY.md](./SECURITY.md)

## ロードマップ

Phase 0–5 完了。以降は実機フィードバックと依存の定期更新。
