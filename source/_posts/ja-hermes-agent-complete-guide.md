---
title: Hermes Agent 完全ガイド：インストールから使いこなすまで
date: 2026-07-09 14:00:00
lang: ja
tags:
  - AI
  - Hermes
  - チュートリアル
  - 自動化
  - LLM
categories:
  - 技術実践
---

Hermes Agent は Nous Research が開発したオープンソースの AI Agent フレームワークで、ターミナル、メッセージプラットフォーム、IDE で動作します。ツール呼び出しを通じてシステムと連携でき、20以上の LLM プロバイダーをサポートし、Linux、macOS、Windows、Docker で実行できます。

この記事の目標はシンプルです：**この1記事だけで、Hermes を使いこなせるようになる**。インストール・デプロイから使い方のコツまで、すべてカバーします。

<!-- more -->

## Hermes とは

Hermes は自律型コーディング・タスク実行 Agent に分類され、Claude Code や OpenAI Codex と同じカテゴリに属します。ただし、いくつかの顕著な違いがあります：

- **Skills による自己進化** - 複雑な問題を解決した後、ワークフローを Skill として保存し、以降のセッションで自動的に読み込めます。時間とともに、Agent はあなたの特定タスクにおいてどんどん強力になります
- **セッションをまたぐ永続メモリ** - あなたの好み、環境情報、経験から得た教訓を記憶します
- **マルチプラットフォームゲートウェイ** - 同じ Agent を Telegram、Discord、Slack、微信、Feishu など 15以上のプラットフォームで実行でき、完全なツールアクセス能力を備えます
- **プロバイダー非依存** - 他の設定を変更せずに、途中でモデルやプロバイダーを切り替えられます
- **プロファイル隔離** - 複数の独立した Hermes インスタンスを実行し、それぞれが独立した設定、セッション、スキル、メモリを持ちます
- **高い拡張性** - プラグイン、MCP サーバー、カスタムツール、Webhook トリガー、Cron 定期タスクをサポート

## システム要件

インストール前に、お使いの環境が以下の条件を満たしていることを確認してください：

| 要件 | 最低バージョン | 説明 |
|------|---------|------|
| Python | 3.11+ | インストールスクリプトが自動インストール |
| Node.js | 22+ | ブラウザツールに必要（任意） |
| Git | 任意のバージョン | リポジトリのクローンに必須 |
| メモリ | 512MB+ | Agent 自体の占有は非常に小さい |
| モデルコンテキスト | 64K tokens | モデルは少なくとも 64K のコンテキストウィンドウをサポートする必要があります |

対応プラットフォーム（Tier 1）：

- macOS（Apple Silicon）
- Windows 10/11（x86_64, aarch64）
- Linux / WSL2（x86_64, aarch64）
- Docker コンテナ（x86_64, aarch64）

## インストールガイド

### 1. Linux / macOS / WSL2

1コマンドでインストール：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

インストールスクリプトは以下の手順を自動的に実行します：
1. OS とパッケージマネージャーを検出
2. Python 3.11+ と Git をインストール（未インストールの場合）
3. Hermes リポジトリを `~/.hermes/hermes-agent/` にクローン
4. Python 仮想環境を作成し、依存関係をインストール
5. `hermes` コマンドを `~/.local/bin/` にインストール
6. インタラクティブな設定ウィザードを実行

インストール完了後、シェルを再読み込みします：

```bash
source ~/.bashrc   # または source ~/.zshrc
```

**root ユーザーでインストールする場合**、Hermes は FHS レイアウトを使用します：コードは `/usr/local/lib/hermes-agent` に配置、コマンドは `/usr/local/bin/hermes` にリンク、データは引き続き `~/.hermes/` に保存されます。これは Claude Code / Codex CLI の挙動と一致します。

**よく使うインストールオプション**：

```bash
# 設定ウィザードをスキップ（CI/自動化シナリオ）
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup

# 仮想環境を使用しない
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --no-venv

# ブランチを指定
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --branch dev
```

### 2. Windows ネイティブ

PowerShell で実行：

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

デスクトップインストーラーをダウンロードすることもできます：[https://hermes-agent.nousresearch.com/](https://hermes-agent.nousresearch.com/) にアクセスして Hermes Desktop インストールパッケージをダウンロードすると、CLI とデスクトップアプリが同時にインストールされます。

**Windows の注意事項**：

- Alt+Enter は Windows Terminal に全画面切り替えとして傍受されるため、改行には Ctrl+Enter を使用してください
- 初回実行時に HTTP 400 "No models provided" が発生した場合、config.yaml が UTF-8 BOM 形式で保存されている可能性があります。`hermes config edit` で再保存してください
- execute_code サンドボックスは Windows で WinError 10106 に遭遇する可能性があり、通常は環境変数 SYSTEMROOT がクリアされていることが原因です

### 3. WSL2（Windows Subsystem for Linux）

WSL2 では Linux と同じインストールスクリプトを使用します。ただし、WSL2 で systemd が有効になっていることを確認してください：

```bash
# /etc/wsl.conf
[boot]
systemd=true
```

systemd がない場合、Gateway サービスは nohup モードにフォールバックし、WSL2 ウィンドウが閉じると終了します。

インストールコマンドは Linux と同じです：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### 4. Docker デプロイ

Docker はサーバーデプロイの推奨方式です。イメージ自体はステートレスで、すべてのデータはボリュームマウントで永続化されます。

**初期設定**（インタラクティブ）：

```bash
mkdir -p ~/.hermes
docker run -it --rm \
  -v ~/.hermes:/opt/data \
  nousresearch/hermes-agent setup
```

これにより設定ウィザードに入り、API キーの入力を求め `~/.hermes/.env` に書き込みます。1回だけ実行すれば十分です。

**Gateway モード**（バックグラウンド常駐）：

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  nousresearch/hermes-agent gateway run
```

ポート 8642 は Gateway の API サーバーとヘルスチェックエンドポイントを公開します。チャットプラットフォーム（Telegram、Discord など）のみを使用する場合、このポートをマッピングする必要はありません。

**Web Dashboard を有効にする**：

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  -p 9119:9119 \
  -e HERMES_DASHBOARD=1 \
  nousresearch/hermes-agent gateway run
```

**Docker デプロイのポイント**：
- コンテナ内の Gateway は s6-overlay が監視し、クラッシュ後に自動再起動します
- 更新方法は新しいイメージをプルすることで、`hermes update` ではありません
- VPS のブラウザコンソールで docker コマンドを実行しないでください（特殊文字の転送に問題があります）。SSH 経由で操作してください
- API サーバーを公開する場合、必ず `API_SERVER_KEY` を設定してください：

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  -e API_SERVER_ENABLED=true \
  -e API_SERVER_HOST=0.0.0.0 \
  -e API_SERVER_KEY="$(openssl rand -hex 32)" \
  nousresearch/hermes-agent gateway run
```

### 5. Android（Termux）

Termux ターミナルで Linux と同じインストールスクリプトを実行します。インストールスクリプトは Termux 環境を自動検出し、Python 標準ライブラリの venv + pip（uv ではなく）を使用します。一部の機能はスマートフォンでは利用できません。公式の Termux ドキュメントを参照してください。

## 初期設定

インストール完了後、設定ウィザードを実行します：

```bash
hermes setup
```

設定ウィザードは3つのモードを提供します：

| モード | 説明 | 適用シナリオ |
|------|------|---------|
| Quick Setup (Nous Portal) | OAuth ログイン、ゼロ設定 | すぐに始めたい場合に推奨 |
| Full Setup | すべてのオプションを段階的に設定 | 細かな制御が必要な場合 |
| Blank Slate | 最小限の必須ツールのみ保持 | ミニマリスト向け |

### プロバイダーの選択

Hermes は 30以上の LLM プロバイダーをサポートしています。インタラクティブセレクターを使用：

```bash
hermes model
```

よく使うプロバイダークイックリファレンス：

| プロバイダー | 認証方式 | 環境変数 |
|----------|---------|---------|
| Nous Portal | OAuth | `hermes setup --portal` |
| OpenRouter | API Key | `OPENROUTER_API_KEY` |
| Anthropic | API Key / OAuth | `ANTHROPIC_API_KEY` |
| OpenAI Codex | OAuth | `hermes auth` |
| DeepSeek | API Key | `DEEPSEEK_API_KEY` |
| Google Gemini | API Key | `GOOGLE_API_KEY` |
| Z.AI (GLM) | API Key | `GLM_API_KEY` |
| Kimi (Moonshot) | API Key | `KIMI_API_KEY` |
| MiniMax | API Key / OAuth | `MINIMAX_API_KEY` |
| 阿里通義 (DashScope) | API Key | `DASHSCOPE_API_KEY` |
| GitHub Copilot | OAuth / Token | `COPILOT_GITHUB_TOKEN` |
| カスタムエンドポイント | URL + Key | config.yaml で設定 |

**中国国内ユーザーへのおすすめ**：Z.AI (GLM)、Kimi、MiniMax China、阿里通義はすべて中国国内ネットワークの直接接続をサポートしています。また、カスタムエンドポイントを使用して vLLM、Ollama などのローカルモデルサービスに接続することもできます。

**カスタムエンドポイントの設定**（ローカル Ollama に接続する例）：

```bash
hermes config set model.provider custom
hermes config set model.base_url http://localhost:11434/v1
hermes config set model.api_key ollama
hermes config set model.default qwen2.5:32b
hermes config set model.context_length 65536
```

### 設定ファイルの構造

Hermes は機密情報と非機密設定を分離しています：

```
~/.hermes/
├── config.yaml          # メイン設定ファイル（設定）
├── .env                 # API キーとシークレット
├── skills/              # インストール済みスキル
├── sessions/            # セッション記録
├── state.db             # セッションストレージ（SQLite + FTS5）
├── auth.json            # OAuth トークンと認証情報プール
├── logs/                # Gateway とエラーログ
└── hermes-agent/        # ソースコード（git インストール方式）
```

設定の確認と変更：

```bash
hermes config             # 現在の設定を確認
hermes config edit        # エディタで config.yaml を開く
hermes config set KEY VAL # 設定値を設定
hermes config path        # config.yaml のパスを出力
hermes config check       # 設定の完全性をチェック
```

### ヘルスチェック

インストール完了後、診断ツールを実行してすべて正常であることを確認します：

```bash
hermes doctor
```

これにより Python バージョン、依存関係の完全性、設定ファイル、API キーなどがチェックされます。`--fix` を付けると一部の問題を自動修復できます。

## 基本的な使い方

### インタラクティブセッションの開始

```bash
hermes            # クラシック CLI
hermes --tui      # モダン TUI（推奨）
```

TUI モードはモーダルオーバーレイ、マウス選択、ノンブロッキング入力を提供します。両方のインターフェースは同じセッション、スラッシュコマンド、設定を共有します。

### 単発クエリ

インタラクティブセッションが不要な場合は、直接質問できます：

```bash
hermes chat -q "Python でクイックソートを書いて"
```

### スキルのプリロード

起動時に指定スキルを読み込みます：

```bash
hermes -s github-pr-workflow
```

### セッションの復元

```bash
hermes --continue              # 直近のセッションを復元
hermes --resume my-session     # 名前で復元
hermes -r 20260709_143052_a1b2 # ID で復元
```

### ワークツリーモード

複数の Agent を並行実行して同じリポジトリを編集する場合、ワークツリーモードを使って git コンフリクトを回避します：

```bash
hermes -w
```

### YOLO モード

危険なコマンドの承認をスキップします（慎重に使用）：

```bash
hermes --yolo
```

または設定でスマート承認モードに設定：

```bash
hermes config set approvals.mode smart  # 低リスクは自動承認、高リスクは引き続き確認
```

## セッション内スラッシュコマンド

インタラクティブセッションでスラッシュコマンドを入力して Agent の挙動を制御します。以下はよく使うコマンドのカテゴリ別クイックリファレンスです。

### セッション制御

```
/new              新しいセッションを開始
/clear            画面をクリアして新しいセッションを開始
/retry            最後のメッセージを再送信
/undo             最後のやり取りを取り消す
/title [名前]     現在のセッションに名前を付ける
/compress         コンテキストを手動圧縮
/stop             バックグラウンドプロセスを終了
/rollback [N]     ファイルシステムチェックポイントを復元（--checkpoints の有効化が必要）
```

### 設定調整

```
/model [名前]     モデルを確認または切り替え
/personality [名前]  人格を設定
/reasoning [レベル]  推論深度を設定（none|minimal|low|medium|high|xhigh）
/verbose          詳細出力レベルを循環切り替え
/voice [on|off]   音声モードのオン/オフ
/yolo             承認バイパスを切り替え
```

### ツールとスキル

```
/tools            ツールを管理
/skills           スキルを検索・インストール
/skill <名前>     現在のセッションにスキルを読み込み
/reload-skills    スキルディレクトリを再スキャン
/cron             Cron 定期タスクを管理
```

### 実用ツール

```
/branch           現在のセッションを分岐
/history          会話履歴を表示
/save             会話をファイルに保存
/copy [N]         直近の返信をクリップボードにコピー
/image            ローカル画像を添付
/usage            Token 使用量を確認
/help             すべてのコマンドを表示
/quit             終了
```

`/help` を入力すると完全なコマンドリストを確認できます。新バージョンでコマンドが追加される可能性があります。

## コア機能の詳細

### ツールシステム（Toolsets）

Hermes の能力はツールセット（Toolsets）で実現されます。各ツールセットは関連ツールの集合で、個別に有効化/無効化できます。

```bash
hermes tools           # インタラクティブに有効化/無効化（curses UI）
hermes tools list      # すべてのツールと状態をリスト
hermes tools enable web     # Web 検索を有効化
hermes tools disable browser # ブラウザ自動化を無効化
```

よく使うツールセット一覧：

| ツールセット | 機能説明 |
|--------|---------|
| `web` | Web 検索とコンテンツ抽出 |
| `browser` | ブラウザ自動化（Browserbase、Camofox またはローカル Chromium） |
| `terminal` | シェルコマンド実行とプロセス管理 |
| `file` | ファイル読み書き、検索、パッチ |
| `code_execution` | サンドボックス化された Python 実行 |
| `vision` | 画像分析 |
| `image_gen` | AI 画像生成 |
| `tts` | テキスト読み上げ |
| `memory` | セッションをまたぐ永続メモリ |
| `session_search` | 履歴会話の検索 |
| `delegation` | サブエージェントへのタスク委譲 |
| `cronjob` | 定期タスク管理 |
| `todo` | セッション内タスク計画と追跡 |
| `skills` | スキルの閲覧と管理 |
| `messaging` | クロスプラットフォームメッセージ送信 |

ツールの変更は新しいセッションで有効になります（`/reset` または再起動）。現在のセッションでは有効にならず、これによりプロンプトキャッシュが維持されます。

### スキルシステム（Skills）

スキルは Hermes の自己進化の中核メカニズムです。スキルは再利用可能なワークフロー文書で、特定タスクの手順、コマンド、注意事項を含みます。

**スキルのインストール**：

```bash
hermes skills list              # インストール済みスキルをリスト
hermes skills browse            # スキルマーケットを閲覧
hermes skills search github     # スキルを検索
hermes skills install ID        # スキルをインストール
hermes skills inspect ID        # インストールせずにプレビュー
```

スキルのインストール元として対応：
- スキルマーケット（hub identifier）
- 直接 URL（`https://.../SKILL.md`）
- GitHub リポジトリ（`hermes skills tap add owner/repo`）

**スキルの自動メンテナンス**：Hermes には内蔵の Curator システムがあり、スキルの使用状況を自動追跡します。長期間未使用のスキルは stale とマークされアーカイブされます（削除はされません）。すべての操作前に自動バックアップが行われます。

**セッション中のスキル読み込み**：

```
/skill github-pr-workflow
```

または起動時にプリロード：

```bash
hermes -s github-pr-workflow,code-review
```

### Profile マルチロールシステム

Profile は独立した設定ユニットで、異なるアイデンティティと設定を持つ複数の Hermes インスタンスを実行できます。

```bash
hermes profile list              # すべての Profile をリスト
hermes profile create dev        # 新しい Profile を作成
hermes profile create pm --clone # 現在の Profile からクローン
hermes profile use dev           # デフォルトの Profile を切り替え
hermes profile show dev          # Profile の詳細を確認
hermes -p dev                    # 指定した Profile で一時的に実行
```

各 Profile は以下を持ちます：
- 独立した SOUL.md（ロールアイデンティティ定義）
- 独立した skills/ ディレクトリ
- 独立した memories/（メモリ）
- 独立した config.yaml と .env

**典型的な応用シナリオ**：AI 開発チームの構築。PM、アーキテクト、開発エンジニア、QA エンジニアそれぞれに Profile を作成し、各ロールに専用のアイデンティティ定義とワークフロースキルを持たせます。

### Gateway メッセージプラットフォーム

Gateway は Hermes をメッセージプラットフォーム上で実行し、完全なツールアクセス能力を備えさせます。

```bash
hermes gateway setup     # プラットフォームを設定
hermes gateway install   # バックグラウンドサービスとしてインストール
hermes gateway start     # サービスを開始
hermes gateway stop      # サービスを停止
hermes gateway status    # 状態を確認
```

対応プラットフォーム：

| プラットフォーム | 説明 |
|------|------|
| Telegram | 完全サポート、おすすめの第一選択 |
| Discord | Message Content Intent の有効化が必要 |
| Slack | message.channels イベントのサブスクライブが必要 |
| WhatsApp | Baileys ライブラリ経由 |
| Signal | signal-cli 経由 |
| Matrix | python-olm 経由 |
| Email | IMAP/SMTP |
| 微信 (Weixin) | サポート |
| 飛書 (Feishu) | サポート |
| 企業微信 (WeCom) | サポート |
| 釘釘 (DingTalk) | サポート |
| SMS | Twilio など経由 |
| Home Assistant | スマートホーム連携 |
| API Server | OpenAI 互換 API |
| Webhooks | イベント駆動トリガー |

**Gateway 管理コマンド**（メッセージプラットフォーム内で使用）：

```
/approve    実行待ちコマンドを承認
/deny       コマンドを拒否
/restart    Gateway を再起動
/sethome    現在のチャットをメインチャンネルに設定
/platforms  プラットフォームの接続状態を確認
```

### Cron 定期タスク

```bash
hermes cron list                    # 定期タスクをリスト
hermes cron create '0 9 * * *'      # 毎日午前9時
hermes cron create '30m'            # 30分ごと
hermes cron create 'every 2h'       # 2時間ごと
hermes cron edit ID                 # タスクを編集
hermes cron pause/resume ID         # 一時停止/再開
hermes cron run ID                  # 即時トリガー
hermes cron remove ID               # タスクを削除
```

各 Cron タスクは以下をサポート：
- 読み込む Skills の指定
- モデルとプロバイダーのオーバーライド
- プレ実行スクリプト（データ収集モード）
- タスクチェーン（上流タスクの出力を下流タスクに注入）
- マルチプラットフォーム配信

### MCP サーバー

MCP（Model Context Protocol）は Hermes を外部ツールサーバーに接続させます。

```bash
hermes mcp list              # 設定済みサーバーをリスト
hermes mcp add NAME          # サーバーを追加（--url または --command）
hermes mcp remove NAME       # サーバーを削除
hermes mcp test NAME         # 接続をテスト
hermes mcp configure NAME    # ツール選択を設定
```

MCP サーバーは stdio と HTTP の2つの転送方式をサポートし、ツールを自動検出して Hermes に登録します。

### サブエージェント委譲（Delegation）

`delegate_task` は Hermes がサブエージェントを生成してサブタスクを処理することを許可します。サブエージェントは独立したセッションとターミナルを持ちます。

```bash
# セッション内で、Hermes は自動的に delegate_task ツールを使用します
# CLI から手動でトリガーすることもできます：
hermes chat -q "GRPO 論文を研究し、要約を ~/research/grpo.md に書いて"
```

サブエージェントの特徴：
- 隔離された会話コンテキスト
- ツールサブセットを選択可能
- バッチ並行実行をサポート
- 結果を自動集約して親エージェントに返却

### 永続メモリ

Hermes はセッション間でメモリを保持し、2種類に分かれます：

- **User Profile** - ユーザー情報：名前、役割、好み、コミュニケーションスタイル
- **Memory** - 環境ノート：プロジェクト構造、ツール特性、経験から得た教訓

```bash
hermes memory status     # メモリ状態を確認
hermes memory setup      # メモリバックエンドを設定
hermes memory off        # メモリを無効化
```

メモリは新しい各セッションのシステムプロンプトに注入され、簡潔で焦点を絞った内容に保たれます。

## 使用のコツとベストプラクティス

### 1. モデル選択戦略

異なるタスクには異なるモデルが適しています：

| タスクタイプ | 推奨モデル | 理由 |
|---------|---------|------|
| コード作成 | Claude Sonnet/Opus | コード理解と生成能力が高い |
| 日常会話 | GPT-4o / Gemini | 高速、コストパフォーマンスが良い |
| 中国語シナリオ | GLM / Qwen | 中国語理解がより正確 |
| 長文書処理 | Claude（200K コンテキスト） | コンテキストウィンドウが大きい |
| ローカルデプロイ | Ollama + Qwen2.5 | API 費用不要 |

モデルの切り替えは1コマンドだけで、ロックインはありません：

```bash
hermes model    # インタラクティブに選択
```

### 2. プロンプトのコツ

Hermes は自然言語の指示を理解しますが、良いプロンプトで効果が大幅に向上します：

```
# 悪いプロンプト
バグを直して

# 良いプロンプト
~/work/code/myapp/src/auth.py ファイルを確認してください。ユーザーからログイン時に
まれに 500 エラーが発生するとの報告があり、ログでは JWT 検証失敗が
示されています。根本原因を見つけて修正し、
修正後に pytest tests/test_auth.py を実行して検証してください。
```

重要な要素：
- 明確なファイルパス
- 具体的な症状とエラーメッセージの記述
- 検証方法の指定
- コンテキストの提供（ログ、環境）

### 3. Skills を活用して経験を蓄積

再利用可能なワークフローを見つけたら、Hermes にスキルとして保存させます：

```
さっきの Hexo ブログのデプロイ手順をスキルとして保存して
```

Hermes は SKILL.md ファイルを生成し、トリガー条件、手順、コマンド、注意事項を含めます。次回類似タスクに遭遇した際に自動的に読み込まれます。

### 4. セッション管理

- `/title` でセッションに名前を付け、後で復元しやすくする
- 長いセッションは `/compress` でコンテキストを圧縮し、Token の無駄遣いを避ける
- `/branch` でセッションを分岐し、メインラインに影響を与えずに異なるアプローチを探索
- `hermes sessions browse` で履歴セッションを閲覧・検索

### 5. セキュリティ設定

```bash
# シークレットマスキングを有効化（ツール出力内の API Key は自動的に伏字化）
hermes config set security.redact_secrets true

# スマートコマンド承認（低リスクは自動承認、高リスクは引き続き確認）
hermes config set approvals.mode smart

# ファイルシステムチェックポイントを有効化（ファイル変更をロールバック可能）
hermes config set checkpoints.enabled true
```

### 6. マルチ Agent 協力

tmux で複数のインタラクティブ Hermes インスタンスを実行：

```bash
# バックエンド Agent を起動
tmux new-session -d -s backend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t backend 'ユーザー管理の REST API を構築して' Enter

# フロントエンド Agent を起動
tmux new-session -d -s frontend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t frontend 'ユーザー管理の React ダッシュボードを構築して' Enter

# 進捗を確認
tmux capture-pane -t backend -p | tail -30
```

`-w`（ワークツリーモード）を使用して、複数の Agent が同じリポジトリを編集する際の git コンフリクトを回避します。

### 7. 音声モード

```bash
# 音声転文字を設定（ローカル Whisper は無料）
pip install faster-whisper
hermes config set stt.enabled true
hermes config set stt.provider local
```

セッション中に音声モードを切り替え：

```
/voice on    # 音声会話モード
/voice tts   # 常に音声で返信
/voice off   # オフ
```

### 8. パフォーマンス最適化

```bash
# コンテキスト圧縮を有効化（デフォルトで有効）
hermes config set compression.enabled true
hermes config set compression.threshold 0.50  # コンテキスト使用率 50% でトリガー
hermes config set compression.target_ratio 0.20  # 20% に圧縮

# 最大インタラクションターン数を制限
hermes config set agent.max_turns 90
```

## トラブルシューティング

### インストール問題

**問題：インストールスクリプトで "Git not found" エラー**

インストールスクリプトは Git の自動インストールを試みます。失敗した場合は手動でインストール：
- Ubuntu/Debian: `sudo apt install git`
- CentOS/RHEL: `sudo yum install git`
- macOS: `brew install git` または Xcode Command Line Tools をインストール

**問題：Windows で HTTP 400 "No models provided"**

config.yaml が UTF-8 BOM 形式で保存されています。`hermes config edit` を実行して再保存すると、エディタが自動的に BOM を除去します。

**問題：WSL2 で Gateway が終了後に再実行されない**

`/etc/wsl.conf` で systemd が有効になっていることを確認：
```ini
[boot]
systemd=true
```

### モデルとプロバイダーの問題

```bash
hermes doctor     # 設定と依存関係をチェック
hermes auth       # OAuth プロバイダーを再認証
```

**Copilot 403 エラー**：`gh auth login` のトークンは Copilot API に使用できません。`hermes model` -> GitHub Copilot の OAuth デバイスコードフローで認証する必要があります。

**モデルコンテキスト不足**：Hermes はモデルが少なくとも 64K tokens のコンテキストをサポートすることを要求します。ローカルモデルでは以下を設定：
```bash
# Ollama
ollama run qwen2.5:32b --ctx-size 65536

# llama.cpp
./main -m model.gguf -c 65536
```

### Gateway の問題

```bash
# ログを確認
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

**Gateway が SSH 切断後に終了する**：
```bash
sudo loginctl enable-linger $USER
```

**Gateway のクラッシュループ**：
```bash
systemctl --user reset-failed hermes-gateway
```

**Discord Bot が応答しない**：Discord Developer Portal で、Bot -> Privileged Gateway Intents の Message Content Intent を有効化してください。

**Slack Bot が DM でのみ動作する**：`message.channels` イベントをサブスクライブする必要があります。そうしないと Bot はパブリックチャンネルのメッセージを無視します。

### ツールとスキルの問題

**ツールが使用できない**：
1. `hermes tools` でツールセットが有効か確認
2. 一部のツールは環境変数が必要（`.env` を確認）
3. ツールを有効化した後は `/reset` で新しいセッションを開始

**スキルが表示されない**：
1. `hermes skills list` でインストール済みか確認
2. `hermes skills config` でプラットフォームの有効状態を確認
3. 手動で読み込み：`/skill name` または `hermes -s name`

### 変更が反映されない

| 変更タイプ | 反映方法 |
|---------|---------|
| ツール/スキルの変更 | `/reset` で新しいセッションを開始 |
| 設定変更（Gateway） | `/restart` |
| 設定変更（CLI） | 終了して再起動 |
| コード変更 | CLI または Gateway プロセスを再起動 |

### 補助モデルが動作しない

ビジョン分析、コンテキスト圧縮などの補助機能がサイレントに失敗する場合、`auto` プロバイダーがバックエンドを見つけられていません。補助モデルを設定してください：

```bash
hermes config set auxiliary.vision.provider openrouter
hermes config set auxiliary.vision.model anthropic/claude-sonnet-4
```

## CLI コマンドクイックリファレンス

### グローバルパラメータ

```
hermes [flags] [command]

  --version, -V             バージョンを表示
  --resume, -r SESSION      ID でセッションを復元
  --continue, -c [NAME]     直近または指定名のセッションを復元
  --worktree, -w            ワークツリーモード（並行 Agent）
  --skills, -s SKILL        スキルをプリロード
  --profile, -p NAME        指定 Profile を使用
  --yolo                    危険なコマンドの承認をスキップ
```

サブコマンドなしの場合はデフォルトで `chat` に入ります。

### よく使うコマンド

```
# 会話
hermes                          インタラクティブチャット
hermes chat -q "質問"           単発クエリ
hermes chat -m model_name       モデルを指定

# 設定
hermes setup                    設定ウィザード
hermes model                    モデルセレクター
hermes config                   設定を確認
hermes config set KEY VAL       設定値を設定
hermes auth                     認証情報管理
hermes doctor [--fix]           診断

# ツールとスキル
hermes tools                    ツールを管理
hermes tools list               ツールをリスト
hermes skills list              スキルをリスト
hermes skills browse            スキルマーケットを閲覧
hermes skills install ID        スキルをインストール

# Profile
hermes profile list             Profile をリスト
hermes profile create NAME      Profile を作成
hermes profile use NAME         デフォルト Profile を切り替え

# Gateway
hermes gateway setup            プラットフォームを設定
hermes gateway install          サービスをインストール
hermes gateway start/stop       サービスの開始/停止

# セッション
hermes sessions list            セッションをリスト
hermes sessions browse          インタラクティブに閲覧
hermes sessions export OUT      JSONL にエクスポート

# 定期タスク
hermes cron list                タスクをリスト
hermes cron create SCHED        タスクを作成

# その他
hermes update                   最新版に更新
hermes status [--all]           コンポーネント状態
hermes insights [--days N]      使用分析
hermes completion bash|zsh      シェル補完
```

## まとめ

Hermes Agent は強力で高い拡張性を持つ AI Agent フレームワークです。使いこなすにはいくつかのコア概念を理解する必要があります：

1. **インストール・デプロイ** - OS に応じた適切なインストール方式を選択。Docker はサーバー向け、デスクトップインストーラーは個人 PC 向け
2. **プロバイダー設定** - 適切な LLM プロバイダーを選択。中国国内ユーザーには GLM/Kimi/通義 またはカスタムエンドポイントがおすすめ
3. **ツールシステム** - 必要に応じてツールセットを有効化。すべてを有効にする必要はありません
4. **スキルの蓄積** - 複雑な問題を解決するたびにスキルとして保存し、Agent を継続的に進化させる
5. **プロファイル隔離** - マルチロールシナリオで Profile を使ってアイデンティティと設定を分離
6. **Gateway デプロイ** - Agent をメッセージプラットフォームで実行し、いつでも利用可能に

重要な設計理念：Hermes のすべての能力はオプションです。最小構成から始めて、必要に応じて機能を追加するのが正しい使い方です。

公式ドキュメント：https://hermes-agent.nousresearch.com/docs/

GitHub リポジトリ：https://github.com/NousResearch/hermes-agent
