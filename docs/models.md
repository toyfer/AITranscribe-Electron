# Faster-Whisper モデル指針（Phase 4）

エアギャップ・**日本語**・CPU int8 前提の整理。

library: [faster-whisper 1.2.1](https://github.com/SYSTRAN/faster-whisper/releases/tag/v1.2.1)（ピン維持・最新）

## 結論（このアプリ向け）

| UI | ディレクトリ | 推奨取得元（CTranslate2） | 向いている用途 |
|----|--------------|---------------------------|----------------|
| 速度重視 | `models/small` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | 短い音声・弱い PC |
| バランス | `models/medium` | [Systran/faster-whisper-medium](https://huggingface.co/Systran/faster-whisper-medium) | 従来どおりの無難な精度 |
| **効率重視（推奨追加）** | `models/turbo` | [deepdml/faster-whisper-large-v3-turbo-ct2](https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2) | **large 級精度を medium より速く**（日本語 OK） |

### なぜ turbo か

- OpenAI **large-v3-turbo**: large-v3 のデコーダを薄くした公式派生。**多言語（ja 含む）**。
- faster-whisper が alias `turbo` / `large-v3-turbo` として公式サポート
  （例: `mobiuslabsgmbh/faster-whisper-large-v3-turbo`）
- CT2 変換済みの実運用コピー例: **deepdml/...-turbo-ct2**（tags に `ja`、MIT）
- 目安: large-v3 比で **数倍〜最大 ~8x 高速**、パラメータ ~809M（large 1550M より軽い）

### あえて入れないもの

| モデル | 理由 |
|--------|------|
| **distil-***（distil-large-v3 等） | 主に **英語特化**。日本語エアギャップの本線には不向き |
| **large-v3 フル** | 精度は最高だが CPU エアギャップでは重い。必要なら手動で `models/large` を追加可能 |
| tiny / base | 日本語実務では精度不足になりやすい |

## 配置

```
src/Whisper/models/
  small/    # Systran/faster-whisper-small
  medium/   # Systran/faster-whisper-medium
  turbo/    # deepdml/faster-whisper-large-v3-turbo-ct2
```

オンライン機:

```bash
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium
git clone --depth 1 https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2 src/Whisper/models/turbo
```

（`huggingface-cli download` でも可。フォルダ直下に `model.bin` / `config.json` 等が来る形にする）

## 推論設定（アプリ）

- `device=cpu`, `compute_type=int8`（既定）
- 上書き: 環境変数 `AITRANSCRIBE_DEVICE` / `AITRANSCRIBE_COMPUTE`（例: `cuda` + `float16`）
- `language=ja` 固定
- `vad_filter=True`（無音・幻覚対策）

## 参考

- [faster-whisper supported models](https://github.com/SYSTRAN/faster-whisper) `_MODELS`
- [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3)
- Distil は英語向け: [Systran/faster-distil-whisper-large-v3](https://huggingface.co/Systran/faster-distil-whisper-large-v3)（`en` only）
