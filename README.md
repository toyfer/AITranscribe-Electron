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
- FFmpeg
    - FFmpeg.exe(音声変換)
- css
    - bootstrap5.0.2
- js
    - bootstrap5.0.2
- index.html(GUI表示)
- main.js(メインプロセス処理)
- renderer.js(レンダラプロセス処理)
- preload.js(メインプロセスとレンダラプロセス間のIPC通信に係る初期定義)

## 使用方法
使用するには、Whisper及びFFmpeg.exeを指定のディレクトリに配置する必要があります。  
また、ローカル環境で実行する場合は、Whisperのモデル・Python Embeddableをあらかじめダウンロードしておく必要があります。
- FFmpeg = src/FFmpeg/FFmpeg.exe
- Whisper = src/Whisper/AITranscribe.py
- Python Embeddable = src/Whisper/Python Embeddable.zipの中身
- model = src/Whisper/model/xxx.pt
なお、pipの整備とwhisperのインポートが必要です。

## GitHubActions
- Electronプロジェクトのビルド
- FFmpeg.exeのダウンロード
- Python Embeddableのダウンロード
を行います。なお、Windows環境を利用します。
