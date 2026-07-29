# モデル・ランタイム配置ガイド

**重要**: AITranscribe-Electron の **GitHub Release zip** には Whisper モデル・llama-cli・GGUF は**含まれません**。Release zip の 2GB 制限を超えるためです。

ただし、**fullbuild workflow の artifact には全入り**で同梱されています（GitHub Actions artifact は容量無制限）。開発者・CI 検証用にはそちらを、ローカル開発や手元ですぐ動かしたい場合は docs/models.md の手順で手動配置してください。

**エアギャップ配布時の推奨フロー**:
1. GitHub Releases から **モデル抜き zip** をダウンロード
2. zip を展開
3. 別途モデル・llama-cli・GGUF を取得・配置（`docs/models.md` の手順）
4. 起動

または開発者・CI なら fullbuild artifact の **全入り版** を取得して使用。

このドキュメントは、**取得先・取得方法・配置場所・サイズ・ライセンス・SHA-256 検証**を一覧化した唯一の参照先です。

---

## 1. Whisper モデル (CTranslate2 形式)

### 取得が必要なモデル

| UI | ディレクトリ | 用途 | 推奨度 |
|----|--------------|------|--------|
| **速度重視** | `models/small` | 軽量・速い | 必須（どちらか1つ） |
| **精度重視（デフォルト）** | `models/turbo` | large-v3 級を効率化・JA | 推奨（必須ではない） |

UI ラベル・パスは `src/renderer.js` の **`MODEL_CATALOG`** が単一ソース。`hf` プロパティで取得元 URL を保持。

### 取得元（公式 CTranslate2 変換済み）

| モデル | 取得元 | 形式 | サイズ目安 |
|--------|--------|------|----------|
| small | https://huggingface.co/Systran/faster-whisper-small | CTranslate2 (int8) | ~460MB |
| turbo | https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 | CTranslate2 (int8) | ~1.5GB |

### 取得方法

**Git LFS 経由（推奨・再現性高い）**:

```bash
cd src/Whisper/models
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 turbo
```

**HF CLI 経由**:

```bash
hf download Systran/faster-whisper-small --local-dir src/Whisper/models/small
hf download deepdml/faster-whisper-large-v3-turbo-ct2 --local-dir src/Whisper/models/turbo
```

**curl で直接**:

```bash
# 例: small の主要ファイルだけ
cd src/Whisper/models
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small small
```

> **注意**: turbo は ~1.5GB と大きいので、small のみ配置して十分ならそれで動きます。`MODEL_CATALOG` の `default: true` を切り替えるか、UI で「速度重視」を選べば OK。

### 検証（SHA-256）

各モデルのチェックサムは取得元の HuggingFace カード / API で確認できます:

```bash
# small
curl -s https://huggingface.co/Systran/faster-whisper-small/resolve/main/.gitattributes | head
# turbo (ファイル数が多いので重い)
```

エアギャップ搬入時は、CI か開発機で一度ダウンロードして SHA-256 を記録 → 媒体でコピー → 搬入先で再検証する運用を推奨。

### ライセンス

| モデル | ライセンス |
|--------|------|
| Systran/faster-whisper-small | MIT |
| deepdml/faster-whisper-large-v3-turbo-ct2 | MIT (CT2 変換済み) |

`THIRD_PARTY_NOTICES.md` にも記載。

### 入れないモデル

| モデル | 理由 |
|--------|------|
| medium | UI 簡素化（必要なら手動配置は可能だが UI から削除） |
| large-v3 フル | CPU エアギャップでは重い (~3GB) |
| distil-* | 英語寄り |
| tiny / base | 日本語実務では精度不足になりやすい |

---

## 2. llama.cpp (要約機能を使う場合のみ)

### 取得元

https://github.com/ggml-org/llama.cpp/releases

最新版リリースの **`llama-b{VERSION}-bin-win-cpu-x64.zip`** (CPU) をダウンロード。

| バージョン | サイズ目安 |
|----------|----------|
| b10069+ (2026-07) | ~17MB |

### 取得方法

```powershell
# 例: b10069
Invoke-WebRequest -Uri https://github.com/ggml-org/llama.cpp/releases/download/b10069/llama-b10069-bin-win-cpu-x64.zip -Outfile llama.zip
Expand-Archive .\llama.zip -DestinationPath .\llama
Copy-Item -Path .\llama\llama-cli.exe -Destination .\src\Whisper\llama-cli.exe
```

### 検証

GitHub Releases のチェックサム (SHA256) をダウンロード後に検証:

```powershell
# GitHub UI のリリースページから sha256sum.txt を取得
$sha = (Get-FileHash .\src\Whisper\llama-cli.exe -Algorithm SHA256).Hash
Write-Host "llama-cli.exe SHA-256: $sha"
```

### 配置

```
src/Whisper/llama-cli.exe
```

### ライセンス

llama.cpp: **MIT License**。`THIRD_PARTY_NOTICES.md` にも記載。

---

## 3. GGUF モデル (要約機能を使う場合のみ)

### 取得元

- **Qwen3.5-0.8B Q4_K_M (推奨)**: https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF
  - ファイル: **`Qwen3.5-0.8B-Q4_K_M.gguf`**
  - 取得元 URL: `https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf`
  - サイズ: ~530MB
  - アプリの `pickModel` が最優先（スコア4）で選択
- **Qwen3-0.6B Q4_K_M (代替・軽量)**: https://huggingface.co/unsloth/Qwen3-0.6B-GGUF
  - ファイル: `Qwen3-0.6B-Q4_K_M.gguf`
  - 取得元 URL: `https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf`
  - サイズ: ~500MB
  - `pickModel` スコア2（Qwen3 シリーズ）
- 代替 (より大きいモデル・精度優先):
  - https://huggingface.co/unsloth/Qwen3-1.7B-GGUF
  - https://huggingface.co/unsloth/Qwen3-4B-GGUF

> **注**: `pickModel` はファイル名の小文字比較でスコアリングします。`qwen3.5-0.8b` を含むファイル名が最優先（スコア4）です。複数 GGUF 配置時はスコアとサイズで自動選択されます。詳細は `docs/summarize.md` の「モデル選択（pickModel）」を参照。

### 取得方法

**Q4_K_M (推奨) — Qwen3.5-0.8B**:

```powershell
# HF CLI
hf download unsloth/Qwen3.5-0.8B-GGUF --include "Qwen3.5-0.8B-Q4_K_M.gguf" --local-dir src/Whisper/models/llm
Move-Item src/Whisper/models/llm/Qwen3.5-0.8B-Q4_K_M.gguf src/Whisper/models/llm/qwen3.5-0.8b-q4_k_m.gguf
```

**Q4_K_M (代替) — Qwen3-0.6B**:

```powershell
# HF CLI
hf download unsloth/Qwen3-0.6B-GGUF --include "Qwen3-0.6B-Q4_K_M.gguf" --local-dir src/Whisper/models/llm
Move-Item src/Whisper/models/llm/Qwen3-0.6B-Q4_K_M.gguf src/Whisper/models/llm/qwen3-0.6b-q4_k_m.gguf
```

### サイズ目安

| モデル | サイズ |
|--------|------|
| Qwen3.5-0.8B Q4_K_M (推奨) | ~530MB |
| Qwen3-0.6B Q4_K_M | ~500MB |
| Qwen3-1.7B Q4_K_M | ~1.1GB |
| Qwen3-4B Q4_K_M | ~2.4GB |

0.6B〜0.8B がエアギャップ・CPU で実用的なバランス。1.7B / 4B は精度が上がるがメモリ使用量も増える。

### 検証

HuggingFace カードの Files タブで各ファイルの SHA-256 を確認可能。

### 配置

```
src/Whisper/models/llm/qwen3.5-0.8b-q4_k_m.gguf
```

> **注**: アプリ側 (`pickModel`) は `models/llm/*.gguf` をスキャンし、名称スコアリングで最適なモデルを自動選択します。複数配置時は `qwen3.5-0.8b` を含むファイル名が最優先されます。

### ライセンス

| モデル | ライセンス |
|--------|------|
| Qwen3.5-0.8B (base) | Apache 2.0 |
| Qwen3-0.6B (base) | Apache 2.0 |
| Qwen3 GGUF 変換 | Apache 2.0 (Qwen3 base) |

`THIRD_PARTY_NOTICES.md` にも記載。

---

## 4. 配置場所まとめ

```
src/Whisper/
  ffmpeg.exe                    (zip 同梱 / ライセンス要確認)
  python.exe + Lib/             (zip 同梱)
  llama-cli.exe                  (Release zip には含まれず・fullbuild artifact には含まれる)
  models/
    small/                      (Release zip には含まれず・fullbuild artifact には含まれる)
    turbo/                      (同上)
    llm/
      qwen3.5-0.8b-q4_k_m.gguf   (同上)
```

| 場所 | 含めるもの |
|------|----------|
| **Release zip** (2GB 制限) | アプリ本体 + FFmpeg + Python + site-packages + ドキュメント |
| **fullbuild artifact** (容量無制限) | 上記 + Whisper モデル + llama-cli + GGUF |

---

## 5. 配置の検証

アプリを起動して、以下を確認:

### Whisper モデル確認

```
起動時ログ:
  [HH:MM:SS:System]システムを起動しました

  small 配置済 → 起動成功・「速度重視」が動く
  turbo 配置済 → 「精度重視（デフォルト）」が動く
  両方未配置 → 起動時に「エアギャップ用ランタイム未配置」警告
```

### llama-cli 確認

```
起動時ログ:
  [HH:MM:SS:System]要約機能を使うには追加配置が必要:
  - Whisper/llama-cli.exe (llama.cpp 単一バイナリ・手動配置・要約機能を使う場合に必要)
  - Whisper/models/llm/*.gguf (Qwen3.5-0.8B GGUF Q4_K_M 推奨・手動配置・要約機能を使う場合に必要)
```

両方配置済なら警告なし。どちらか欠けると対応するエラーメッセージのみ。

### ランタイム確認コマンド

```bash
# Linux/macOS
ls -lh src/Whisper/
ls -lh src/Whisper/models/
ls -lh src/Whisper/models/llm/

# Windows PowerShell
Get-ChildItem src/Whisper | Format-Table Name, Length
Get-ChildItem src/Whisper/models
Get-ChildItem src/Whisper/models/llm
```

---

## 6. エアギャップ搬入チェックリスト

### Whisper

- [ ] `ffmpeg.exe` が `src/Whisper/` にある（zip 同梱 or 手動配置）
- [ ] `python.exe` + `Lib/site-packages/` が `src/Whisper/` にある
- [ ] 使うモデルディレクトリが `src/Whisper/models/` に最低 1 つ
  - [ ] 推奨: `small` (Systran) - 速度重視
  - [ ] 推奨: `turbo` (deepdml) - 精度重視
- [ ] `LICENSE` / `THIRD_PARTY_NOTICES.md` を同梱

### 要約機能（オプション）

- [ ] `llama-cli.exe` が `src/Whisper/` にある
- [ ] `qwen3.5-0.8b-q4_k_m.gguf` (または `*.gguf`) が `src/Whisper/models/llm/` にある
  - [ ] 推奨: `Qwen3.5-0.8B-Q4_K_M.gguf` (unsloth ミラー)
  - [ ] 代替: `Qwen3-0.6B-Q4_K_M.gguf` (unsloth ミラー・軽量)
- [ ] 起動時に「要約機能を使うには追加配置が必要」警告が出ない

### 検証

- [ ] 起動時メッセージで「ランタイム未配置」が出ない
- [ ] サンプル音声 1 本で CSV が出る
- [ ] オフライン（NIC 無効でも可）で再実行できる
- [ ] 要約機能を有効にした場合、サンプル CSV で .docx が出力される
