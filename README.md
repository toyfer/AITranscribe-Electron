[![Build Electron Project for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/build.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/build.yml)
# AITranscribe

## 概要
OpenAIのWhisperを活用して文字起こしを行うためのソフトウェアです。

## ビルド手順

## ディレクトリ構造
- Whisper
    - model
        - base.pt(速度重視)
        - small.pt(精度重視)
    - Python Embeddable(Python環境)
    - Whisper.py(Whisper)
    - Faster-Whisper.py(Faster-Whisper)
    - FFmpeg.exe(音声変換)
- Transcribe-Suppoter
    - Suppoter.html
    - Suppoter.js
- css
    - bootstrap5.3.0
- js
    - bootstrap5.3.0
- index.html(GUI表示)
- main.js(メインプロセス処理)
- renderer.js(レンダラプロセス処理)
- preload.js(メインプロセスとレンダラプロセス間のIPC通信に係る初期定義)

## 使用方法
使用するには、Whisper及びFFmpeg.exeを指定のディレクトリに配置する必要があります。  
また、ローカル環境で実行する場合は、Whisperのモデル・Python Embeddableをあらかじめダウンロードしておく必要があります。
- FFmpeg = src/Whisper/FFmpeg.exe
- Whisper = src/Whisper/Whisper.py
- Python Embeddable = src/Whisper/Python Embeddable.zipの中身
- model = src/Whisper/models/xxx.pt
- small,medium = src/Whisper/models/small,medium Faster
なお、pipの整備とwhisperのインポートが必要です。

## GitHubActions
1. FFmpeg.exeのダウンロード
2. Python Embeddableのダウンロード
3. pipのインストール
4. Whisperのインストール
5. Whisperモデルのダウンロード
6. Electronプロジェクトのビルド
を行います。なお、buildに当たってはWindows環境を利用します。

## 今後の課題
1. bootstrapのバージョンを引き上げる
2. Transcribe-Suppoterの機能を向上する
3. Whisperの高速化を図る(faster-whisperの利用など)
4. LICENSEファイルを整備する

## バージョン番号の整理方法
![image](https://go.dev/doc/modules/images/version-number.png)
| バージョンの段階 | 例 | 開発者へのメッセージ |
| --- | --- | --- |
| 開発中 | 自動的な疑似バージョン番号 `v0.x.x` | このモジュールがまだ開発中であり、不安定であることを示します。このリリースは、後方互換性や安定性を保証しません。 |
| メジャーバージョン | `v1.x.x` | 後方互換性のない、公開APIの変更を示します。このリリースは、以前のメジャーバージョンとの後方互換性を保証しません。
| マイナーバージョン | `vx.4.x` | 後方互換性のある、公開APIの変更を示します。このリリースは後方互換性と安定性を保証します。
| パッチバージョン | `vx.x.1` | モジュールの公開APIや依存関係に影響を与えない変更を示します。このリリースは後方互換性と安定性を保証します。
| プレリリースバージョン | `vx.x.x-beta.2` | アルファ版やベータ版のような、リリース前のマイルストーンであることを示します。このリリースは安定性を保証しません。