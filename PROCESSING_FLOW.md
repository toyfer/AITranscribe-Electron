# AITranscribe-Electron 処理フロー図

このドキュメントでは、AITranscribe-Electronアプリケーションの現在の処理フローを視覚化し、詳細に説明します。

## 概要

AITranscribe-Electronは、OpenAIのWhisperを活用した音声文字起こしアプリケーションです。Electronベースのデスクトップアプリケーションとして実装されており、以下の主要コンポーネントで構成されています：

- **フロントエンド（レンダラプロセス）**: ユーザーインターフェース
- **バックエンド（メインプロセス）**: 処理パイプライン実行
- **IPCコミュニケーション**: プロセス間通信
- **外部ツール**: FFmpeg、Faster-Whisper

## 全体処理フロー

```mermaid
graph TD
    A[ユーザー] -->|ファイル選択| B[フロントエンド<br/>renderer.js + index.html]
    A -->|モデル選択| B
    A -->|実行開始| B
    
    B -->|IPC通信| C[プリロード<br/>preload.js]
    C -->|IPC通信| D[メインプロセス<br/>main.js]
    
    D -->|1. 音声変換| E[FFmpeg実行<br/>runFFmpeg()]
    E -->|WAVファイル生成| F[一時WAVファイル<br/>temp.wav]
    
    F -->|2. 文字起こし| G[Whisper実行<br/>runWhisper()]
    G -->|Python実行| H[Faster-Whisper.py]
    H -->|CSVファイル生成| I[一時CSVファイル<br/>temp.wav.csv]
    
    I -->|3. 最終調整| J[最終調整<br/>runAdjustment()]
    J -->|ファイルコピー| K[最終出力ファイル<br/>filename_timestamp.csv]
    
    D -->|進捗・結果通知| C
    C -->|UI更新| B
    B -->|結果表示| A
    
    style A fill:#e1f5fe
    style B fill:#f3e5f5
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style G fill:#fff3e0
    style J fill:#fff3e0
    style K fill:#ffebee
```

## 詳細コンポーネント図

### 1. フロントエンド層

```mermaid
graph LR
    subgraph "フロントエンド (renderer.js + index.html)"
        A1[ファイル選択ボタン] --> A2[ファイルパス表示]
        A3[モデル選択] --> A4[精度設定<br/>速度重視/精度重視]
        A5[実行ボタン] --> A6[進捗バー]
        A7[コンソール出力] --> A8[結果表示]
    end
    
    A2 --> B[音声ファイル読み込み<br/>時間取得]
    A4 --> C[処理時間予測計算]
    A5 --> D[IPC: runFFmpeg]
    
    style A1 fill:#e3f2fd
    style A3 fill:#e3f2fd
    style A5 fill:#e3f2fd
    style A7 fill:#e8f5e8
```

### 2. メインプロセス処理パイプライン

```mermaid
graph TD
    subgraph "メインプロセス (main.js)"
        B1[runFFmpeg] --> B2[FFmpeg実行<br/>音声→WAV変換]
        B2 --> B3[runWhisper] 
        B3 --> B4[Python実行<br/>Faster-Whisper.py]
        B4 --> B5[runAdjustment]
        B5 --> B6[最終ファイル出力]
    end
    
    B2 --> C1[一時WAVファイル<br/>16kHz変換]
    B4 --> C2[一時CSVファイル<br/>文字起こし結果]
    B6 --> C3[最終CSVファイル<br/>タイムスタンプ付き]
    
    style B1 fill:#fff3e0
    style B3 fill:#fff3e0
    style B5 fill:#fff3e0
    style C1 fill:#f1f8e9
    style C2 fill:#f1f8e9
    style C3 fill:#ffebee
```

## データフロー詳細

### 入力データの流れ

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant R as Renderer
    participant P as Preload
    participant M as Main
    participant F as FFmpeg
    participant W as Whisper
    
    U->>R: ファイル選択
    R->>P: openFile()
    P->>M: dialog:openFile
    M-->>P: ファイルパス
    P-->>R: ファイルパス
    R->>R: 音声ファイル読み込み・時間取得
    
    U->>R: モデル選択（速度/精度）
    R->>R: 処理時間予測計算
    
    U->>R: 実行開始
    R->>P: runFFmpeg([filePath, model])
    P->>M: execute:runFFmpeg
    
    M->>F: FFmpeg実行（音声→WAV変換）
    F-->>M: 変換完了
    M->>W: Whisper実行（WAV→CSV変換）
    W-->>M: 文字起こし完了
    M->>M: 最終調整（ファイルコピー）
    
    M-->>P: 進捗・結果通知
    P-->>R: UI更新
    R-->>U: 結果表示
```

### ファイル変換プロセス

```mermaid
graph LR
    subgraph "入力"
        A[音声ファイル<br/>任意フォーマット]
    end
    
    subgraph "FFmpeg処理"
        B[FFmpeg.exe] --> C[16kHz WAV<br/>一時ファイル]
    end
    
    subgraph "Whisper処理"
        D[Faster-Whisper.py] --> E[CSV出力<br/>一時ファイル]
        F[Whisperモデル<br/>small/medium] --> D
    end
    
    subgraph "最終調整"
        G[ファイルコピー] --> H[最終CSVファイル<br/>タイムスタンプ付き]
    end
    
    A --> B
    C --> D
    E --> G
    
    style A fill:#e3f2fd
    style C fill:#f1f8e9
    style E fill:#f1f8e9
    style H fill:#ffebee
```

## モデル選択による処理の違い

### モデル選択分岐

```mermaid
graph TD
    A[ユーザーのモデル選択] --> B{選択値}
    B -->|1: 速度重視| C[Smallモデル<br/>処理時間: 0.7倍]
    B -->|2: 精度重視| D[Mediumモデル<br/>処理時間: 1.3倍]
    
    C --> E[models/small]
    D --> F[models/medium]
    
    E --> G[Faster-Whisper.py実行]
    F --> G
    
    style C fill:#e8f5e8
    style D fill:#fff3e0
```

## エラーハンドリングフロー

```mermaid
graph TD
    A[処理実行] --> B{FFmpeg実行}
    B -->|成功| C{Whisper実行}
    B -->|失敗| D[エラー通知<br/>処理終了]
    
    C -->|成功| E{最終調整}
    C -->|失敗| F[エラー通知<br/>一時ファイル削除]
    
    E -->|成功| G[処理完了通知<br/>一時ファイル削除]
    E -->|失敗| H[エラー通知<br/>一時ファイル削除]
    
    D --> I[UI有効化]
    F --> I
    G --> I
    H --> I
    
    style D fill:#ffcdd2
    style F fill:#ffcdd2
    style H fill:#ffcdd2
    style G fill:#c8e6c9
```

## プロセス間通信 (IPC) 詳細

### IPCチャンネル一覧

| チャンネル名 | 方向 | 用途 |
|-------------|------|------|
| `dialog:openFile` | Renderer → Main | ファイル選択ダイアログ表示 |
| `execute:runFFmpeg` | Renderer → Main | FFmpeg＆Whisper処理実行 |
| `return:Command` | Main → Renderer | 処理の標準出力・進捗情報 |
| `process:Massage` | Main → Renderer | 処理完了・エラー通知 |

### IPC通信フロー

```mermaid
sequenceDiagram
    participant R as Renderer
    participant P as Preload
    participant M as Main
    
    Note over R,M: ファイル選択フェーズ
    R->>P: openFile()
    P->>M: dialog:openFile
    M-->>P: filePath | null
    P-->>R: filePath | null
    
    Note over R,M: 処理実行フェーズ
    R->>P: runFFmpeg([filePath, model])
    P->>M: execute:runFFmpeg
    
    Note over R,M: 進捗報告フェーズ
    loop 処理中
        M-->>P: return:Command (stdout/stderr)
        P-->>R: 進捗情報
    end
    
    Note over R,M: 完了通知フェーズ
    M-->>P: process:Massage (完了/エラー)
    P-->>R: 最終結果
```

## ファイル構成と役割

### コアファイル

```
src/
├── index.html          # メインUI画面
├── renderer.js         # フロントエンド処理
├── main.js            # メインプロセス・処理パイプライン
├── preload.js         # IPC通信ブリッジ
└── Whisper/
    ├── Faster-Whisper.py  # 文字起こしPythonスクリプト
    ├── ffmpeg.exe         # 音声変換ツール
    ├── python.exe         # Python実行環境
    └── models/            # Whisperモデル
        ├── small/         # 速度重視モデル
        └── medium/        # 精度重視モデル
```

### 一時ファイル

```
OS一時ディレクトリ/
├── {random10文字}.wav     # FFmpeg出力（16kHz WAV）
└── {random10文字}.wav.csv # Whisper出力（CSV）
```

### 出力ファイル

```
入力ファイルと同じディレクトリ/
└── {入力ファイル名}_[YYYY-MM-DD_HH-MM-SS].csv
```

## パフォーマンス特性

### 処理時間の目安

| モデル | 精度 | 処理時間係数 | 用途 |
|--------|------|-------------|------|
| Small | 標準 | 0.7倍 | 速度重視・リアルタイム処理 |
| Medium | 高精度 | 1.3倍 | 精度重視・高品質出力 |

### リソース使用量

- **CPU**: 主にWhisper処理で使用（CPU推論）
- **メモリ**: モデルサイズに依存
- **ディスク**: 一時ファイル（WAV + CSV）
- **ネットワーク**: 不要（完全オフライン処理）

## 今後の拡張ポイント

1. **並列処理**: 長時間音声の分割処理
2. **GPU対応**: CUDA/OpenCLサポート
3. **リアルタイム処理**: ストリーミング文字起こし
4. **多言語対応**: 言語選択UI追加
5. **出力形式**: SRT、VTT等の字幕ファイル対応

---

*このドキュメントは2025年6月28日時点のバージョン2.1.0に基づいて作成されています。*