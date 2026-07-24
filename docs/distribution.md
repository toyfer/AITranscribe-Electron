# 配布・組み立てガイド（Phase 5）

エアギャップ現場向けに、**何をどこで組み立て、何を媒体で運ぶか**を定義します。

---

## 役割分担

| 場所 | やること | やらないこと |
|------|----------|--------------|
| **開発機 / CI（オンライン）** | `npm ci`、Electron ビルド、（任意）モデル・Embeddable・FFmpeg の取得 | 現場の秘密データを扱わない |
| **エアギャップ機** | 配置済み Whisper 一式で推論のみ | ネットからモデル取得・pip install |

アプリは不足コンポーネントを **ダウンロードせずエラー** にします。

---

## GitHub Actions

| Workflow | 用途 | 成果物の性格 |
|----------|------|----------------|
| **regenerate-lock** | `package-lock.json` だけ再生成して push | 依存固定 |
| **fullbuild** | Node 24 + `npm ci` + FFmpeg/Python/モデル取得 + `build_win` | **オンライン組み立て用フルセット**（検証・初期構築） |
| **partialbuild** | モデルを成果物から除外寄り | アプリ本体中心。モデルは別途 |

### fullbuild とエアギャップの関係

- fullbuild は便利な **オンライン組み立てパイプライン**です。
- その成果物をそのまま「ライセンス確認済みの現場配布物」とみなす必要は **ありません**。
- 現場配布の推奨形:
  1. **アプリ zip**（Electron 成果物 + LICENSE + THIRD_PARTY_NOTICES + docs）
  2. **Whisper ランタイムフォルダ**（ffmpeg / python+site-packages / models/*）を別途ハッシュ付きで

---

## オンライン機での推奨フロー

```text
1. git clone / checkout タグ or main
2. npm ci
3. Python Embeddable 3.11.4 を src/Whisper に展開し import site + pip install -r requirements-whisper.txt
4. モデルを models/{small,turbo,medium[,large-v3]} に配置（docs/models.md）
5. ライセンス確認のうえ ffmpeg.exe を配置
6. npm run build_win
7. 成果物と Whisper 一式を別々にアーカイブし、チェックサム（SHA-256）を記録
8. 媒体へコピー → エアギャップ機へ
```

既定 UI は **turbo**。未配置モデルは UI で他を選ぶか、配置してから実行。

---

## エアギャップ搬入チェックリスト

- [ ] `LICENSE` / `THIRD_PARTY_NOTICES.md` を同梱または参照可能
- [ ] `ffmpeg.exe` が Whisper 配下にある（ライセンス確認済み）
- [ ] `python.exe` + `Lib`（faster-whisper インストール済み）
- [ ] 使うモデル dir が存在する（最低 1 つ。推奨: turbo）
- [ ] 起動時メッセージで「ランタイム未配置」が出ない
- [ ] サンプル音声 1 本で CSV が出る
- [ ] オフライン（NIC 無効でも可）で再実行できる

---

## ビルド成果物の形（Windows）

- ターゲット: **zip**（`electron-builder`）
- **`asar: false`** — Whisper ランタイムを成果物ツリーに後載せしやすい
- バージョン: `package.json` の `version`（Phase 5 時点 **2.3.0**）

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
- [docs/models.md](./models.md) — モデル選定
- [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) — ライセンス案内
- [requirements-whisper.txt](../requirements-whisper.txt) — pip ピン
