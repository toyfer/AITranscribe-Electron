# Third-Party Notices — AITranscribe-Electron

この文書は、本ソフトウェアの配布・利用時に関係し得るサードパーティ成果物の案内です。
**アプリ本体（本リポジトリの MIT コード）と、実行時に利用側が配置するランタイムは別物**です。

> **重要**: GitHub Release の **zip には Whisper モデル・llama-cli・GGUF を含めません**（2GB 制限のため）。**GitHub Actions の fullbuild artifact には全入りで含まれます**（容量無制限）。詳細は [`docs/models.md`](./docs/models.md) を参照。

---

## 1. 本リポジトリに含まれるもの（MIT）

| コンポーネント | ライセンス | 備考 |
|----------------|------------|------|
| AITranscribe-Electron アプリソース | [MIT](./LICENSE) | `src/**`, 設定ファイル等 |
| Electron（ビルド成果物に同梱されるランタイム） | [Electron LICENSE](https://github.com/electron/electron/blob/main/LICENSE) 等 | Chromium / Node を含む複合。公式のライセンス表記に従う |
| npm 開発依存（electron-builder 等） | 各パッケージの LICENSE | ビルド時のみ。配布 zip の実行に必須ではない |
| `docx` (npm、要約機能を使う場合) | MIT — https://github.com/dolanmiu/docx | 実行時に必要 |

アプリの著作権表示: Copyright (c) 2023-2026 toyfer（MIT）。

---

## 2. GitHub Release zip に含めず・利用側が配置するもの（重要）

GitHub Release の zip は 2GB 制限のため、以下は**含めません**。
ただし、fullbuild workflow の **artifact には全入りで含まれます**（容量無制限）。開発者・CI 検証用にはそちらを、ユーザー配布は zip + 手動配置を選んでください。

### 2.1 FFmpeg（`ffmpeg.exe`）

| 項目 | 内容 |
|------|------|
| 役割 | 音声を 16 kHz WAV へ変換 |
| Release zip 含有 | **する** (CI で取得して同梱) |
| 入手例 | 公式ビルドや LGPL ビルドなど、利用条件を満たすバイナリ |
| 参考 | https://ffmpeg.org/legal.html |

**利用組織の責任で**、LGPL / GPL のどのビルドかを確認し、必要ならソース提供義務・表示義務に従ってください。

### 2.2 Python Embeddable

| 項目 | 内容 |
|------|------|
| 役割 | Faster-Whisper を動かす埋め込み Python |
| Release zip 含有 | **する** (CI で取得して同梱) |
| 推奨ピン | Python 3.11.4 Windows embeddable amd64 |
| 入手 | https://www.python.org/downloads/ |
| ライセンス | PSF License（Python 公式の表記に従う） |

### 2.3 pip パッケージ（`requirements-whisper.txt`）

| 項目 | 内容 |
|------|------|
| 主パッケージ | `faster-whisper==1.2.1` およびその依存（ctranslate2, onnxruntime, av 等） |
| Release zip 含有 | **する** (CI で Embeddable 上に `pip install -r` した結果を同梱) |
| faster-whisper | MIT — https://github.com/SYSTRAN/faster-whisper |
| その他 | 各 PyPI パッケージの LICENSE を参照 |

### 2.4 音声認識モデル（weights）— UI v2.4.0

| UI / ディレクトリ | 取得元例 | ライセンス目安 | Release zip | artifact |
|-------------------|----------|----------------|--------------|----------|
| 速度重視 `models/small` | https://huggingface.co/Systran/faster-whisper-small | MIT | **なし** (2GB 超過) | **あり** (容量無制限) |
| 精度重視・既定 `models/turbo` | https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 | MIT (CT2 変換済み) | **なし** (2GB 超過) | **あり** |

元となった OpenAI Whisper 系モデルの利用条件も、上流のモデルカードと OpenAI の利用規約を確認してください。

詳細・取得方法・SHA-256 検証: [docs/models.md](./docs/models.md)

### 2.5 llama.cpp（`llama-cli.exe`）— 要約機能を使う場合のみ

| 項目 | 内容 |
|------|------|
| 役割 | GGUF モデルのランタイム（CPU 推論） |
| Release zip 含有 | **なし** (2GB 制限のため) |
| artifact 含有 | **あり** (容量無制限) |
| 取得元 | https://github.com/ggml-org/llama.cpp/releases |
| 推奨ファイル | `llama-b{VERSION}-bin-win-cpu-x64.zip` |
| ライセンス | **MIT License** — https://github.com/ggml-org/llama.cpp/blob/master/LICENSE |
| 検証 | GitHub Releases の sha256sum.txt で SHA-256 を確認 |

### 2.6 GGUF モデル（要約機能を使う場合のみ）

| モデル | 取得元 | ライセンス | Release zip | artifact |
|--------|--------|------|--------------|----------|
| Qwen3-0.6B-GGUF (q4_k_m 量子化) | https://huggingface.co/Qwen/Qwen3-0.6B-GGUF | Apache 2.0 | **なし** (2GB 超過) | **あり** |
| 代替: Qwen3-1.7B-GGUF | https://huggingface.co/Qwen/Qwen3-1.7B-GGUF | Apache 2.0 | なし | あり |
| 代替: Qwen3-4B-GGUF | https://huggingface.co/Qwen/Qwen3-4B-GGUF | Apache 2.0 | なし | あり |

Qwen3 のベースモデル（[QwenLM/Qwen3](https://huggingface.co/QwenLM/Qwen3)）も Apache 2.0。

詳細・配置方法: [docs/models.md](./docs/models.md) の「**3. GGUF モデル**」

---

## 3. UI 等で利用しているフロント資産

| 資産 | 場所 | 備考 |
|------|------|------|
| Bootstrap（CSS/JS） | `src/css/`, `src/js/` | バンドル済み。Bootstrap のライセンス表記に従う |

---

## 4. 配布時の推奨同梱物（Release zip 側）

| ファイル | 目的 |
|----------|------|
| `LICENSE` | アプリ本体 MIT |
| `THIRD_PARTY_NOTICES.md` | 本ファイル |
| `docs/models.md` | モデル・llama-cli・GGUF の取得・配置手順 |
| `docs/distribution.md` | 配布・組み立て全体像 |
| `docs/summarize.md` | 要約機能のアーキテクチャ |
| `requirements-whisper.txt` | オフライン pip 再現 |

モデル・llama-cli・GGUF は **含めない** ため、ユーザーは `docs/models.md` を参照して手動取得する。  
fullbuild artifact (`AITranscribe-Electron-full`) にはこれら全入りなので、開発者・CI 検証用にはそちらを使う。

---

## 5. 免責

本 NOTICE は便宜上の案内であり、法律助言ではありません。再配布・商用利用の前に、各コンポーネントの正式なライセンス文を確認してください。
