[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)
[![Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16 kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します
- 文字起こし結果の確認用に「文字起こしサポーター」（CSV ビューア）を同梱します

### v0.1.0 系（文字起こし専用）について

**この系列では要約機能（LLM / Word 出力）は使いません。**  
文字起こしだけを確実に動かすことを優先した正式リリースです。要約は後続バージョンで再投入します。

**ライセンス（アプリ本体）:** [MIT](./LICENSE) — Copyright (c) 2023-2026 toyfer  
**サードパーティ・非同梱ランタイム:** [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)  
**配布手順:** [docs/distribution.md](./docs/distribution.md)  
**モデル選定:** [docs/models.md](./docs/models.md)

## ピン留め（v0.1.0 系・文字起こし専用）

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | + electronFuses |
| アプリ version | **0.1.0** | package.json 固定 |
| Release タグ | **v0.1.0-YYYYMMDD** | 日付で毎回ユニーク（削除不要） |
| faster-whisper | **1.2.1** | |
| モデル（**UI 既定**） | **large-v3-turbo** | 精度重視 |
| モデル（速度） | **small** | 速度重視 |
| 要約（LLM） | **未提供** | 後続で再有効化予定 |

```bash
npm ci
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

## モデル（UI 2択）

| UI | dir | 取得元 |
| --- | --- | --- |
| 速度重視 | `models/small/` | Systran/faster-whisper-small |
| **精度重視（デフォルト）** | `models/turbo/` | deepdml/faster-whisper-large-v3-turbo-ct2 |

```powershell
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
```

- 推論: CPU `int8` + `language=ja` + `vad_filter=True`

## エアギャップ配置（文字起こし）

```text
src/Whisper/
  ffmpeg.exe / python.exe / Lib/ ...
  Faster-Whisper.py
  models/{small,turbo}/
```

## 使い方

1. 音声ファイルを選択
2. モデル（速度重視 / 精度重視）を選ぶ
3. **スタート** → CSV が音声ファイルと同じ場所に出力される
4. 必要ならヘッダーの **文字起こしサポーター** で CSV を確認

## 開発・ビルド

```bash
npm ci
npm start
npm run build_win
```

## リリース

### 成果物の役割分担

| 置き場 | 中身 | サイズ目安 |
| --- | --- | --- |
| **GitHub Release Assets** | slim zip（アプリ + FFmpeg + Python・**モデルなし**） | ~500MB |
| **Actions Artifact `AITranscribe-Electron-full`** | slim + small/turbo（完全版） | ~2.5GB（90 日） |

### 推奨: Actions で日付タグ自動

1. [FullBuild](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml) → **Run workflow**
2. Branch: `main`
3. **tag**: **空のまま**（自動で `v0.1.0-20260803` など）
4. 同日に再実行すると `v0.1.0-20260803-2` … と増える（**既存タグを消さなくてよい**）

| tag 入力 | 動作 |
| --- | --- |
| （空） / `auto` | `v0.1.0-YYYYMMDD` を自動作成して Release |
| `none` | ビルドのみ（タグ・Release なし） |
| `v0.1.0-20260803` など | その名前で作成（既にあればエラー） |

成功すると:

- 新しい日付タグ + GitHub Release（slim zip）
- Artifacts に full（モデル込み）と slim

> 古い `v0.1.0` 固定タグは残っていても問題ありません。今後は日付タグを使います。

## セキュリティ

`contextIsolation` / `sandbox` / `nodeIntegration: false` / `shell: false` spawn / Electron fuses（配布ビルド）  
詳細: [SECURITY.md](./SECURITY.md)

## ロードマップ

| リリース | 内容 |
| --- | --- |
| **v0.1.0-YYYYMMDD** | 文字起こしを確実に使える正式版（日付ビルド） |
| 後続 | 要約の再有効化・品質向上 |
| 以降 | 実機フィードバックと依存の定期更新 |
