# AITranscribe

## 概要
OpenAIのWhisperを活用して文字起こしを行うためのソフトウェアです。

## ビルド手順

## ディレクトリ構造
- css
    - bootstrap5.0.2のCSS
- js
    - bootstrap5.0.2のjs
- index.html
    - メインのページ
- main.js
    - メインプロセスの処理内容
- renderer.js
    - レンダラプロセスの処理内容
- preload.js
    - IPC通信に初期定義を策定

## 使い方
利用するには、Whisper及びFFmpegを指定のディレクトリに配置する必要があります。  
また、ローカル環境で実行する場合は、Whisperのモデルをあらかじめダウンロードしておく必要があります。
- FFmpeg = FFmpeg/FFmpeg.exe
- Whisper = Whisper/AiTranscribe.py