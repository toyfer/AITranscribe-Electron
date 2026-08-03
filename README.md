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

### v0.1.0（文字起こし専用）について

**このリリースでは要約機能（LLM / Word 出力）は使いません。**  
文字起こしだけを確実に動かすことを優先した正式リリースです。要約は後続バージョンで再投入します（コードはリポジトリ内に残していますが、UI からは非表示です）。

**ライセンス（アプリ本体）:** [MIT](./LICENSE) — Copyright (c) 2023-2026 toyfer  
**サードパーティ・非同梱ランタイム:** [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)  
**配布手順:** [docs/distribution.md](./docs/distribution.md)  
**モデル選定:** [docs/models.md](./docs/models.md)

## ピン留め（v0.1.0・文字起こし専用）

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | + electronFuses |
| アプリ version | **0.1.0** | package.json 固定・gitタグで管理 |
| faster-whisper | **1.2.1** | |
| モデル（**UI 既定**） | **large-v3-turbo** | 精度重視 |
| モデル（速度） | **small** | 速度重視 |
| 要約（LLM） | **本リリースでは未提供** | 後続リリースで再有効化予定 |

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

### 推奨: GitHub Actions から一発

1. [FullBuild workflow](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml) を開く
2. **Run workflow** をクリック
3. Branch: `main`
4. **tag**: `v0.1.0`（空にするとビルドのみ・Release なし）
5. **ref**: 空で OK（main の先頭を使う）。特定コミットにしたいときだけ SHA を入れる
6. 成功すると:
   - タグ `v0.1.0` が作成される
   - GitHub Release に zip が添付される
   - Artifacts に full（モデル込み）も残る

> **なぜ Actions 内でタグを切るか**  
> `GITHUB_TOKEN` が push したタグは別の workflow を起動しません。  
> そのため **同じ run の中で** タグ作成 → ビルド → Release 添付まで完結させています。

### 従来: ローカルからタグ push

```bash
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

タグ push でも fullbuild が走り、成功時に Release へ zip が付きます。

### 成果物

- **Release zip**: アプリ + FFmpeg + Python（Whisper モデルなし・2GB 制限対応）
- **full artifact**: 上記 + small/turbo モデル込み（Actions、90 日）

## セキュリティ

`contextIsolation` / `sandbox` / `nodeIntegration: false` / `shell: false` spawn / Electron fuses（配布ビルド）  
詳細: [SECURITY.md](./SECURITY.md)

## ロードマップ

| リリース | 内容 |
| --- | --- |
| **v0.1.0（本リリース）** | 文字起こしを確実に使える正式版 |
| 後続 | 要約（llama-cli + GGUF → docx）の再有効化・品質向上 |
| 以降 | 実機フィードバックと依存の定期更新 |
