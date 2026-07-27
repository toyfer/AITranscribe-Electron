# Faster-Whisper モデル指針

エアギャップ・**日本語**・CPU int8 前提。

library: [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper/releases/tag/v1.2.1)

## UI の2択（v2.4.0〜）

| UI | ディレクトリ | 推奨取得元（CTranslate2） | 用途 |
|----|--------------|---------------------------|------|
| **速度重視** | `models/small` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | 軽量・速い |
| **精度重視（デフォルト）** | `models/turbo` | [deepdml/faster-whisper-large-v3-turbo-ct2](https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2) | large-v3 級を効率化・JA |

UI ラベル・パスは `src/renderer.js` の **`MODEL_CATALOG`** が単一ソース。

### なぜ turbo が「精度重視」か

- OpenAI **large-v3-turbo**: large-v3 のデコーダを薄くした派生。**多言語（ja 含む）**
- medium / large-v3 フルより扱いやすく、small より精度寄り
- 本リポジトリ配置: **deepdml/...-turbo-ct2**（CT2 済み・MIT）

### 入れないもの

| モデル | 理由 |
|--------|------|
| medium | UI 簡素化（必要なら手動配置は可能だが UI から削除） |
| large-v3 フル | CPU エアギャップでは重い |
| distil-* | 英語寄り |
| tiny / base | 日本語実務では精度不足になりやすい |

## 配置

```
src/Whisper/models/
  small/
  turbo/      # デフォルト
```

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
```

## 推論設定

- 既定: `device=cpu`, `compute_type=int8`
- 上書き: `AITRANSCRIBE_DEVICE` / `AITRANSCRIBE_COMPUTE`
- `language=ja` 固定
- `vad_filter=True`

## 追加モデル（要約機能を使う場合）

`src/Whisper/models/llm/` に GGUF 形式の LLM を配置:

```
src/Whisper/
  llama-cli.exe (Windows) / llama-cli (Unix)
  models/llm/
    qwen3-0.6b-q4_k_m.gguf   # 推奨（日本語対応・CPU 20-40 tok/s）
```

- llama-cli: https://github.com/ggerganov/llama.cpp/releases からビルド済みバイナリ
- GGUF: 例 https://huggingface.co/Qwen/Qwen3-0.6B-GGUF の `qwen3-0.6b-q4_k_m.gguf`

**エアギャップ注意**: zip の 2GB 制限を超えるため、fullbuild では GGUF を含めず手動配置のみ。
partialbuild でも同様。
