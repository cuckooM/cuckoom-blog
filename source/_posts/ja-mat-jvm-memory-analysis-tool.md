---
title: JVMヒープメモリ分析ツール——MAT使用ガイド
date: 2026-05-25 15:00:00
lang: ja
categories:
  - Java
  - パフォーマンス最適化
  - JVM
tags:
  - JVM
  - メモリ分析
  - MAT
  - パフォーマンス調整
---

# JVMヒープメモリ分析ツール——MAT使用ガイド

## はじめに

Javaアプリケーションの開発と運用において、メモリリークとメモリオーバーフロー問題は一般的なパフォーマンスボトルネックです。これらの問題を迅速に特定するために、専門的なメモリ分析ツールが必要です。MAT（Memory Analyzer Tool）は、オープンソースのJavaヒープメモリ分析ツールとして、開発者がメモリリークを効率的に識別し、メモリ使用状況を分析し、パフォーマンス調整を行うのに役立ちます。

<!-- more -->

## MATツール概要

MAT（Memory Analyzer Tool）はEclipse Foundationが提供する無料ツールで、Javaヒープメモリダンプ（Heap Dump）ファイルの分析に特化しています。メモリリークを迅速に特定し、メモリ使用状況を分析し、詳細なメモリビューを提供します。

### 主な機能
- 大規模ヒープダンプファイルの迅速分析（数GBサイズのファイルをサポート）
- メモリリーク候補オブジェクトの自動検出
- 多様なビューでメモリ使用状況を表示
- 豊富なクエリ言語OQL（Object Query Language）

### 利点
- 分析速度が速い
- 検出精度が高い
- インターフェースが友好的、操作が直感的
- プラグインが豊富、拡張性が高い

## MATツールインストールと設定

### ダウンロードとインストール
1. Eclipse MAT公式サイトで最新版をダウンロード
2. MATは独立インストールパッケージとEclipseプラグインの2種類を提供
3. 独立インストールパッケージの使用を推奨、Eclipseのインストール不要

### システム要件
- Java Runtime Environment 8以上
- 推奨メモリ：ヒープメモリの1.5倍以上をMATに割り当て
- 64ビットOS（大規模ヒープダンプファイル処理に推奨）

### 基本設定
MAT起動時、mat.iniファイルでJVMパラメータを調整：
```
-Xmx8g        # 最大ヒープメモリを設定
-XX:+UseG1GC  # G1ガベージコレクタを使用
```

## ヒープメモリダンプファイルの作成

### トリガ条件
- アプリケーションでOutOfMemoryError発生
- 手動でヒープダンプトリガ
- 定期自動ヒープダンプ作成

### 生成方法

#### 1. JVMパラメータで自動生成
```bash
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/path/to/dumps/ \
     -jar your-application.jar
```

#### 2. jmapコマンドで手動作成
```bash
# JavaプロセスIDを取得
jps -l

# ヒープダンプファイルを作成
jmap -dump:format=b,file=heap.hprof <pid>

# GCルートパスを含むヒープダンプ
jmap -dump:live,format=b,file=heap.hprof <pid>
```

#### 3. jcmdコマンドを使用
```bash
# 全Javaプロセスをリスト
jcmd

# ヒープダンプを作成
jcmd <pid> GC.run_finalization
jcmd <pid> VM.class_hierarchy
jcmd <pid> GC.dump /path/to/heap.hprof
```

## MAT核心ビュー詳解

### 1. Histogram（ヒストグラム）
各クラスのインスタンス数と占有メモリサイズを表示し、メモリ占有率の高いオブジェクトを迅速識別できます。

---

## 参考資料

- [Eclipse MAT Official Site](https://eclipse.dev/mat/)