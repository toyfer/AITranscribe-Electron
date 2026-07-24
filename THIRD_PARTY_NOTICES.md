# Third-Party Notices — AITranscribe-Electron

この文書は、本ソフトウェアの配布・利用時に関係し得るサードパーティ成果物の案内です。
**アプリ本体（本リポジトリの MIT コード）と、実行時に利用側が配置するランタイムは別物**です。

---

## 1. 本リポジトリに含まれるもの（MIT）

| コンポーネント | ライセンス | 備考 |
|----------------|------------|------|
| AITranscribe-Electron アプリソース | [MIT](./LICENSE) | `src/**`, 設定ファイル等 |
| Electron（ビルド成果物に同梱されるランタイム） | [Electron LICENSE](https://github.com/electron/electron/blob/main/LICENSE) 等 | Chromium / Node を含む複合。公式のライセンス表記に従う |
| npm 開発依存（electron-builder 等） | 各パッケージの LICENSE | ビルド時のみ。配布 zip の実行に必須ではない |

アプリの著作権表示: Copyright (c) 2023-2026 toyfer（MIT）。

---

## 2. Git に含めず・利用側が配置するもの（重要）

エアギャップ方針のため、以下は **リポジトリにも公式配布 zip の必須同梱にも含めません**。
オンライン機で入手し、ライセンスを確認したうえで `src/Whisper/`（または成果物内の同等パス）へ配置してください。

### 2.1 FFmpeg（`ffmpeg.exe`）

| 項目 | 内容 |
|------|------|
| 役割 | 音声を 16 kHz WAV へ変換 |
| 同梱 | **しない**（ライセンス・再配布方針のため） |
| 入手例 | 公式ビルドや LGPL ビルドなど、利用条件を満たすバイナリ |
| 参考 | https://ffmpeg.org/legal.html |

**利用組織の責任で**、LGPL / GPL のどのビルドかを確認し、必要ならソース提供義務・表示義務に従ってください。
CI の fullbuild が FFmpeg をダウンロードするのは **オンライン組み立て用**であり、エアギャップ現場への「公式同梱」を意味しません。

### 2.2 Python Embeddable

| 項目 | 内容 |
|------|------|
| 役割 | Faster-Whisper を動かす埋め込み Python |
| 同梱 | **しない** |
| 推奨ピン | Python 3.11.4 Windows embeddable amd64 |
| 入手 | https://www.python.org/downloads/ |
| ライセンス | PSF License（Python 公式の表記に従う） |

### 2.3 pip パッケージ（`requirements-whisper.txt`）

| 項目 | 内容 |
|------|------|
| 主パッケージ | `faster-whisper==1.2.1` およびその依存（ctranslate2, onnxruntime, av 等） |
| 同梱 | **しない**（Embeddable 上に `pip install -r` した結果を媒体で運ぶ） |
| faster-whisper | MIT — https://github.com/SYSTRAN/faster-whisper |
| その他 | 各 PyPI パッケージの LICENSE を参照 |

### 2.4 音声認識モデル（weights）

| UI / ディレクトリ | 取得元例 | ライセンス目安 |
|-------------------|----------|----------------|
| `models/small` | Systran/faster-whisper-small | モデルカード記載（多くは MIT 系の変換物。**必ず各ページを確認**） |
| `models/turbo` | deepdml/faster-whisper-large-v3-turbo-ct2 | 同上 |
| `models/medium` | Systran/faster-whisper-medium | 同上 |
| `models/large-v3` | Systran/faster-whisper-large-v3 | 同上 |

元となった OpenAI Whisper 系モデルの利用条件・禁止用途も、上流のモデルカードと OpenAI の利用規約を確認してください。
詳細な配置手順: [docs/models.md](./docs/models.md)

---

## 3. UI 等で利用しているフロント資産

| 資産 | 場所 | 備考 |
|------|------|------|
| Bootstrap（CSS/JS） | `src/css/`, `src/js/` | バンドル済み。Bootstrap のライセンス表記に従う |

---

## 4. 配布時の推奨同梱物（アプリ zip 側）

| ファイル | 目的 |
|----------|------|
| `LICENSE` | アプリ本体 MIT |
| `THIRD_PARTY_NOTICES.md` | 本ファイル |
| `docs/models.md` / `docs/distribution.md` | 運用 |
| `requirements-whisper.txt` | オフライン pip 再現 |

**Whisper 一式（ffmpeg / python / models）は別媒体・別チェックサムで渡す**運用を推奨します。

---

## 5. 免責

本 NOTICE は便宜上の案内であり、法律助言ではありません。再配布・商用利用の前に、各コンポーネントの正式なライセンス文を確認してください。
