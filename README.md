[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

## ピン留め方針（Phase 1）

**メジャー上げは別 Phase。** ここでは再現性のためバージョンを固定します。

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **20.18.1**（`engines`: `>=20 <21`） | Phase 3 で 24 LTS へ |
| Electron | **37.2.3** | Phase 3 でサポート対象 major へ |
| electron-builder | **26.0.12** | Electron 37 と組み合わせ固定 |
| @electron/asar | **3.2.14** | |
| Python Embeddable | **3.11.4** amd64 | |
| faster-whisper | **1.2.1**（`requirements-whisper.txt`） | master tarball 禁止 |
| モデル（取得元） | **Systran/faster-whisper-small** / **medium** | ローカル dir として配置 |

```bash
# オンライン機 — npm（package.json のピンに従う）
npm install

# オンライン機 — Embeddable 上の pip
.\src\Whisper\python.exe -m pip install -r requirements-whisper.txt
```

`package-lock.json` をコミット対象にし、CI / ローカルとも可能な限り lock に従ってください。
`npm audit fix` で lock を勝手に書き換えない運用です（更新は意図した PR で）。

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
  ffmpeg.exe                 # 手動配置（ライセンス確認のうえ入手）
  python.exe                 # Python Embeddable 展開物
  python311.dll 他           # Embeddable 一式
  Lib/ / Scripts/ 等         # pip install -r requirements-whisper.txt 後
  Faster-Whisper.py          # リポジトリ同梱
  models/
    small/                   # Systran/faster-whisper-small 等のローカル一式
    medium/                  # Systran/faster-whisper-medium 等
```

アプリは起動時に `ffmpeg.exe` / `python.exe` の有無を確認し、実行時に選択モデルディレクトリの有無を確認します。**不足時はネットから取得せずエラーにします**。

### モデルについて

- 推奨取得元（CTranslate2 変換済み）:
  - https://huggingface.co/Systran/faster-whisper-small
  - https://huggingface.co/Systran/faster-whisper-medium
- オンライン機で clone / ダウンロードし、`models/small` `models/medium` に配置
- アプリは `WhisperModel(ローカルpath)` のみ。実行環境はオフラインでよい

### FFmpeg について

- **同梱しない**（ライセンス方針）
- `src/Whisper/ffmpeg.exe` に配置
- CI fullbuild のダウンロードは「オンライン組み立て用」のみ

### Python Embeddable について

1. [Python 3.11.4 Embeddable amd64](https://www.python.org/ftp/python/3.11.4/python-3.11.4-embed-amd64.zip) を `src/Whisper/` に展開
2. `python311._pth` で `import site` を有効化
3. `get-pip.py` 後、`python.exe -m pip install -r requirements-whisper.txt`
4. フォルダごとエアギャップ機へコピー

## ディレクトリ構造（アプリ）

- `src/main.js` … メインプロセス
- `src/preload.js` … IPC
- `src/renderer.js` / `progressbar.js` / `index.html` … UI
- `src/Whisper/` … オフラインランタイム配置場所
- `requirements-whisper.txt` … pip ピン
- `src/Transcribe-Suppoter/` … CSV 突き合わせ補助 UI

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

`asar: false` のため、成果物側でも `Whisper` に同じレイアウトでランタイムを置けます。

## GitHub Actions

| Workflow | 内容 |
| --- | --- |
| fullbuild | ピン済み Node / pip / Systran モデルでフル組み立て（要ネット） |
| partialbuild | モデル除外寄りの部分ビルド |

現場（エアギャップ）では **成果物 + 事前構築した Whisper 一式** を媒体で持ち込みます。

## 出力

入力音声と同じディレクトリに、タイムスタンプ付き CSV を出力します。

## ロードマップ（要約）

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0 | Critical バグ修正・エアギャップ仕様明文化 | 完了 |
| 1 | バージョンピン留め（本 README の表） | 本変更 |
| 2 | リファクタ（挙動維持） | 予定 |
| 3 | Electron / Node セキュリティ更新 | 予定 |
| 4 | Python / faster-whisper の計画的更新 | 予定 |
| 5 | 配布・ライセンス文書 | 予定 |

## 今後の課題

1. Transcribe-Supporter の機能向上
2. LICENSE / サードパーティ通知
3. Phase 3 以降の Electron 43 + Node 24 など
