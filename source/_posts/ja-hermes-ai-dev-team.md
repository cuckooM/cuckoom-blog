---
title: HermesでAI開発チームを構築する
date: 2026-06-03 10:00:00
lang: ja
tags:
  - AI
  - Hermes
  - 開発チーム
  - 自動化
categories:
  - 技術実践
---

AI技術の発展により、多くの開発作業をAIが支援できるようになりました。しかし、単一のAIアシスタントは複雑なプロジェクトのすべての役割を担うことが難しいです。プロダクトマネージャーは要件を理解し、アーキテクトはシステムを設計し、開発エンジニアはコードを書き、QAは品質を検証する必要があります。

HermesのProfileメカニズムを使用して、AIに異なる身分と責任を定義し、完全なAI開発チームを構築できます。この記事では、このシステムを構築し使用する方法を詳しく紹介します。

<!-- more -->

## 核心概念：Profileと役割分離

HermesのProfileは独立した設定単位であり、各Profileには以下があります：

- **SOUL.md** — 役割の身分定義、AIの思考方法と作業範囲を決定
- **skills/** — 専用スキルディレクトリ、その役割のワークフロー知識を含む
- **memories/** — 独立した記憶、異なる役割間で干渉しない
- **workspace/** — 作業ディレクトリ、成果物を保存

これは通常の多轮会話とは異なります：PM役割は突然コードを書き始めることはなく、アーキテクトは権限を超えて要件を修正することはなく、各役割は厳格に自分の責任範囲内で作業します。

```
~/.hermes/profiles/
├── pm/                    # プロダクトマネージャー
│   ├── SOUL.md
│   ├── skills/
│   │   └── team/
│   │       └── pm-workflow/
│   │           └── SKILL.md
│   ├── memories/
│   └── workspace/
├── ui/                    # UIデザイナー
├── sa/                    # アーキテクト
├── dev/                   # 開発エンジニア
└── qa/                    # QAエンジニア
```

## チーム設定：team.yaml

チームの行動は `~/.hermes/team.yaml` で定義されます：

```yaml
team:
  name: "AI開発チーム"
  members:
    pm:
      profile: pm
      role: "プロダクトマネージャー"
      responsibilities:
        - 要件分析
        - ユーザーストーリー作成
        - 受け入れ基準定義
      downstream: [ui, sa]
    
    ui:
      profile: ui
      role: "UI/UXデザイナー"
      responsibilities:
        - インターフェース設計
        - インタラクションフロー設計
      depends_on: [pm]
      downstream: [dev]
    
    sa:
      profile: sa
      role: "ソフトウェアアーキテクト"
      responsibilities:
        - システムアーキテクチャ設計
        - API設計
        - データモデル設計
      depends_on: [pm]
      downstream: [dev]
    
    dev:
      profile: dev
      role: "開発エンジニア"
      responsibilities:
        - コード実装
        - 単体テスト作成
      depends_on: [ui, sa]
      downstream: [qa]
    
    qa:
      profile: qa
      role: "QAエンジニア"
      responsibilities:
        - テスト戦略策定
        - バグ分析と報告
      depends_on: [dev]
```

## 標準開発プロセス

```
┌─────────────┐
│ PM 要件分析 │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ UI設計 │ SAアーキテクチャ設計 │  ←並行段階
└──────┬───────────────┘
       │
       ▼
┌─────────────┐
│ Dev 開発実装 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ QA テスト検証 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   リリース  │
└─────────────┘
```

## 実践：手動切り替えモード

最も簡単な使用方法は手動でProfileを切り替えることです：

```bash
# 段階1：PM要件分析
hermes -p pm
> 「ユーザーログイン」機能の要件を分析、ユーザーストーリーと受け入れ基準を出力
# 成果物：workspace/要件分析-ユーザーログイン.md

# 段階2：UIインターフェース設計（新ターミナル）
hermes -p ui
> 要件分析ドキュメント workspace/要件分析-ユーザーログイン.md に基づいてインターフェース設計
# 成果物：workspace/UI設計-ユーザーログイン.md

# 段階2：SAアーキテクチャ設計（並行可能）
hermes -p sa
> 要件分析ドキュメントに基づいてログインモジュールのアーキテクチャとAPI設計
# 成果物：workspace/アーキテクチャ設計-ユーザーログイン.md

# 段階3：Dev開発実装
hermes -p dev
> UI設計とアーキテクチャ設計に基づいてユーザーログイン機能を実装
# 成果物：機能コード + 単体テスト

# 段階4：QAテスト検証
hermes -p qa
> ユーザーログイン機能をテスト、受け入れ基準を満たすか検証
# 成果物：テスト報告書
```

各役割は自分の責任範囲内の情報のみを見て、上流の成果物に従って作業します。

---

関連リソース：
- [Hermes Agentドキュメント](https://hermes-agent.nousresearch.com/docs)
- [GitHub - Hermes Agent](https://github.com/nousresearch/hermes-agent)