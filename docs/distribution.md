# 配布・組み立てガイド（Phase 5）

エアギャップ現場向けに、**何をどこで組み立て、何を媒体で運ぶか**を定義します。

---

## 役割分担

| 場所 | やること | やらないこと |
|------|----------|--------------|
| **開発機 / CI（オンライン）** | `npm ci`、Electron ビルド、FFmpeg/Python Embeddable の取得 | モデル / llama-cli / GGUF の取得と zip への同梱 |
| **ユーザー / エアギャップ機** | zip のダウンロード・展開、モデル・llama-cli・GGUF の取得・配置 | ネットからの自動モデル取得（エアギャップ前提） |

アプリは不足コンポーネントがあると**ダウンロードせずエラー**にします。

> **重要**: AITranscribe-Electron の GitHub Release zip には **Whisper モデル・llama-cli・GGUF を含みません**。これらは zip の 2GB 制限を超えるためで、ユーザーが手動で取得・配置します。取得先は [`docs/models.md`](./models.md) を参照。

---

## GitHub Actions

| Workflow | 用途 | 成果物の性格 | サイズ |
|----------|------|----------------|------|
| **regenerate-lock** | `package-lock.json` だけ再生成して push | 依存固定 | 小 |
| **fullbuild** | Node 24 + `npm ci` + FFmpeg/Python 取得 + `build_win` | **モデル抜きフルアプリ** (zip) | ~500MB |
| **partialbuild** | モデル・Embeddable 込み | アプリ本体 (artifact 用) | ~1GB |

### fullbuild とエアギャップの関係

- fullbuild は便利な **オンライン組み立てパイプライン**です
- 成果物 zip は **モデル抜き** で、容量は ~500MB
- ユーザーは zip を展開後、`docs/models.md` を参照して手動でモデルを配置
- 現場配布の推奨形:
  1. **アプリ zip**（Electron 成果物 + LICENSE + THIRD_PARTY_NOTICES + docs）— `releases` からダウンロード
  2. **Whisper モデル** を別途取得（HF から `git clone` or `hf download`）
  3. **llama-cli / GGUF**（要約機能を使う場合のみ）

### 容量まとめ（zip 内訳）

| 項目 | サイズ |
|------|------|
| Electron アプリ本体 | ~150MB |
| FFmpeg | ~80MB |
| Python Embeddable | ~30MB |
| site-packages (faster-whisper + 依存) | ~150MB |
| llama-cli.exe | (~17MB / 試験実装では含めず) |
| Whisper モデル (small) | (~460MB / 含めず) |
| Whisper モデル (turbo) | (~1.5GB / 含めず) |
| GGUF (Qwen3-0.6B Q4_K_M) | (~450MB / 含めず) |

zip 制限 2GB に対し、含める分は約 **500MB** に収まる。

> **GitHub Actions artifact**: 容量無制限（リポジトリの storage quota のみ）なので、必要なら fullbuild を改造してモデル込み artifact を作ることも可能。ただし **Release zip への添付は 2GB 制限** があるため、ユーザーダウンロードを考えると「モデル抜き」が現実的。

---

## オンライン機での推奨フロー（モデル抜き zip 配布）

```text
1. GitHub Releases から zip をダウンロード
2. zip を展開（任意のディレクトリ）
3. src/Whisper/ 配下にモデル・llama-cli・GGUF を取得・配置（docs/models.md）
4. 起動して確認: src/Whisper/llama-cli.exe がある場合のみ要約機能が動く
```

または開発機でゼロから組み立てる場合:

```text
1. git clone / checkout タグ or main
2. npm ci
3. Python Embeddable 3.11.4 を src/Whisper に展開し import site + pip install -r requirements-whisper.txt
4. モデルを models/{small,turbo} に配置（docs/models.md）
5. ライセンス確認のうえ ffmpeg.exe を配置
6. npm run build_win
7. 成果物と Whisper 一式を別々にアーカイブし、チェックサム（SHA-256）を記録
8. 媒体へコピー → エアギャップ機へ
```

既定 UI は **turbo**。未配置モデルは UI で他を選ぶか、配置してから実行。

---

## エアギャップ搬入チェックリスト

### アプリ本体

- [ ] `LICENSE` / `THIRD_PARTY_NOTICES.md` を同梱または参照可能
- [ ] `ffmpeg.exe` が `src/Whisper/` にある（zip 同梱 or 手動配置）
- [ ] `python.exe` + `Lib`（faster-whisper インストール済み）

### Whisper モデル

- [ ] 使うモデル dir が存在する（最低 1 つ。推奨: `turbo`）
- [ ] 取得元: `https://huggingface.co/Systran/faster-whisper-small` or `deepdml/faster-whisper-large-v3-turbo-ct2`
- [ ] SHA-256 検証を実施

### 要約機能（オプション）

- [ ] `llama-cli.exe` が `src/Whisper/` にある
- [ ] `qwen3-0.6b-q4_k_m.gguf` が `src/Whisper/models/llm/` にある
- [ ] 起動時に「要約機能を使うには追加配置が必要」警告が出ない

### 動作確認

- [ ] 起動時メッセージで「ランタイム未配置」が出ない
- [ ] サンプル音声 1 本で CSV が出る
- [ ] オフライン（NIC 無効でも可）で再実行できる
- [ ] 要約機能を有効にした場合、サンプル CSV で .docx が出力される

---

## ビルド成果物の形（Windows）

- ターゲット: **zip**（`electron-builder`）
- **`asar: false`** — Whisper ランタイムを成果物ツリーに後載せしやすい
- バージョン: `package.json` の `version`（**0.1 固定**、git タグで日付管理）

### Electron fuses（ビルド時）

配布バイナリを硬化（開発時の `npm start` には影響しない）:

| Fuse | 設定 | 意図 |
|------|------|------|
| runAsNode | false | `ELECTRON_RUN_AS_NODE` 悪用を防ぐ |
| enableNodeOptionsEnvironmentVariable | false | `NODE_OPTIONS` 注入を防ぐ |
| enableNodeCliInspectArguments | false | `--inspect` 系を無効化 |
| enableCookieEncryption | true | Cookie 暗号化 |
| enableEmbeddedAsarIntegrityValidation | false | **asar:false** のため無効 |
| onlyLoadAppFromAsar | false | **asar:false** のため無効 |
| grantFileProtocolExtraPrivileges | true | ローカル `loadFile` UI 用 |

設定場所: `package.json` → `build.electronFuses`

---

## セキュリティ運用メモ

- Renderer: `contextIsolation` / `sandbox` / `nodeIntegration: false`
- 子プロセス: `shell: false` + 引数配列
- 依存更新: 四半期ごとを目安に、オンラインで lock 更新 → regenerate-lock または PR → 媒体
- 脆弱性報告: [SECURITY.md](../SECURITY.md)

---

## 関連ドキュメント

- [README.md](../README.md) — 概要・ピン表
- [docs/models.md](./models.md) — **モデル・llama-cli・GGUF の取得先・格納方法**
- [docs/summarize.md](./summarize.md) — 要約機能のアーキテクチャ
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) — ライセンス案内
- [requirements-whisper.txt](../requirements-whisper.txt) — pip ピン
