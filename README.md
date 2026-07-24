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

## ピン留め方針（Phase 3–5）

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS |
| Electron | **43.2.0** | Chromium 150 / Node 24.18 |
| electron-builder | **26.15.7** | 26.x + **electronFuses** |
| アプリ version | **2.3.0** | Phase 5 |
| faster-whisper | **1.2.1** | |
| モデル（**UI 既定**） | **turbo** | large-v3 級を効率化 |

```bash
npm ci
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

### package-lock 再生成

[Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)  
（Settings → Actions → Workflow permissions で **Read and write** が必要）

## モデル（Phase 4）

UI は `renderer.js` の **`MODEL_CATALOG`** が単一ソース。詳細は [docs/models.md](./docs/models.md)。

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
# 任意: large-v3
```

- **distil-*** は英語寄りのため日本語本線では不採用
- 推論: CPU `int8` + `language=ja` + `vad_filter=True`

## エアギャップ配置

```
src/Whisper/
  ffmpeg.exe / python.exe / Lib/ ...
  Faster-Whisper.py
  models/{small,turbo,medium,large-v3}/
```

不足時はネット取得せずエラー。搬入チェックリストは [docs/distribution.md](./docs/distribution.md)。

## 開発・ビルド

```bash
npm ci
npm start          # 開発（fuses は未適用）
npm run build_win  # 配布 zip（fuses 適用）
```

- **`asar: false`** — Whisper ランタイムを後載せしやすい
- 成果物に `LICENSE` / `THIRD_PARTY_NOTICES.md` / `docs/**` を含める

## セキュリティ

| 層 | 内容 |
| --- | --- |
| Renderer | `contextIsolation` / `sandbox` / `nodeIntegration: false` |
| 子プロセス | `shell: false` + 引数配列 |
| 配布バイナリ | **Electron fuses**（`runAsNode` / inspect / `NODE_OPTIONS` 無効など） |
| 方針 | [SECURITY.md](./SECURITY.md) |

## Actions

| Workflow | 内容 |
| --- | --- |
| regenerate-lock | lock 再生成 |
| fullbuild | **オンライン組み立て用**フル（`npm ci` + モデル等） |
| partialbuild | モデル除外寄り |

fullbuild ≠ そのまま現場のライセンス完了品。役割分担は [docs/distribution.md](./docs/distribution.md)。

## ロードマップ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0 | Critical・エアギャップ仕様 | **完了** |
| 1 | バージョンピン留め | **完了** |
| 2 | リファクタ | **完了** |
| 3 | Electron 43 / Node 24 | **完了** |
| 4 | turbo・VAD・MODEL_CATALOG | **完了** |
| 5 | 配布文書・NOTICE・fuses | **完了** |

## 今後の任意課題

1. 実機で turbo / medium / large-v3 の体感時間・精度を記録
2. コード署名（組織の証明書）
3. SBOM 生成（cyclonedx 等）を CI に追加
4. 残骸ブランチの整理（`archive/copilot-era-main` と `work` は保持推奨）
