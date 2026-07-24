# Security Policy

## Supported versions

セキュリティ修正の対象は、原則として **GitHub `main` 先端** および、明示的にタグ付けしたリリースです。

| 系統 | サポート |
|------|----------|
| main（Phase 3+ : Electron 43 / Node 24） | はい |
| 旧 Copilot 時代の main（`archive/copilot-era-main`） | いいえ |
| Electron 37 固定の古い成果物 | いいえ（更新を推奨） |

## 想定脅威モデル（要約）

- **信頼境界**: ローカルユーザーが選んだ音声ファイルと、事前配置した Whisper ランタイム。
- **意図的にやらないこと**: 実行時のモデル自動ダウンロード、任意 URL の読み込み、`shell: true` でのコマンド組み立て。
- **配布バイナリ**: Electron fuses で Node CLI / `ELECTRON_RUN_AS_NODE` 等を制限（`package.json` の `electronFuses`）。

## 報告

脆弱性を発見した場合:

1. **公開 Issue に詳細な再現 PoC をいきなり載せない**でください（特に RCE になり得るもの）。
2. リポジトリオーナー（[toyfer](https://github.com/toyfer)）へ GitHub のプライベート連絡手段、またはアカウントに紐づく連絡先で報告してください。
3. 可能なら: 影響バージョン、OS、再現手順、想定される影響範囲。

修正後、必要に応じて SECURITY アドバイザリまたはリリースノートで周知します。

## 依存関係

- npm: `package-lock.json` を正とし、`npm audit fix` の自動適用はしない（意図した PR / regenerate-lock）。
- Python: `requirements-whisper.txt` のピン。更新はオンライン機で検証してから媒体へ。
