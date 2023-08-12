[![Build Electron Project for Windows](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/build.yml/badge.svg)](https://github.com/toyfer/AITranscribe-Electron/actions/workflows/build.yml)
# AITranscribe

## 概要
OpenAIのWhisperを活用して文字起こしを行うためのソフトウェアです。

## ビルド手順

## ディレクトリ構造
- AITranscribe
    - model
        - base.pt(速度重視)
        - small.pt(精度重視)
    - Python Embeddable(Python環境)
    - AITranscribe.py(Whisper)
    - FFmpeg.exe(音声変換)
- Transcribe-Suppoter
    - Suppoter.html
    - Suppoter.js
- css
    - bootstrap5.0.2(バージョンアップ予定)
- js
    - bootstrap5.0.2(バージョンアップ予定)
- index.html(GUI表示)
- main.js(メインプロセス処理)
- renderer.js(レンダラプロセス処理)
- preload.js(メインプロセスとレンダラプロセス間のIPC通信に係る初期定義)

## 使用方法
使用するには、Whisper及びFFmpeg.exeを指定のディレクトリに配置する必要があります。  
また、ローカル環境で実行する場合は、Whisperのモデル・Python Embeddableをあらかじめダウンロードしておく必要があります。
- FFmpeg = src/AITranscribe/FFmpeg.exe
- Whisper = src/AITranscribe/AITranscribe.py
- Python Embeddable = src/AITranscribe/Python Embeddable.zipの中身
- model = src/AITranscribe/models/xxx.pt
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
