# AITranscribe-Electron アーキテクチャ概要

このドキュメントでは、AITranscribe-Electronのアーキテクチャの設計思想と技術的な詳細を説明します。

## アーキテクチャ概要

AITranscribe-Electronは、Electronフレームワークを基盤とした音声文字起こしアプリケーションです。マルチプロセスアーキテクチャを採用し、セキュリティと安定性を重視した設計となっています。

```mermaid
graph TB
    subgraph "Electronアプリケーション"
        subgraph "メインプロセス"
            M1[main.js<br/>アプリケーション制御]
            M2[ファイル選択処理]
            M3[処理パイプライン実行]
            M4[外部プロセス管理]
        end
        
        subgraph "レンダラプロセス"
            R1[index.html<br/>UI表示]
            R2[renderer.js<br/>ユーザー操作処理]
            R3[Bootstrap CSS/JS<br/>UIコンポーネント]
        end
        
        subgraph "IPC通信"
            I1[preload.js<br/>セキュアブリッジ]
        end
    end
    
    subgraph "外部ツール"
        E1[FFmpeg.exe<br/>音声変換]
        E2[Python.exe<br/>Whisper実行環境]
        E3[Faster-Whisper.py<br/>AI推論スクリプト]
        E4[Whisperモデル<br/>Small/Medium]
    end
    
    R2 <--> I1
    I1 <--> M1
    M3 --> E1
    M3 --> E2
    E2 --> E3
    E3 --> E4
    
    style M1 fill:#e8f5e8
    style R1 fill:#f3e5f5
    style I1 fill:#fff3e0
    style E1 fill:#e3f2fd
    style E2 fill:#e3f2fd
    style E3 fill:#e3f2fd
    style E4 fill:#e3f2fd
```

## 技術スタック

### フロントエンド技術
- **Electron**: デスクトップアプリケーションフレームワーク
- **HTML5**: マークアップ
- **JavaScript (ES6+)**: フロントエンド動的処理
- **Bootstrap 5.3.0**: UIコンポーネントライブラリ
- **CSS3**: スタイリング

### バックエンド技術
- **Node.js**: JavaScript実行環境
- **Electron Main Process**: アプリケーション制御
- **Child Process**: 外部プロセス実行
- **File System**: ファイル操作

### 外部ツール・AI技術
- **FFmpeg**: 音声フォーマット変換
- **Python 3.11.4**: AI推論実行環境
- **Faster-Whisper**: OpenAI Whisper最適化版
- **Whisper Models**: Small/Mediumモデル

## プロセス設計

### メインプロセス (main.js)

```mermaid
classDiagram
    class MainProcess {
        +createWindow()
        +handleFileOpen()
        +runFFmpeg(args)
        +runWhisper(args)
        +runAdjustment(args)
        +getNow(pathFlag)
        +generateRandomString(length)
    }
    
    class IPCHandlers {
        +dialog:openFile
        +execute:runFFmpeg
        +execute:runWhisper
    }
    
    class ProcessSpawner {
        +spawn(command, args, options)
        +stdout.on(data)
        +stderr.on(data)
        +on(close, code)
    }
    
    MainProcess --> IPCHandlers
    MainProcess --> ProcessSpawner
```

#### 主要責務
1. **アプリケーションライフサイクル管理**
2. **ウィンドウ作成・管理**
3. **IPC通信ハンドリング**
4. **外部プロセス実行・監視**
5. **ファイルシステム操作**
6. **エラーハンドリング**

### レンダラプロセス (renderer.js)

```mermaid
classDiagram
    class RendererProcess {
        +fileSelectButton
        +filePathElement
        +selectModelElement
        +outputTextareaElement
        +runFFmpeg
        +startProgress(duration)
        +endProgress(intervalId)
        +convertSecondsToHMS(seconds)
    }
    
    class UIComponents {
        +FileSelector
        +ModelSelector
        +ProgressBar
        +OutputConsole
        +ExecuteButton
    }
    
    class AudioHandler {
        +Audio()
        +loadedmetadata
        +duration
    }
    
    RendererProcess --> UIComponents
    RendererProcess --> AudioHandler
```

#### 主要責務
1. **ユーザーインターフェース管理**
2. **ユーザー操作ハンドリング**
3. **進捗表示・更新**
4. **結果表示**
5. **エラー表示**

### IPC通信設計 (preload.js)

```mermaid
graph LR
    subgraph "Renderer Context"
        R[renderer.js]
    end
    
    subgraph "Preload Script"
        P[preload.js<br/>contextBridge]
    end
    
    subgraph "Main Context"
        M[main.js]
    end
    
    R -->|electronAPI.openFile()| P
    R -->|electronAPI.runFFmpeg()| P
    R -->|electronAPI.returnCommand()| P
    R -->|electronAPI.processMassage()| P
    
    P -->|ipcRenderer.invoke()| M
    P -->|ipcRenderer.send()| M
    P <-->|ipcRenderer.on()| M
    
    style P fill:#fff3e0
```

#### セキュリティ設計
- **Context Isolation**: レンダラプロセスからの直接Node.js APIアクセス禁止
- **Limited API Surface**: 必要最小限のAPIのみ公開
- **Type Safety**: 明確なインターフェース定義

## データフロー設計

### ファイル処理パイプライン

```mermaid
graph TD
    subgraph "入力段階"
        A[ユーザー選択<br/>音声ファイル] --> B[ファイル検証]
        C[モデル選択<br/>速度/精度] --> D[パラメータ設定]
    end
    
    subgraph "前処理段階"
        B --> E[FFmpeg実行]
        E --> F[WAV変換<br/>16kHz, モノラル]
        F --> G[一時ファイル保存]
    end
    
    subgraph "AI処理段階"
        D --> H[Whisperモデル読み込み]
        G --> I[Faster-Whisper実行]
        H --> I
        I --> J[音声認識処理]
        J --> K[CSV形式出力]
    end
    
    subgraph "後処理段階"
        K --> L[結果検証]
        L --> M[タイムスタンプ付加]
        M --> N[最終ファイル出力]
        N --> O[一時ファイル削除]
    end
    
    style A fill:#e3f2fd
    style N fill:#ffebee
```

### 状態管理

```mermaid
stateDiagram-v2
    [*] --> Idle: アプリ起動
    Idle --> FileSelected: ファイル選択
    FileSelected --> ModelSelected: モデル選択
    ModelSelected --> Processing: 実行開始
    
    Processing --> FFmpegRunning: FFmpeg開始
    FFmpegRunning --> WhisperRunning: FFmpeg完了
    WhisperRunning --> Adjusting: Whisper完了
    Adjusting --> Completed: 調整完了
    
    FFmpegRunning --> Error: FFmpegエラー
    WhisperRunning --> Error: Whisperエラー
    Adjusting --> Error: 調整エラー
    
    Completed --> Idle: リセット
    Error --> Idle: リセット
```

## エラーハンドリング設計

### エラー分類と対応

```mermaid
graph TD
    A[エラー発生] --> B{エラー種別}
    
    B -->|ファイルエラー| C[ファイル関連]
    B -->|プロセスエラー| D[外部プロセス関連]
    B -->|システムエラー| E[システム関連]
    
    C --> C1[ファイル不存在]
    C --> C2[ファイル権限エラー]
    C --> C3[ファイル形式エラー]
    
    D --> D1[FFmpegエラー]
    D --> D2[Pythonエラー]
    D --> D3[Whisperエラー]
    
    E --> E1[メモリ不足]
    E --> E2[ディスク容量不足]
    E --> E3[権限エラー]
    
    C1 --> F[ユーザー通知]
    C2 --> F
    C3 --> F
    D1 --> G[ログ出力 + 通知]
    D2 --> G
    D3 --> G
    E1 --> H[システム確認要請]
    E2 --> H
    E3 --> H
    
    F --> I[UI復旧]
    G --> I
    H --> I
```

## パフォーマンス最適化

### メモリ管理

```mermaid
graph LR
    subgraph "メインプロセス"
        M1[アプリケーション制御<br/>~50MB]
        M2[ファイルバッファ<br/>~音声ファイルサイズ]
    end
    
    subgraph "レンダラプロセス"
        R1[UI描画<br/>~30MB]
        R2[音声プレビュー<br/>~音声ファイルサイズ]
    end
    
    subgraph "外部プロセス"
        E1[FFmpeg<br/>~100MB]
        E2[Python + Whisper<br/>~500MB-2GB]
    end
    
    style E2 fill:#ffcdd2
```

### 処理時間最適化

1. **非同期処理**: メインスレッドブロッキング回避
2. **プログレス表示**: ユーザー体験向上
3. **一時ファイル管理**: ディスク使用量最小化
4. **モデル選択**: 速度/精度トレードオフ

## セキュリティ設計

### 実装済みセキュリティ機能

```mermaid
graph TD
    A[セキュリティ対策] --> B[Context Isolation]
    A --> C[Content Security Policy]
    A --> D[Limited IPC API]
    A --> E[File System Sandboxing]
    
    B --> B1[Node.js API直接アクセス禁止]
    C --> C1[XSS攻撃防止]
    D --> D1[最小権限原則]
    E --> E1[ファイルアクセス制限]
    
    style A fill:#e8f5e8
    style B1 fill:#fff3e0
    style C1 fill:#fff3e0
    style D1 fill:#fff3e0
    style E1 fill:#fff3e0
```

### CSPポリシー
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
```

## 拡張性設計

### プラグインアーキテクチャ候補

```mermaid
graph TB
    subgraph "コア機能"
        C1[ファイル処理エンジン]
        C2[UI管理エンジン]
        C3[プロセス管理エンジン]
    end
    
    subgraph "拡張可能領域"
        E1[音声変換プラグイン<br/>FFmpeg → others]
        E2[AI推論プラグイン<br/>Whisper → others]
        E3[出力フォーマットプラグイン<br/>CSV → SRT/VTT]
        E4[UI テーマプラグイン<br/>Bootstrap → custom]
    end
    
    C1 --> E1
    C1 --> E3
    C2 --> E4
    C3 --> E2
    
    style E1 fill:#e1f5fe
    style E2 fill:#e1f5fe
    style E3 fill:#e1f5fe
    style E4 fill:#e1f5fe
```

## 依存関係管理

### 外部依存関係

```mermaid
graph TD
    A[AITranscribe-Electron] --> B[Electron]
    A --> C[Bootstrap]
    A --> D[FFmpeg]
    A --> E[Python 3.11.4]
    A --> F[Faster-Whisper]
    A --> G[Whisper Models]
    
    B --> B1[Node.js]
    B --> B2[Chromium]
    E --> F
    F --> G
    
    style A fill:#e8f5e8
    style B fill:#e3f2fd
    style C fill:#e3f2fd
    style D fill:#fff3e0
    style E fill:#fff3e0
    style F fill:#fff3e0
    style G fill:#fff3e0
```

### バージョン管理戦略

| コンポーネント | 現在版 | 更新戦略 |
|---------------|--------|----------|
| Electron | Latest | 定期更新（セキュリティ重視） |
| Bootstrap | 5.3.0 | 安定版追従 |
| FFmpeg | Bundled | 機能要求時更新 |
| Python | 3.11.4 | LTS版使用 |
| Faster-Whisper | Latest | 性能改善時更新 |

---

*このドキュメントは、AITranscribe-Electronの技術的詳細とアーキテクチャ設計を包括的に説明しています。開発・保守・拡張の際の参考資料としてご活用ください。*