[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PertialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

## エアギャップ運用の前提（重要）

このリポジトリの Git には **ランタイム本体を含めません**。

| コンポーネント | Git に含むか | 理由 / 配置場所 |
| --- | --- | --- |
| Electron アプリ本体（`src/*.js` 等） | 含む | アプリロジック |
| `Faster-Whisper.py` | 含む | 推論エントリポイント |
| **FFmpeg (`ffmpeg.exe`)** | **含めない** | ライセンス（LGPL 等）都合で同梱しない。利用側で配置 |
| **Python Embeddable** | **含めない** | 公式 embeddable を展開して配置 |
| **Faster-Whisper モデル** | **含めない**（`.gitkeep` のみ） | サイズ大。オンライン環境で取得したキャッシュ／変換済みモデルをコピー |
| `faster-whisper` 等 pip パッケージ | 含めない | Embeddable 上に事前インストール |

### 実行時に必要な配置（`src/Whisper/` 配下）

```
src/Whisper/
  ffmpeg.exe                 # 手動配置（ライセンス確認のうえ入手）
  python.exe                 # Python Embeddable 展開物
  python311.dll 他           # Embeddable 一式
  Lib/ / Scripts/ 等         # pip 導入後のサイトパッケージ（faster-whisper 含む）
  Faster-Whisper.py          # リポジトリ同梱
  models/
    small/                   # CTranslate2 形式のローカルモデル一式
    medium/
```

アプリは起動時に `ffmpeg.exe` / `python.exe` の有無を確認し、実行時に選択モデルディレクトリの有無を確認します。**不足時はネットから取得せずエラーにします**（エアギャップ前提）。

### モデルについて（Faster-Whisper / キャッシュ）

- Faster-Whisper は Hugging Face 等から取得したモデルをローカルに置けます
- オンラインマシンで一度ダウンロード（または HF キャッシュを利用）し、**変換済みモデルディレクトリを `models/small` `models/medium` にコピー**する運用を想定しています
- コードはモデルパスを **ローカルディレクトリとして** `WhisperModel(models_path, ...)` に渡します。実行環境がオフラインでも、パスが揃っていれば動作します
- GitHub Actions の fullbuild は「配布用にオンラインで揃える」用であり、**エアギャップ実行そのものは Actions に依存しません**

### FFmpeg について

- **リポジトリ・標準配布 zip に FFmpeg を同梱しません**（ライセンス方針）
- 利用組織のライセンス判断に従い、別途入手した `ffmpeg.exe` を `src/Whisper/ffmpeg.exe` に置いてください
- Actions の fullbuild はビルド作業用に一時ダウンロードしますが、それは CI 上の話です

### Python Embeddable について

- システム Python は使いません
- [Python Embeddable](https://www.python.org/downloads/windows/)（例: 3.11.4 amd64）を `src/Whisper/` に展開し、`python.exe` がそこに存在する状態にします
- `python311._pth` で `import site` を有効化し、`pip` で `faster-whisper` を **オンライン環境で先に** 入れてから、フォルダごとエアギャップ機へ持っていく運用を想定しています

## ディレクトリ構造（アプリ）

- `src/main.js` … メインプロセス（FFmpeg / Python 起動、一時ファイル）
- `src/preload.js` … IPC ブリッジ
- `src/renderer.js` / `progressbar.js` / `index.html` … UI
- `src/Whisper/` … オフラインランタイム配置場所（上記）
- `src/Transcribe-Suppoter/` … CSV と音声を突き合わせる補助 UI

## ローカル開発（オンライン可のマシン）

```bash
npm install
# Whisper 配下に ffmpeg.exe / Embeddable / models を配置してから
npm start
```

## ビルド（Windows）

```bash
npm run build_win
```

`asar: false` のため、ビルド成果物側でも `Whisper` 配下へランタイムを同じレイアウトで置けます。

## GitHub Actions

| Workflow | 内容 |
| --- | --- |
| fullbuild | FFmpeg・Embeddable・モデルを CI 上で取得してフルビルド（配布物作成用・要ネット） |
| partialbuild | モデル除外寄りの部分ビルド |

エアギャップ現場では **成果物 + 事前に用意した Whisper ランタイム一式** を媒体で持ち込みます。

## 出力

入力音声と同じディレクトリに、タイムスタンプ付き CSV を出力します。

## 今後の課題

1. Transcribe-Supporter の機能向上
2. LICENSE / サードパーティ通知の整理（FFmpeg・モデル・Python は同梱しない方針の明文化）
3. Electron / 依存バージョンの固定とオフライン npm キャッシュ手順
