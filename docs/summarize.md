# 要約機能

文字起こし結果の **CSV** を読み込んで LLM で要約し、**Word (.docx)** として出力する機能です。
エアギャップ環境で動作し、外部 API は使いません。

> **重要**: 要約機能に必要な **llama-cli.exe と GGUF は GitHub Release zip に含まれません**（2GB 制限のため）。**GitHub Actions の fullbuild artifact には全入りで含まれます**（容量無制限）。詳細は [`docs/models.md`](./models.md) の「**2. llama.cpp**」「**3. GGUF モデル**」を参照。

---

## 処理フロー

```text
Whisper 出力 CSV
  └─ SummarizeJob.start (src/main/jobs/summarize.js)
       ├─ CSV を読み込み
       ├─ プロンプトを生成 (種別ごと)
       ├─ llama-cli を spawn
       │   args: -m model.gguf -p prompt -n 1024 -c 4096 --temp 0.4 -no-cnv
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

```text
src/Whisper/
  llama-cli.exe    # llama.cpp ビルド済みバイナリ
  models/llm/
    qwen3.5-0.8b-q4_k_m.gguf  # 推奨: Qwen3.5-0.8B-GGUF (Q4_K_M)
```

### 取得元（詳細）

| ファイル | 取得元 | サイズ |
|----------|--------|------|
| `llama-cli.exe` | https://github.com/ggml-org/llama.cpp/releases (b10069+ の `llama-b{VERSION}-bin-win-cpu-x64.zip`) | ~17MB |
| `qwen3.5-0.8b-q4_k_m.gguf` | https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF | ~530MB |

### 取得コマンド例

```powershell
# llama-cli
Invoke-WebRequest -Uri https://github.com/ggml-org/llama.cpp/releases/download/b10069/llama-b10069-bin-win-cpu-x64.zip -Outfile llama.zip
Expand-Archive .\llama.zip -DestinationPath .\llama
Copy-Item -Path .\llama\llama-cli.exe -Destination .\src\Whisper\llama-cli.exe

# GGUF (HF CLI)
hf download unsloth/Qwen3.5-0.8B-GGUF --include "Qwen3.5-0.8B-Q4_K_M.gguf" --local-dir src/Whisper/models/llm
Move-Item src/Whisper/models/llm/Qwen3.5-0.8B-Q4_K_M.gguf src/Whisper/models/llm/qwen3.5-0.8b-q4_k_m.gguf
```

詳細は [`docs/models.md`](./models.md) を参照。

これらが無い状態で「要約を実行」を押すと、メインプロセスが明確なエラーメッセージを返します。
**文字起こし本体には影響しない** — llama-cli / GGUF が見つからない場合のみ警告を出して無視します。

## モデル選択（pickModel）

複数の GGUF を `models/llm/` に配置した場合、`summarize.js` の `pickModel` が以下の優先順位で自動選択します。UI からのモデル選択は現在未対応です。

| スコア | 条件（ファイル名の小文字比較） | 備考 |
|--------|--------------------------------|------|
| 4（最優先） | `qwen3.5-0.8b` を含む | v0.1.0 推奨モデル |
| 3 | `qwen3.5` を含む | Qwen3.5 シリーズ |
| 2 | `qwen3` を含む | Qwen3 シリーズ |
| 1 | その他 | 汎用フォールバック |

同点の場合はファイルサイズが小さい方を優先します。`ggufPaths` が1つの場合はスコアリング不要でそのまま使用します。

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
2. 要約サポーターウィンドウを開く（文字起こしウィンドウのヘッダーから遷移）
3. **CSV 選択** をクリック
4. 種別（箇条書き / 議事録 / 要約）を選ぶ
5. パラメータ（ctx size / max tokens / temperature）を必要に応じて調整
6. **要約を実行** をクリック
7. 保存ダイアログで .docx の出力先を指定
8. 完了通知が出る（「要約が完了しました」）
9. ログエリアで進行状況が見える

## アーキテクチャ

要約機能は文字起こしウィンドウとは独立した **BrowserWindow** として実装されています。
`WindowManager` (`src/main/window-manager.js`) が per-window の IPC ルーティングを管理し、
文字起こしウィンドウと要約ウィンドウ間で IPC メッセージが相互に漏れないように分離しています。

### thinking block の除去

Qwen3 モデルは応答前に thinking block を出力します。
`summarize.js` はストリーミング中と最終出力の両方でこれらのブロックを除去し、
docx には純粋な要約テキストのみを出力します。

### タイムアウト

llama-cli の実行には 600秒（10分）のタイムアウトを設定しています。
長時間音声の CSV でも推論が完了するよう配慮した値です。

## 制限事項

- **llama-cli.exe と GGUF は Release zip には含まれず手動配置** — `docs/models.md` 参照
  - fullbuild artifact (容量無制限) には含まれる
- **NPM `docx` パッケージが必要** — `npm install` で導入（package.json の dependencies に含む）
- **CPU 推論のみ** — GPU 対応は未実装
- **UI からの GGUF モデル選択は未対応** — `pickModel` が名称スコアリングで自動選択（複数配置時は最優先のものを使用）
- **llama-cli の会話モードは無効化** (`-no-cnv` フラグ) — 単一プロンプト後に即座に終了

## ファイル

| パス | 内容 |
|------|------|
| `src/main/jobs/summarize.js` | 要約ジョブ本体 |
| `src/main/window-manager.js` | 要約ウィンドウ管理・IPC ルーティング |
| `src/shared/channels.js` | SUMMARY_* チャネル定義 |
| `src/preload.js` | electronAPI.openCsv / saveDocx / runSummarize / processSummary / returnSummary |
| `src/main/runtime.js` | llama-cli / GGUF パス解決・検証 |
| `src/main.js` | IPC ハンドラと handleDocxSave |
| `src/Summarize-Suppoter/Summarize-Suppoter.html` | 要約サポーター UI |
| `src/Summarize-Suppoter/Summarize-Suppoter.js` | 要約サポーターコントローラー |
| [`docs/models.md`](./models.md) | 取得元・配置手順 |
| [`docs/distribution.md`](./distribution.md) | 配布・組み立て全体像 |

## 今後の拡張案

- モデル選択を UI で切替可能に（複数 GGUF 配置時）
- GPU 対応（llama.cpp の CUDA ビルドに切替）
- ストリーミング表示（llama-cli の token-by-token 出力）
- カスタムプロンプトの編集機能
