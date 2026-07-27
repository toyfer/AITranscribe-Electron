# 要約機能（試験実装）

文字起こし結果の **CSV** を読み込んで LLM で要約し、**Word (.docx)** として出力する機能です。
エアギャップ環境で動作し、外部 API は使いません。

## 処理フロー

```
Whisper 出力 CSV
  └─ SummarizeJob.start (src/main/jobs/summarize.js)
       ├─ CSV を読み込み
       ├─ プロンプトを生成 (種別ごと)
       ├─ llama-cli を spawn
       │   args: -m model.gguf -p prompt -n 1024 -c 32768 --temp 0.4
       └─ 出力を docx npm パッケージで Word 化
              └─ <CSV>_summary.docx として保存
```

## 要約種別

| 種別 | 用途 | プロンプト方針 |
|------|------|----------------|
| 箇条書き（デフォルト） | 全体把握 | 見出し+1行で簡潔に |
| 議事録 | 会議 | 議題ごとに「- 結論」「- 次のアクション」 |
| 要約 | 短文作成 | 200字程度 |

## 必要なランタイム（手動配置）

```
src/Whisper/
  llama-cli.exe    # llama.cpp ビルド済みバイナリ
  models/llm/
    qwen3-0.6b-q4_k_m.gguf  # 例: Qwen3-0.6B-GGUF
```

- **llama-cli**: https://github.com/ggerganov/llama.cpp/releases
- **GGUF**: https://huggingface.co/Qwen/Qwen3-0.6B-GGUF

これらが無い状態で「要約を実行」を押すと、メインプロセスが明確なエラーメッセージを返します。
**文字起こし本体には影響しない** — llama-cli / GGUF が見つからない場合のみ警告を出して無視します。

## IPC チャネル

| チャネル | 方向 | 内容 |
|----------|------|------|
| `dialog:openCsv` | renderer→main (invoke) | CSV 選択ダイアログ |
| `dialog:saveDocx` | renderer→main (invoke) | docx 保存先ダイアログ |
| `execute:runSummarize` | renderer→main (send) | 要約開始 |
| `return:Summary` | main→renderer (send) | llama-cli ログ (生) |
| `process:Summary` | main→renderer (send) | 構造化進捗 (phase/label) |

## UI 操作

1. 文字起こしを実行し、CSV が出力される
2. 「要約」カードで **CSV 選択** をクリック
3. 種別（箇条書き / 議事録 / 要約）を選ぶ
4. **要約を実行** をクリック
5. 保存ダイアログで .docx の出力先を指定
6. 完了通知が出る（「要約が完了しました」）
7. ログカードで「要約ログ」タブを選ぶと進行状況が見える

## 制限事項（試験実装）

- **llama-cli.exe と GGUF は手動配置必須** — エアギャップのため
- **zip 配布には含めない** — 2GB 制限を超えるため
- **NPM `docx` パッケージが必要** — `npm install docx` を実行
- **ctx サイズは 32768 固定** — 1時間音声の CSV（~12k tokens）に対応
- **トークン数は 1024 固定** — 種別ごとに調整可能だが試験実装では未対応
- **CPU 推論のみ** — GPU 対応は未実装

## ファイル

| パス | 内容 |
|------|------|
| `src/main/jobs/summarize.js` | 要約ジョブ本体 |
| `src/shared/channels.js` | SUMMARY_* チャネル追加 |
| `src/preload.js` | electronAPI.openCsv / saveDocx / runSummarize / processSummary / returnSummary |
| `src/main/runtime.js` | llama-cli / GGUF パス追加 |
| `src/main.js` | IPC ハンドラと `handleDocxSave` |
| `src/renderer.js` | CSV 選択 / 保存 / 実行 / ログタブ |
| `src/index.html` | 要約カードとログタブ UI |
| `docs/models.md` | GGUF/llama-cli 配置手順 |

## 今後の拡張案

- モデル選択を UI で切替可能に（複数 GGUF 配置時）
- GPU 対応（llama.cpp の CUDA ビルドに切替）
- ストリーミング表示（llama-cli の token-by-token 出力）
- カスタムプロンプトの編集機能
