# 配布・組み立てガイド（Phase 5）

エアギャップ現場向けに、**何をどこで組み立て、何を媒体で運ぶか**を定義します。

---

## 役割分担

| 場所 | やること | やらないこと |
|------|----------|--------------|
| **開発機 / CI（オンライン）** | `npm ci`、Electron ビルド、FFmpeg/Python Embeddable・Whisper モデル・llama-cli・GGUF の取得 | （特になし。全部入りで OK） |
| **ユーザー / エアギャップ機** | Release zip のダウンロード・展開、起動確認。モデル類は手動配置 | ネットからの自動モデル取得（エアギャップ前提） |

アプリは不足コンポーネントがあると**ダウンロードせずエラー**にします。

> **重要**: AITranscribe-Electron の **GitHub Release zip には Whisper モデル・llama-cli・GGUF を含みません**（2GB 制限のため）。**GitHub Actions の fullbuild artifact には全入り**で含まれます（容量無制限）。詳細は [`docs/models.md`](./models.md) を参照。

---

## GitHub Actions

| Workflow | 用途 | 成果物の性格 | サイズ |
|----------|------|----------------|------|
| **regenerate-lock** | `package-lock.json` だけ再生成して push | 依存固定 | 小 |
| **fullbuild** | Node 24 + `npm ci` + FFmpeg/Python + Whisper モデル + llama-cli + GGUF + `build_win` | **2種類** を出力 | (下表) |

### fullbuild の成果物（2種類）

| 成果物 | 場所 | 含まれるもの | サイズ目安 |
|--------|------|--------------|----------|
| **workflow artifact: `AITranscribe-Electron-full`** | Actions タブ → 該当 run → Artifacts | アプリ + FFmpeg + Python + faster-whisper site-packages + **Whisper モデル (small, turbo) + llama-cli + GGUF** | ~2.5GB (リポジトリ storage quota 内) |
| **workflow artifact + Release zip: `AITranscribe-Electron-v0.1-YYYYMMDD-GITSHORT-x64.zip`** | GitHub Release ページ | アプリ + FFmpeg + Python + site-packages + ドキュメント **のみ**（モデル・llama-cli・GGUF 抜き） | ~500MB (2GB 以下) |

GitHub Actions artifact は **容量無制限**（リポジトリの storage quota のみ）なので、モデル込みで全入り artifact を作れます。一方 GitHub Release zip は **2GB 制限** があるため、モデル抜き zip を別途組み立てて attach します。

### ダウンロード経路の選択

| 目的 | 使うもの |
|------|---------|
| **開発・CI 検証・すぐ動かしたい** | fullbuild artifact (`AITranscribe-Electron-full`) をダウンロード |
| **エンドユーザに配布・エアギャップ搬入** | GitHub Release の zip (`AITranscribe-Electron-v0.1-...-x64.zip`) をダウンロード → 別途モデル手動配置 |

### fullbuild とエアギャップの関係

- fullbuild は便利な **オンライン組み立てパイプライン**です
- **artifact には全入り**で、容量無制限
- ユーザーは Release zip を取得 → `docs/models.md` を参照してモデル手動配置
- 現場配布の推奨形:
  1. **アプリ zip**（Electron 成果物 + LICENSE + THIRD_PARTY_NOTICES + docs）— `releases` からダウンロード
  2. **Whisper モデル** を別途取得（HF から `git clone` or `hf download`）
  3. **llama-cli / GGUF**（要約機能を使う場合のみ）

### 容量まとめ

| 項目 | サイズ |
|------|------|
| Electron アプリ本体 | ~150MB |
| FFmpeg | ~80MB |
| Python Embeddable | ~30MB |
| site-packages (faster-whisper + 依存) | ~150MB |
| llama-cli.exe | ~17MB |
| Whisper モデル (small) | ~460MB |
| Whisper モデル (turbo) | ~1.5GB |
| GGUF (Qwen3-0.6B Q4_K_M) | ~450MB |

| zip 種別 | 合計サイズ |
|----------|----------|
| **Release zip (モデル抜き)** | **~500MB** (2GB 以内) |
| **artifact (全入り)** | **~2.8GB** (容量無制限) |

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
6. llama-cli / GGUF を配置（要約機能を使う場合）
7. npm run build_win
8. 成果物と Whisper 一式を別々にアーカイブし、チェックサム（SHA-256）を記録
9. 媒体へコピー → エアギャップ機へ
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
