[![Display Git Log](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml/badge.svg?branch=main)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/git-log.yml)
[![FullBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/fullbuild.yml)
[![PartialBuild AITranscribe-Electron for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/partialbuild.yml)
[![Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml)

# AITranscribe-Electron

## 概要

Faster-Whisper を用いて **オフライン（エアギャップ）** で音声文字起こしを行う Windows 向け Electron アプリです。

- 実行時に **インターネットへアクセスしません**（モデル・Python・FFmpeg はすべてローカル配置）
- 音声は FFmpeg で 16kHz WAV に変換したあと、埋め込み Python 上の Faster-Whisper で文字起こしし、CSV を出力します

## ピン留め方針（Phase 3）

再現性のためバージョンを固定します。Electron / Node はサポート対象 major へ更新済みです。

| コンポーネント | 固定バージョン | 備考 |
| --- | --- | --- |
| Node.js（開発 / CI） | **24.18.0**（`engines`: `>=24 <25`） | Active LTS（〜2028-04） |
| Electron | **43.2.0** | Chromium 150 / Node 24.18（公式サポート major） |
| electron-builder | **26.15.7** | 26.x 最新。27.x は Node >=22.12 + breaking のため見送り |
| @electron/asar | **3.2.18** | |
| Python Embeddable | **3.11.4** amd64 | Phase 4 で再評価 |
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

### package-lock.json の再生成（GitHub Actions）

Phase 3 後や `package.json` のピン変更後は、専用 workflow で lock を作り直せます。

1. **Settings → Actions → General → Workflow permissions**  
   → **Read and write permissions** を有効化（初回のみ・push に必要）
2. [Actions → Regenerate package-lock.json](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) → **Run workflow**
3. 完了すると main に `chore: regenerate package-lock.json for Node 24 / Electron 43` が push される

- 入力 `target_branch`（既定: `main`）/ `force_regenerate`（既定: true）
- Node **24.18.0** 上で `npm install --package-lock-only` のみ（ビルドはしない）

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

```
src/
  main.js                 # メインプロセス（薄い配線）
  main/
    runtime.js            # RuntimeLayout（パス・preflight）
    jobs/transcribe.js    # TranscribeJob（FFmpeg→Whisper→CSV）
    utils/                # time / fs-temp
  shared/channels.js      # IPC 名の単一ソース
  preload.js
  renderer.js             # UIController
  progressbar.js
  index.html
  Whisper/                # オフラインランタイム配置場所
  Transcribe-Suppoter/    # CSV 突き合わせ補助 UI
requirements-whisper.txt
```

## ローカル開発

```bash
npm install
# Whisper 配下に ffmpeg / Embeddable / models を配置してから
npm start
```

Node.js **24 LTS** を推奨します（`engines`: `>=24 <25`）。

## ビルド（Windows）

```bash
npm run build_win
```

`asar: false` のため、成果物側でも `Whisper` に同じレイアウトでランタイムを置けます。

## セキュリティ（Electron）

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- preload + `contextBridge` のみで API を公開
- 子プロセスは `shell: false` + 引数配列（インジェクション回避）

## GitHub Actions

| Workflow | 内容 |
| --- | --- |
| [regenerate-lock](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/regenerate-lock.yml) | **package-lock.json を Node 24 で再生成して main に push**（手動） |
| fullbuild | ピン済み Node 24 / pip / Systran モデルでフル組み立て（要ネット） |
| partialbuild | モデル除外寄りの部分ビルド |

現場（エアギャップ）では **成果物 + 事前構築した Whisper 一式** を媒体で持ち込みます。

## 出力

入力音声と同じディレクトリに、タイムスタンプ付き CSV を出力します。

## ロードマップ

| Phase | 内容 | 状態 |
| --- | --- | --- |
| 0 | Critical バグ修正・エアギャップ仕様明文化 | **完了** |
| 1 | バージョンピン留め（凍結） | **完了** |
| 2 | リファクタ（channels / Job / Runtime / UI / Supporter） | **完了** |
| 3 | Electron 43 / Node 24 セキュリティ更新 | **完了** |
| 4 | Python / faster-whisper の計画的更新 | 予定 |
| 5 | 配布・ライセンス文書・fuses | 予定 |

## 今後の課題

1. LICENSE / サードパーティ通知（FFmpeg 非同梱の案内）
2. Electron fuses（node CLI 無効など）
3. lock 反映後、fullbuild / partialbuild を `npm ci` に切替
4. Phase 4: faster-whisper / pip lock / Python パッチ版の再評価
