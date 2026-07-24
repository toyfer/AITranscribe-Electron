# Faster-Whisper モデル指針（Phase 4）

エアギャップ・**日本語**・CPU int8 前提。

library: [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper/releases/tag/v1.2.1)（ピン維持）

## 結論（このアプリ向け）

| UI id | ディレクトリ | 推奨取得元（CTranslate2） | 用途 |
|-------|--------------|---------------------------|------|
| small | `models/small` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | 高速・弱い PC |
| **turbo（既定）** | `models/turbo` | [deepdml/faster-whisper-large-v3-turbo-ct2](https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2) | **large 級精度を効率化（JA）** |
| medium | `models/medium` | [Systran/faster-whisper-medium](https://huggingface.co/Systran/faster-whisper-medium) | 従来の無難な精度 |
| large-v3 | `models/large-v3` | [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3) | 最高精度・CPU では遅い（任意） |

UI のラベル・パスは `src/renderer.js` の **`MODEL_CATALOG`** が単一ソース。

### なぜ turbo か（「効率のいい large」）

- OpenAI **large-v3-turbo**: large-v3 のデコーダ層を減らした公式派生。**多言語（ja 含む）**。~809M
- faster-whisper 1.2.1 が `turbo` / `large-v3-turbo` エイリアスを内蔵
  （`mobiuslabsgmbh/faster-whisper-large-v3-turbo` 等）
- 本リポジトリの配置推奨: **deepdml/...-turbo-ct2**（CT2 済み・MIT・ja タグ）
- 目安: large-v3 比で数倍〜最大 ~8x 高速、medium より精度寄りになりやすい

### あえて入れないもの

| モデル | 理由 |
|--------|------|
| **distil-*** | 主に **英語特化**。日本語本線に不向き |
| tiny / base | 日本語実務では精度不足になりやすい |
| 実行時 HF DL | エアギャップ方針に反する |

## 配置

```
src/Whisper/models/
  small/
  turbo/      # 推奨・UI 既定
  medium/
  large-v3/   # 任意
```

オンライン機:

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium
# 任意
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-large-v3 src/Whisper/models/large-v3
```

## 推論設定（アプリ）

- 既定: `device=cpu`, `compute_type=int8`
- 上書き: `AITRANSCRIBE_DEVICE` / `AITRANSCRIBE_COMPUTE`
- `language=ja` 固定
- `vad_filter=True`（無音・幻覚対策）

## 互換

- 既存 small / medium 配置はそのまま使える
- UI 既定は turbo → 未配置なら small 等に切替、または turbo を配置
- fullbuild は small + medium + turbo を clone（large-v3 はサイズのため CI 既定外）

## 参考

- [faster-whisper `_MODELS`](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/utils.py)
- [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3)
- Distil 英語向け: [Systran/faster-distil-whisper-large-v3](https://huggingface.co/Systran/faster-distil-whisper-large-v3)
