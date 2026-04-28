# AITranscribe-Electron 処理フロー図

このドキュメントは、AITranscribe-Electron アプリケーションの実際の処理フローを可視化したものです。

## 1. ユーザー操作フロー（全体像）

```mermaid
flowchart TD
    A[アプリ起動] --> B[音声ファイル選択]
    B --> C{ファイル検証}
    C -->|失敗 | D[エラー表示]
    C -->|成功 | E[WAV変換開始]
    
    E --> F[FFmpegでWAV変換]
    F --> G{変換成功？}
    G -->|失敗 | H[エラー表示＆クリーンアップ]
    G -->|成功 | I[文字起こし開始]
    
    I --> J[Faster-Whisper実行]
    J --> K{文字起こし成功？}
    K -->|失敗 | L[エラー表示＆クリーンアップ]
    K -->|成功 | M[CSV出力]
    
    M --> N[結果表示]
    N --> O[一時ファイル削除]
    O --> P[完了]
```

## 2. システム内部処理フロー（詳細）

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant UI as renderer.js<br/>(GUI)
    participant Preload as preload.js<br/>(IPC)
    participant Main as main.js<br/>(メインプロセス)
    participant FFmpeg as FFmpeg.exe
    participant Python as Python +<br/>Faster-Whisper
    participant FS as ファイルシステム

    User->>UI: 音声ファイルを選択
    UI->>Preload: selectAudioFile()
    Preload->>Main: ipcRenderer.invoke('select-file')
    Main->>FS: showDialog()
    FS-->>Main: filePath
    Main-->>Preload: filePath
    Preload-->>UI: filePath
    UI->>User: "変換開始"ボタン表示

    User->>UI: 変換開始クリック
    UI->>Preload: startTranscription(filePath)
    Preload->>Main: ipcRenderer.invoke('start-transcribe', filePath)
    
    Main->>Main: 一時ディレクトリ作成
    Main->>FFmpeg: 変換コマンド実行
    FFmpeg->>FS: WAVファイル出力
    FS-->>Main: 変換完了
    
    Main->>Main: ログ出力 (log.txt)
    Main->>Python: Faster-Whisper.py 実行
    Python->>Python: 音声分析 & テキスト生成
    Python->>FS: CSVファイル出力
    FS-->>Main: 文字起こし完了
    
    Main->>Main: CSV読み込み & パース
    Main-->>Preload: {segments, text}
    Preload-->>UI: 結果データ
    UI->>User: 結果表示 (表＋テキスト)
    
    Main->>FS: 一時ファイル削除
    Main-->>Preload: 完了通知
    Preload-->>UI: 完了
    UI->>User: "完了"メッセージ表示
```

## 3. データフロー図

```mermaid
flowchart LR
    subgraph Input
        A[音声ファイル<br/>MP3/M4A/WAV等]
    end
    
    subgraph Process1 [前処理]
        B[FFmpeg.exe]
        C[一時WAVファイル]
    end
    
    subgraph Process2 [文字起こし]
        D[Python Embeddable]
        E[Faster-Whisper.py]
        F[Whisperモデル<br/>tiny/small/medium]
    end
    
    subgraph Output
        G[CSVファイル<br/>タイムスタンプ付き]
        H[JSONデータ]
        I[GUI表示]
    end
    
    A -->|入力 | B
    B -->|出力 | C
    C -->|入力 | D
    F -->|使用 | E
    D -->|実行 | E
    E -->|出力 | G
    G -->|読み込み | H
    H -->|表示 | I
```

## 4. エラーハンドリングフロー

```mermaid
flowchart TD
    A[処理開始] --> B{エラー発生？}
    B -->|なし | C[正常終了]
    B -->|あり | D{エラー種別}
    
    D -->|ファイル不存在 | E[「ファイルが見つかりません」]
    D -->|FFmpegエラー | F[「変換に失敗しました」]
    D -->|Pythonエラー | G[「文字起こしに失敗しました」]
    D -->|モデル不存在 | H[「モデルをダウンロード中...」]
    D -->|メモリ不足 | I[「メモリが不足しています」]
    
    E --> J[ログ出力]
    F --> J
    G --> J
    H --> K[自動ダウンロード]
    K --> L[再試行]
    I --> J
    
    J --> M[一時ファイル削除]
    L --> M
    M --> N[エラーダイアログ表示]
    N --> O[処理中止]
    
    C --> P[一時ファイル削除]
    P --> Q[結果表示]
```

## 5. ファイル状態遷移図

```mermaid
stateDiagram-v2
    [*] --> 選択待ち
    選択待ち --> 変換中 : ファイル選択
    変換中 --> WAV完成 : FFmpeg成功
    変換中 --> エラー : FFmpeg失敗
    WAV完成 --> 文字起こし中 : 変換開始
    文字起こし中 --> CSV完成 : Whisper成功
    文字起こし中 --> エラー : Whisper失敗
    CSV完成 --> 結果表示 : データ読み込み
    結果表示 --> クリーン : ファイル削除
    クリーン --> [*]
    エラー --> クリーン : 削除処理
    クリーン --> [*]
```

## フローの主要ポイント

### ✅ 正常系
1. **ファイル選択** → ダイアログ表示 → パス取得
2. **WAV変換** → FFmpeg実行 → 16kHz/monoに変換
3. **文字起こし** → Pythonスクリプト実行 → CSV生成
4. **結果表示** → CSVパース → GUI表示
5. **クリーンアップ** → 一時ファイル削除

### ⚠️ 異常系
- **ファイル不存在**: エラーダイアログ表示
- **FFmpeg失敗**: ログ出力後、エラー表示
- **モデル不存在**: 自動ダウンロード→再試行
- **メモリ不足**: エラー表示後、クリーンアップ

### 🔧 補足
- 全ての一時ファイルは `os.tmpdir()` 配下に作成
- ログファイル `log.txt` は常に最新の状態に更新
- CSV出力後は即座に削除され、ユーザーには見えない

---

*このフロー図は v2.1.0 のコードベースに基づいています。*
