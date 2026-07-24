# Faster-Whisper モデル方針（Phase 4）

エアギャップ・**日本語**前提。実行時ダウンロードはしない。

## なぜ今の small / medium だけだと足りないか

| 従来 | パラメータ目安 | 位置づけ |
|------|----------------|----------|
| small | ~244M | CPU 向け・速いが精度に限界 |
| medium | ~769M | 精度は上がるが重い |

その後、**同じ系統の精度をより少ない計算量で出す**モデルが増えた。

## 採用モデル（アプリ選択肢）

| UI | ローカル dir | Hugging Face（CTranslate2） | ざっくり |
|----|--------------|-----------------------------|----------|
| 高速 | `models/small/` | [Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small) | 従来どおり。軽量 CPU |
| **バランス（推奨）** | `models/turbo/` | [mobiuslabsgmbh/faster-whisper-large-v3-turbo](https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo) | large-v3 由来・デコーダ層削減 ~809M。多言語（JA）。large-v3 より大幅に速い |
| 精度 | `models/medium/` | [Systran/faster-whisper-medium](https://huggingface.co/Systran/faster-whisper-medium) | 従来の精度重視 |
| 最高精度 | `models/large-v3/` | [Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3) | 最良精度帯。CPU int8 では遅い |

faster-whisper 1.2.1 のエイリアス:

```text
large-v3-turbo / turbo → mobiuslabsgmbh/faster-whisper-large-v3-turbo
large / large-v3       → Systran/faster-whisper-large-v3
```

アプリは **ローカルパス** で読むのでエイリアス名は使わない（dir 名で配置）。

## 採用しないもの

| モデル | 理由 |
|--------|------|
| `faster-distil-whisper-*`（.en / distil-large-v3） | 蒸留が英語寄り。JA では不向き・誤認識の報告あり |
| 実行時 HF ダウンロード | エアギャップ方針に反する |

## オンライン機での配置例

```bash
# 推奨セット
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-small src/Whisper/models/small
git clone --depth 1 https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo src/Whisper/models/turbo
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-medium src/Whisper/models/medium

# 任意（重い）
git clone --depth 1 https://huggingface.co/Systran/faster-whisper-large-v3 src/Whisper/models/large-v3
```

各ディレクトリ直下に `model.bin` / `config.json` / `tokenizer.json` 等があること。

## CPU 運用メモ

- `Faster-Whisper.py`: `device="cpu"`, `compute_type="int8"`, `language="ja"`
- turbo は large-v3 よりメモリ・時間が抑えめだが、small よりは重い
- 進捗バーの倍率は目安のみ（実機でずれる）

## 互換

- 既存の `models/small` / `models/medium` 配置はそのまま使える
- UI 既定は **turbo**（未配置なら起動後に選択モデル不足エラー → turbo を置くか small に切替）
