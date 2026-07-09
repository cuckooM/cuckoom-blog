---
title: OpenClaw 完全ガイド：インストールから使いこなすまで
date: 2026-07-09 15:00:00
tags:
  - AI
  - OpenClaw
  - チュートリアル
  - 自動化
  - LLM
categories:
  - 技術実践
lang: ja
---

OpenClaw はオープンソースの個人 AI アシスタントフレームワークで、あなた自身のデバイス上で動作します。TypeScript で構築され、Gateway を介して普段使っているメッセージングチャネルを接続することで、WhatsApp、Telegram、Slack、Discord など 20 以上のプラットフォームで AI アシスタントと会話できます。

この記事の目標は Hermes ガイドと同じです：**この 1 篇だけで OpenClaw を使いこなせるようになる**。インストール・デプロイから活用テクニックまで、すべて網羅します。

<!-- more -->

## OpenClaw とは

OpenClaw の核心理念は「個人 AI アシスタント」です――あなた自身のデバイスで実行し、データはあなたが管理します。自律タスク実行型 Agent に分類され、Hermes Agent や Claude Code と同じカテゴリですが、重点が異なります：

- **ローカルファーストの Gateway** - 単一のコントロールプレーンでセッション、チャネル、ツール、イベントを管理。すべてのデータはあなたのデバイスに留まります
- **マルチチャネル受信箱** - 20 以上のメッセージングプラットフォームを統合接続。1 つのアシスタントですべてのコミュニケーションチャネルをカバー
- **マルチ Agent ルーティング** - 異なるチャネル/連絡先を分離された Agent インスタンスにルーティング。各 Agent は独立したワークスペースとセッションを持ちます
- **ボイスウェイク + 会話モード** - macOS/iOS はウェイクワード対応、Android は連続音声会話対応
- **Live Canvas** - Agent 駆動のビジュアルワークスペース、A2UI プロトコル対応
- **コンパニオンアプリ** - Windows Hub、macOS メニューバーアプリ、iOS/Android ノードアプリ
- **スキールエコシステム** - ClawHub スキールマーケットプレイス経由でスキルのインストールと共有

OpenClaw と Hermes の主な違い：

| 次元 | OpenClaw | Hermes Agent |
|------|---------|-------------|
| 言語 | TypeScript (Node.js) | Python |
| インストール方式 | npm / インストールスクリプト | pip / インストールスクリプト |
| 設定フォーマット | JSON5 (openclaw.json) | YAML (config.yaml) |
| データディレクトリ | ~/.openclaw/ | ~/.hermes/ |
| メッセージングプラットフォーム数 | 20+ | 15+ |
| デスクトップアプリ | Windows Hub / macOS メニューバー | Hermes Desktop |
| スキルマーケット | ClawHub | Hermes Skills Hub |
| 音声 | Voice Wake + Talk Mode | STT + TTS |
| ビジュアル | Live Canvas (A2UI) | Dashboard |

## システム要件

インストール前に、お使いの環境が以下の条件を満たしていることを確認してください：

| 要件 | 最低バージョン | 説明 |
|------|---------|------|
| Node.js | 22.19+ または 24+ | 24 が推奨バージョン、インストールスクリプトが自動インストール |
| メモリ | 512MB+ | Gateway 自体の占有は非常に小さい |
| ディスク | 200MB+ | 依存関係とスキルを含む |
| API Key | 任意のモデルプロバイダー | Anthropic、OpenAI、Google など |

対応プラットフォーム：

- macOS（Apple Silicon + Intel）
- Linux（x86_64, aarch64）
- Windows（ネイティブ + WSL2）
- Docker コンテナ
- Raspberry Pi
- Android（Termux またはノードアプリ経由）
- iOS（ノードアプリ経由）

## インストールガイド

### 1. macOS / Linux / WSL2

ワンコマンドインストール（推奨）：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

インストールスクリプトは以下のステップを自動で実行します：
1. OS とパッケージマネージャーを検出
2. Node.js 24 をインストール（未インストールまたはバージョンが古い場合）
3. OpenClaw パッケージをグローバルインストール
4. インタラクティブな Onboarding ウィザードを起動

インストール完了後、Onboarding を実行：

```bash
openclaw onboard --install-daemon
```

Onboarding ウィザードは以下を案内します：
- モデルプロバイダーの選択と API Key の入力
- Gateway の設定（トークン生成、ポート設定）
- メッセージングチャネルの選択（スキップ可能、後で設定）
- Gateway デーモンのインストール（launchd/systemd ユーザーサービス）

**Onboarding をスキップ**（CI/自動化シナリオ）：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

**ローカルプレフィックスインストール**（システムの Node.js に依存しない）：

```bash
curl -fsSL https://openclaw.ai/install-cli.sh | bash
```

これにより OpenClaw と Node.js が `~/.openclaw/` ディレクトリにインストールされ、システム環境を汚しません。

### 2. Windows

**方式 1：Windows Hub デスクトップアプリ（推奨）**

[https://docs.openclaw.ai/platforms/windows](https://docs.openclaw.ai/platforms/windows) にアクセスして Windows Hub インストーラーをダウンロードします。グラフィカルな設定画面、システムトレイステータス、チャットウィンドウ、ノードモード、ローカル MCP モードを提供します。

**方式 2：PowerShell インストール**

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

Onboarding をスキップ：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
```

**方式 3：WSL2**

WSL2 内で Linux と同じインストールスクリプトを使用します。Gateway は WSL2 内で実行され、Windows 側からブラウザでコントロールパネルにアクセスします。

### 3. npm / pnpm / bun インストール

自身で Node.js 環境を管理している場合：

```bash
# npm
npm install -g openclaw@latest
openclaw onboard --install-daemon

# pnpm（初回インストール後にビルドスクリプトの承認が必要）
pnpm add -g openclaw@latest
pnpm approve-builds -g
openclaw onboard --install-daemon

# bun（実験的）
bun add -g openclaw@latest
openclaw onboard --install-daemon
```

### 4. Docker デプロイ

Docker はサーバーデプロイの推奨方式で、隔離された Gateway 環境を提供します。

**ビルド済みイメージを使用**：

```bash
# GHCR（主要レジストリ）
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# または Docker Hub イメージ
export OPENCLAW_IMAGE="openclaw/openclaw:latest"

# リポジトリをクローンしてセットアップスクリプトを実行
git clone https://github.com/openclaw/openclaw.git
cd openclaw
./scripts/docker/setup.sh
```

セットアップスクリプトは自動で以下を実行します：
- Docker イメージのプル/ビルド
- プロバイダー API Key の入力プロンプト
- Gateway トークンの生成と `.env` への書き込み
- 認証キーディレクトリの作成
- Docker Compose による Gateway の起動

**オフラインインストール**（エアギャップ環境）：

```bash
# ネットワークがあるマシンでイメージをプル
docker pull ghcr.io/openclaw/openclaw:latest
docker save ghcr.io/openclaw/openclaw:latest -o openclaw-image.tar

# 対象マシンに転送後にロード
docker load -i openclaw-image.tar
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh --offline
```

**Docker デプロイのポイント**：
- 最低 2GB メモリ（`pnpm install` は 1GB ホストで OOM する可能性あり）
- 公式タグ：`main`、`latest`、`<version>`（例：`2026.2.26`）
- `-browser` バリアント（例：`latest-browser`）は Chromium 内蔵、サンドボックスブラウザに適用
- VPS にデプロイする前に、必ずセキュリティ強化ドキュメントを読むこと
- コントロールパネルのアドレス：`http://127.0.0.1:18789/`

### 5. その他のプラットフォーム

**Raspberry Pi**：ARM アーキテクチャに対応、Linux と同じインストールスクリプトを使用。

**Android (Termux)**：Termux で Node.js をインストール後、npm でインストール。OpenClaw Android ノードアプリをインストールしてネイティブ体験を得ることも可能。

**iOS**：App Store から OpenClaw ノードアプリをインストールし、あなたの Gateway に接続。

**Nix**：`github.com/openclaw/nix-openclaw` が提供する Nix flake を使用。

## 初期設定

インストール完了後、Onboarding ウィザードが設定の主要なエントリーポイントです：

```bash
openclaw onboard    # 完全な Onboarding フロー
openclaw configure  # 設定ウィザード（いつでも実行して設定を変更可能）
```

### 設定ファイル構造

OpenClaw は JSON5 フォーマットの設定ファイルを使用します：

```
~/.openclaw/
├── openclaw.json          # メイン設定ファイル（JSON5）
├── .env                   # API シークレットと機密情報
├── workspace/             # デフォルトワークスペース
│   ├── SOUL.md            # アシスタントの人格定義
│   ├── MEMORY.md          # 長期記憶
│   ├── USER.md            # ユーザープロファイル
│   ├── AGENTS.md          # ワークスペース指示
│   └── skills/            # ワークスペーススキル
├── skills/                # グローバルスキルディレクトリ
├── agents/                # マルチ Agent 設定
│   └── main/              # メイン Agent
│       └── agent/
│           └── auth-profiles.json  # 認証設定
└── credentials/           # チャネル認証情報
```

設定ファイルが存在しない場合はセキュアなデフォルト値が使用されます。設定ファイルは通常のファイルでなければなりません（シンボリックリンクは不可、OpenClaw はアトミック置換で書き込むため）。

設定ファイルがデフォルト以外の場所にある場合、環境変数を設定します：

```bash
export OPENCLAW_CONFIG_PATH=/path/to/openclaw.json
```

### CLI 設定コマンド

```bash
# 設定値の読み取り
openclaw config get agents.defaults.workspace

# 設定値のセット
openclaw config set agents.defaults.heartbeat.every "2h"

# 設定値の削除
openclaw config unset plugins.example

# インタラクティブ設定ウィザード
openclaw configure
```

### 最小設定例

```json5
// ~/.openclaw/openclaw.json
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: "claude-sonnet-4-20250514",
      thinkingDefault: "high",
      verboseDefault: "off",
      timeoutSeconds: 900,
      compaction: {
        mode: "auto",
      },
    },
  },
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowFrom: ["123456789"],
    },
  },
  models: {
    providers: {
      anthropic: {
        apiKey: "${ANTHROPIC_API_KEY}",
      },
    },
  },
}
```

### モデルとプロバイダーの設定

OpenClaw は複数のモデルプロバイダーをサポートし、`models.providers` で設定します：

```json5
{
  models: {
    providers: {
      anthropic: {
        apiKey: "${ANTHROPIC_API_KEY}",
        apiType: "anthropic",
      },
      openai: {
        apiKey: "${OPENAI_API_KEY}",
        apiType: "openai",
      },
      openrouter: {
        apiKey: "${OPENROUTER_API_KEY}",
        baseUrl: "https://openrouter.ai/api/v1",
        apiType: "openai",
      },
      // カスタムエンドポイント（vLLM / Ollama などに接続）
      local: {
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        apiType: "openai",
      },
    },
  },
  agents: {
    defaults: {
      // 単一モデル
      model: "claude-sonnet-4-20250514",
      // またはフェイルオーバー付きモデルチェーン
      // model: {
      //   primary: "claude-sonnet-4-20250514",
      //   fallbacks: ["gpt-4o", "gemini-2.0-flash"],
      // },
    },
  },
}
```

**モデルフェイルオーバー**：`primary` と `fallbacks` を設定すると、プライマリモデルが利用不可のときに自動切り替えします。

**シークレット保存**：API Key は 3 つのフォーマットをサポート：

```json5
// 1. プレーン文字列
"apiKey": "sk-ant-xxx..."

// 2. 環境変数参照
"apiKey": "${ANTHROPIC_API_KEY}"

// 3. SecretRef オブジェクト（高度）
"apiKey": { "source": "env", "id": "ANTHROPIC_API_KEY" }
```

環境変数参照フォーマットの使用を推奨します。シークレットは `~/.openclaw/.env` ファイルに保存されます。

### ヘルスチェック

```bash
openclaw doctor       # 設定、依存関係、セキュリティ設定をチェック
openclaw gateway status  # Gateway の実行状態をチェック
```

`openclaw doctor` は以下をチェックします：
- Node.js バージョン
- 設定ファイルの完全性
- API Key が設定されているか
- DM セキュリティポリシーが適切か
- サンドボックス設定が安全か

## 基本的な使い方

### Gateway の起動

Onboarding でデーモンをインストールした場合、Gateway は自動起動します。手動制御：

```bash
openclaw gateway status          # ステータス確認
openclaw gateway stop            # 停止
openclaw gateway --port 18789 --verbose  # フォアグラウンドデバッグモード
```

### コントロールパネルを開く

```bash
openclaw dashboard    # ブラウザでコントロールパネルを開く
```

コントロールパネルのアドレスはデフォルトで `http://127.0.0.1:18789/` で、Gateway トークンを入力してログインします。

### メッセージ送信

```bash
# 指定したチャネルへメッセージ送信
openclaw message send --target +123****7890 --message "Hello from OpenClaw"

# アシスタントと会話（接続済みチャネルに配信可能）
openclaw agent --message "クイックソートを書いて" --thinking high
```

### フォアグラウンドデバッグモード

```bash
# デーモンを停止
openclaw gateway stop

# フォアグラウンドで起動、詳細ログ付き
openclaw gateway --port 18789 --verbose
```

### アップデート

```bash
openclaw update              # 最新安定版に更新
openclaw update --channel dev  # 開発版に切り替え
openclaw update --channel stable  # 安定版に戻す
openclaw doctor              # 更新後にヘルスチェックを実行
```

## コア機能の詳細

### メッセージチャネル（Channels）

OpenClaw は 20 以上のメッセージングプラットフォームをサポートしており、これが中核的な強みです：

| プラットフォーム | 説明 |
|------|------|
| WhatsApp | Baileys ライブラリ経由、QR コードでペアリング |
| Telegram | Bot Token、最も設定が簡単 |
| Discord | Bot Token + Message Content Intent が必要 |
| Slack | Bot Token + App Token |
| Google Chat | エンタープライズユーザー向け |
| Signal | signal-cli 経由 |
| iMessage | BlueBubbles 経由 |
| IRC | 従来の IRC プロトコル |
| Microsoft Teams | エンタープライズユーザー向け |
| Matrix | 分散型チャット |
| 飛書 (Feishu) | エンタープライズ IM |
| LINE | 日本/東南アジアで普及 |
| Mattermost | オープンソース Slack 代替 |
| Nextcloud Talk | セルフホスト |
| WeChat (微信) | サポート |
| QQ | サポート |
| WebChat | Web チャット |
| Twitch | ライブ配信チャット |
| Zalo | ベトナムで普及 |
| Nostr | 分散型プロトコル |

**チャネル設定例**（Telegram）：

```json5
{
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowFrom: ["123456789", "987654321"],  // 許可するユーザー ID
    },
  },
}
```

**DM セキュリティポリシー**：

デフォルトの動作は `dmPolicy: "pairing"` です - 未知の送信者にはペアリングコードが送られ、Bot はそのメッセージを処理しません。ペアリングを承認した後に送信者がホワイトリストに追加されます。

```bash
# ペアリングを承認
openclaw pairing approve telegram ABC123
```

パブリック DM を開放する必要がある場合、明示的に設定します：

```json5
{
  channels: {
    telegram: {
      dmPolicy: "open",
      allowFrom: ["*"],
    },
  },
}
```

**マルチチャネルルーティング**：異なるチャネルを異なる Agent にルーティングできます：

```json5
{
  agents: {
    defaults: { workspace: "~/.openclaw/workspace" },
    shopping: { workspace: "~/.openclaw/shopping-agent" },
    coding: { workspace: "~/.openclaw/coding-agent" },
  },
  channels: {
    whatsapp: {
      allowFrom: ["+155****0123"],
      agent: "shopping",  // WhatsApp メッセージは買い物 Agent にルーティング
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
      allowFrom: ["123456789"],
      agent: "coding",  // Discord メッセージはコーディング Agent にルーティング
    },
  },
}
```

### ワークスペースと人格

OpenClaw のワークスペースは Agent のアイデンティティと振る舞いを定義します：

| ファイル | 役割 |
|------|------|
| `SOUL.md` | アシスタントの人格定義、AI の思考方式と作業境界を決定 |
| `MEMORY.md` | 長期記憶、セッション間で保持 |
| `USER.md` | ユーザープロファイル、ユーザーの偏好や情報を記録 |
| `AGENTS.md` | ワークスペース指示、システムプロンプトに類似 |
| `IDENTITY.md` | アイデンティティ情報（非推奨、SOUL.md に統合推奨） |
| `TOOLS.md` | ツール指示（OpenClaw はツール説明を内蔵） |

ワークスペースパスの設定：

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      // マルチ Agent シナリオでは workspace-{agentId} を使用
    },
  },
}
```

### スキルシステム（Skills）

スキルは再利用可能なワークフローで、ClawHub スキルマーケットプレイス経由で配布されます。

**スキルソース**（4 階層）：

| ソース | パス | 説明 |
|------|------|------|
| ワークスペーススキル | `workspace/skills/` | 現在のワークスペース専用 |
| グローバルスキル | `~/.openclaw/skills/` | すべての Agent で共有 |
| 個人クロスプロジェクト | `~/.agents/skills/` | ツール間で共有 |
| プロジェクトレベル共有 | `workspace/.agents/skills/` | プロジェクトチームで共有 |

**スキルマーケットプレイス**：[https://clawhub.ai](https://clawhub.ai) にアクセスしてスキルを閲覧・インストール。

### ツールシステム

OpenClaw は複数のツールを内蔵しています：

| ツール | 機能 |
|------|------|
| bash | Shell コマンド実行 |
| process | プロセス管理 |
| read / write / edit | ファイル操作 |
| browser | ブラウザ自動化 |
| canvas | Live Canvas ビジュアライズ |
| nodes | ノードデバイス制御 |
| cron | 定期タスク |
| sessions | セッション管理 |
| discord / slack | プラットフォーム固有操作 |

**ツールポリシーとサンドボックス**：

```json5
{
  agents: {
    defaults: {
      sandbox: {
        // サンドボックスモード：non-main セッションはサンドボックス内で実行
        mode: "non-main",
        backend: "docker",  // docker / ssh / openshell
        docker: {
          image: "openclaw/sandbox:latest",
        },
      },
    },
  },
}
```

典型的なサンドボックスデフォルトポリシー：`bash`、`process`、`read`、`write`、`edit`、`sessions_*` を許可；`browser`、`canvas`、`nodes`、`cron`、`discord`、`gateway` を拒否。

### 音声機能

OpenClaw の音声能力は他のほとんどの Agent より強力です：

| 機能 | プラットフォーム | 説明 |
|------|------|------|
| Voice Wake | macOS / iOS | ウェイクワードでアシスタントを起動 |
| Talk Mode | Android | 連続音声会話 |
| TTS | 全プラットフォーム | テキスト読み上げ（ElevenLabs + システム TTS） |

TTS 設定：

```json5
{
  messages: {
    tts: {
      providers: {
        elevenlabs: {
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          modelId: "eleven_multilingual_v2",
        },
        // またはシステム TTS を使用
        microsoft: {
          voice: "en-US-AriaNeural",
        },
      },
    },
  },
}
```

### Live Canvas

Live Canvas は OpenClaw 独自のビジュアルワークスペースで、Agent が UI 要素を駆動できます：

- macOS アプリ内で A2UI プロトコル経由でレンダリング
- Agent はインタラクティブなコンポーネントを作成可能
- データ可視化、ダッシュボード、ワークフロー表示に適用

### MCP サーバー

OpenClaw は MCP（Model Context Protocol）をサポートし、外部ツールに接続します：

```json5
{
  mcp: {
    servers: {
      "my-server": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: {},
        cwd: "/tmp",
        // または HTTP トランスポート
        // url: "https://mcp.example.com/sse",
        tools: {
          include: ["read_file", "write_file"],
          // exclude: ["dangerous_tool"],
        },
      },
    },
  },
}
```

### セッション管理

OpenClaw のセッションシステムはマルチセッションとセッション間通信をサポートします：

```bash
# セッションツール
openclaw agent --message "list sessions"  # セッション一覧
```

セッションリセットポリシーの設定：

```json5
{
  session: {
    reset: {
      mode: "daily",        // "daily" / "idle" / 両方
      atHour: 0,            // daily モード：毎日 0 時にリセット
      idleMinutes: 30,      // idle モード：30 分間活動なしでリセット
    },
    // または簡略形式
    // resetTriggers: ["daily", "idle"],
  },
}
```

### Cron 定期タスク

```json5
{
  // 設定ファイルで定義
  // または openclaw コマンドで管理
}
```

Webhook と Cron による自動化：

- **Cron Jobs**：定期タスク実行
- **Webhooks**：イベント駆動トリガー
- **Gmail Pub/Sub**：メールトリガー自動化

### 認証とセキュリティ

**認証設定**：

```json5
{
  gateway: {
    auth: {
      token: "${HERMES_GATEWAY_TOKEN}",  // Gateway アクセストークン
    },
  },
}
```

**セキュリティのベストプラクティス**：
- デフォルトの DM ペアリングモードで、見知らぬ人による悪用を防止
- 非メインセッションはサンドボックス内で実行
- `openclaw doctor` でセキュリティ設定をチェック
- リモート公開前に Gateway 公開運用マニュアルを読むこと

## セッション内チャットコマンド

メッセージングプラットフォームやコントロールパネルでアシスタントと会話する際、スラッシュコマンドで動作を制御します：

### セッション制御

```
/status              Gateway とセッションの状態を確認
/new                 新しいセッションを開始
/reset               現在のセッションをリセット
/compact             コンテキストを圧縮
/think <level>       思考深度を設定（off/low/medium/high）
/verbose on|off      詳細出力のオン/オフ
/trace on|off        呼び出しトレースのオン/オフ
/usage off|tokens|full  Token 使用量を確認
/restart             Gateway を再起動
/activation mention|always  起動モードを設定
```

- `activation mention`：@メンションが必要な場合のみ応答（グループチャットのデフォルト）
- `activation always`：すべてのメッセージに常に応答

## 活用テクニックとベストプラクティス

### 1. モデル選択戦略

OpenClaw のモデル設定はフェイルオーバーチェーンをサポートします：

```json5
{
  agents: {
    defaults: {
      model: {
        primary: "claude-sonnet-4-20250514",
        fallbacks: ["gpt-4o", "gemini-2.0-flash"],
      },
    },
  },
}
```

シナリオ別の推奨：

| シナリオ | 推奨モデル | 理由 |
|------|---------|------|
| コード作成 | Claude Sonnet/Opus | コード生成能力が高い |
| 日常会話 | GPT-4o | 高速 |
| 音声会話 | Gemini 2.0 Flash | 低遅延 |
| 長文書処理 | Claude（200K コンテキスト） | コンテキストウィンドウが大きい |
| ローカルデプロイ | Ollama + Qwen2.5 | API 費用なし |

### 2. マルチ Agent アーキテクチャ

OpenClaw はマルチ Agent ルーティングをネイティブサポートしており、これが中核的な強みの一つです：

```json5
{
  agents: {
    defaults: { workspace: "~/.openclaw/workspace" },
    work: {
      workspace: "~/.openclaw/work-agent",
      model: "claude-sonnet-4-20250514",
    },
    personal: {
      workspace: "~/.openclaw/personal-agent",
      model: "gpt-4o",
    },
  },
  channels: {
    slack: {
      botToken: "${SLACK_BOT_TOKEN}",
      agent: "work",  // Slack -> 仕事 Agent
    },
    whatsapp: {
      allowFrom: ["+155****0123"],
      agent: "personal",  // WhatsApp -> 個人 Agent
    },
  },
}
```

各 Agent は以下を持ちます：
- 独立したワークスペース（SOUL.md、MEMORY.md）
- 独立したモデル設定
- 独立したセッション履歴
- 独立したスキルセット

### 3. コンテキスト圧縮

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "auto",     // "auto" / "off"
        model: "gpt-4o-mini",  // 圧縮用モデル（任意）
      },
    },
  },
}
```

### 4. 思考深度の制御

異なるタスクには異なる思考深度が適しています：

```bash
# 簡単な質問、素早く回答
openclaw agent --message "今日の天気は？" --thinking off

# 複雑な推論
openclaw agent --message "このアーキテクチャのスケーラビリティ問題を分析して" --thinking high
```

またはチャット内で動的に切り替え：

```
/think high
マイクロサービスアーキテクチャの設計案を作って
```

### 5. セキュリティ強化

**リモート公開前のチェックリスト**：

1. `openclaw doctor` を実行してセキュリティ設定をチェック
2. DM ペアリングモードが有効（デフォルト）であることを確認
3. `allowFrom` ホワイトリストを設定
4. サンドボックスを有効化（非メインセッション）
5. Gateway 認証トークンを設定
6. ファイアウォールルールを設定

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main",
        backend: "docker",
      },
    },
  },
  gateway: {
    auth: {
      token: "${GATEWAY_TOKEN}",
    },
  },
  channels: {
    telegram: {
      dmPolicy: "pairing",
      allowFrom: ["123456789"],
    },
  },
}
```

### 6. パフォーマンス最適化

```json5
{
  agents: {
    defaults: {
      timeoutSeconds: 900,  // 最大実行時間（秒）
      humanDelay: {
        mode: "natural",   // "natural" / "custom" / "off"
        minMs: 500,        // カスタムモードでの最小遅延
        maxMs: 2000,       // 最大遅延
      },
    },
  },
}
```

`humanDelay` は人間のタイピング遅延をシミュレートし、返信をより自然にします。自動化シナリオでは `off` に設定します。

### 7. ノードデバイス

OpenClaw のノードアプリはアシスタントの能力を拡張します：

- **macOS ノード**：Voice Wake、Live Canvas、Camera キャプチャ
- **iOS ノード**：音声会話、位置コマンド、メディア理解
- **Android ノード**：Talk Mode、連続音声

ノードアプリはあなたの Gateway に接続し、追加の API Key は不要です。

### 8. Hermes からの移行

以前に Hermes Agent を使用していた場合、OpenClaw は移行パスを提供します：

```bash
# 移行ガイドを参照
# https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

逆に、OpenClaw から Hermes への移行：

```bash
hermes claw migrate              # インタラクティブ移行
hermes claw migrate --dry-run    # プレビューのみ実行しない
hermes claw migrate --preset full --migrate-secrets --yes  # 完全移行
```

移行内容には：SOUL.md、記憶、スキル、チャネル設定、API Key、MCP サーバー設定などが含まれます。

## トラブルシューティング

### インストールの問題

**問題：Node.js バージョンが古い**

```bash
node --version  # バージョンを確認
# 22.19+ または 24+ が必要
# nvm で推奨バージョンをインストール
nvm install 24
nvm use 24
```

**問題：pnpm インストール後にビルドスクリプトがブロックされる**

```bash
pnpm approve-builds -g  # ビルドスクリプトを承認
```

**問題：Docker ビルドで OOM（exit 137）**

ホストのメモリが 2GB 未満です。ローカルビルドの代わりにビルド済みイメージを使用：

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

### Gateway の問題

**Gateway が実行されていない**：

```bash
openclaw gateway status     # ステータスを確認
openclaw gateway stop       # 確実に停止
openclaw gateway --port 18789 --verbose  # フォアグラウンドデバッグ
```

**デーモンがインストールされていない**：

```bash
openclaw onboard --install-daemon  # デーモンを再インストール
```

**ポート競合**：

```bash
# 別のポートを使用
openclaw gateway --port 18790
```

### チャネルの問題

**Telegram Bot が応答しない**：
1. Bot Token が正しいか確認
2. `allowFrom` にあなたのユーザー ID が含まれているか確認
3. DM ペアリング状態を確認

**WhatsApp の再ペアリングが必要**：

WhatsApp は QR コードでペアリング（Baileys）を使用し、Token 移行ではありません。`openclaw configure` を実行して再ペアリングします。

**Discord Bot が DM でのみ動作する**：

Discord Developer Portal で Message Content Intent を有効にする必要があります。

### 設定の問題

**設定ファイルの構文エラー**：

OpenClaw は JSON5 フォーマットを使用し、コメントと末尾カンマをサポートします。ただし構文が正しいことを確認する必要があります：

```bash
# 設定を検証
openclaw config get agents.defaults.workspace
# エラーが出る場合、openclaw.json の構文を確認
```

**API Key が見つからない**：

Key は複数の場所に保存されている可能性があります：
1. `openclaw.json` の `models.providers.*.apiKey`
2. `~/.openclaw/.env` ファイル
3. `openclaw.json` の `env` サブオブジェクト
4. `agents/main/agent/auth-profiles.json`

`openclaw doctor` で全場所をチェックします。

## CLI コマンドクイックリファレンス

```
# インストールとアップデート
openclaw onboard              # Onboarding ウィザード
openclaw onboard --install-daemon  # デーモンをインストール
openclaw update               # 最新版に更新
openclaw update --channel dev  # 開発版に切り替え
openclaw doctor               # ヘルスチェック

# Gateway 制御
openclaw gateway status       # ステータス確認
openclaw gateway stop         # 停止
openclaw gateway --port 18789 --verbose  # フォアグラウンドデバッグ
openclaw dashboard            # コントロールパネルを開く

# 設定
openclaw configure            # 設定ウィザード
openclaw config get KEY       # 設定の読み取り
openclaw config set KEY VAL   # 設定のセット
openclaw config unset KEY     # 設定の削除

# メッセージと会話
openclaw message send --target +123 --message "Hello"  # メッセージ送信
openclaw agent --message "質問" --thinking high         # アシスタントと会話

# セキュリティ
openclaw pairing approve <channel> <code>  # DM ペアリングを承認

# 移行（Hermes から OpenClaw への移行）
# 参照 https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

## OpenClaw vs Hermes：どちらを選ぶか

| 次元 | OpenClaw を選ぶ | Hermes を選ぶ |
|------|-----------|----------|
| メッセージングプラットフォーム数 | 20 以上のチャネルが必要（iMessage、LINE、QQ など） | 15 以上のチャネルで十分 |
| 音声インタラクション | Voice Wake / Talk Mode が必要 | STT + TTS で十分 |
| ビジュアライズ | Live Canvas が必要 | Dashboard で十分 |
| 言語エコシステム | TypeScript/Node.js を好む | Python を好む |
| マルチ Agent | ネイティブマルチ Agent ルーティング | Profile システム |
| 自己進化 | スキルマーケット | Skills + Curator 自動メンテナンス |
| 永続記憶 | MEMORY.md + USER.md | 構造化記憶システム |
| MCP サポート | あり | あり |
| 移行ツール | Hermes からの移入 | OpenClaw からの移入 |

両プロジェクトは互いに移行ツールを提供しており、いつでも切り替え可能です。

## まとめ

OpenClaw は機能豊富な個人 AI アシスタントフレームワークで、中核的な強みは以下の通りです：

1. **マルチチャネルカバー** - 20 以上のメッセージングプラットフォーム、1 つのアシスタントですべてのコミュニケーションチャネルをカバー
2. **マルチ Agent ルーティング** - 異なるチャネルを異なる Agent にルーティング、それぞれ独立
3. **ローカルファースト** - データはあなたのデバイスに留まり、プライバシーが保護
4. **音声とビジュアライズ** - Voice Wake、Talk Mode、Live Canvas
5. **セキュアなデフォルト** - DM ペアリング、サンドボックス、ホワイトリスト

習得パス：インストール -> Onboarding -> チャネル設定 -> テスト会話 -> 必要に応じてスキルと自動化を追加。

公式ドキュメント：https://docs.openclaw.ai

GitHub リポジトリ：https://github.com/openclaw/openclaw

スキルマーケット：https://clawhub.ai
