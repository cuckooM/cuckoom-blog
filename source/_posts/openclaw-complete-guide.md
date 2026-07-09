---
title: OpenClaw 完全指南：从安装到玩转
date: 2026-07-09 15:00:00
tags:
  - AI
  - OpenClaw
  - 教程
  - 自动化
  - LLM
categories:
  - 技术实践
---

OpenClaw 是一款开源的个人 AI 助手框架，运行在你自己的设备上。它基于 TypeScript 构建，通过 Gateway 连接你日常使用的消息渠道，让你在 WhatsApp、Telegram、Slack、Discord 等 20+ 个平台上与 AI 助手对话。

这篇文章的目标和 Hermes 指南一样：**只看这一篇，就能玩转 OpenClaw**。从安装部署到使用技巧，全覆盖。

<!-- more -->

## OpenClaw 是什么

OpenClaw 的核心理念是"个人 AI 助手"——你运行在自己的设备上，数据由你掌控。它属于自主任务执行 Agent，与 Hermes Agent、Claude Code 属于同一类别，但侧重点不同：

- **本地优先的 Gateway** — 单一控制平面管理会话、渠道、工具和事件，所有数据留在你的设备上
- **多渠道收件箱** — 20+ 个消息平台统一接入，一个助手覆盖所有沟通渠道
- **多 Agent 路由** — 将不同渠道/联系人路由到隔离的 Agent 实例，每个 Agent 有独立的工作空间和会话
- **语音唤醒 + 对话模式** — macOS/iOS 支持唤醒词，Android 支持连续语音对话
- **Live Canvas** — Agent 驱动的可视化工作空间，支持 A2UI 协议
- **伴侣应用** — Windows Hub、macOS 菜单栏应用、iOS/Android 节点应用
- **技能生态** — 通过 ClawHub 技能市场安装和分享技能

OpenClaw 与 Hermes 的关键区别：

| 维度 | OpenClaw | Hermes Agent |
|------|---------|-------------|
| 语言 | TypeScript (Node.js) | Python |
| 安装方式 | npm / 安装脚本 | pip / 安装脚本 |
| 配置格式 | JSON5 (openclaw.json) | YAML (config.yaml) |
| 数据目录 | ~/.openclaw/ | ~/.hermes/ |
| 消息平台数 | 20+ | 15+ |
| 桌面应用 | Windows Hub / macOS 菜单栏 | Hermes Desktop |
| 技能市场 | ClawHub | Hermes Skills Hub |
| 语音 | Voice Wake + Talk Mode | STT + TTS |
| 可视化 | Live Canvas (A2UI) | Dashboard |

## 系统要求

在安装之前，确认你的环境满足以下条件：

| 要求 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 22.19+ 或 24+ | 24 是推荐版本，安装脚本会自动安装 |
| 内存 | 512MB+ | Gateway 本身占用很小 |
| 磁盘 | 200MB+ | 包含依赖和技能 |
| API Key | 任意模型提供商 | Anthropic、OpenAI、Google 等 |

支持的平台：

- macOS（Apple Silicon + Intel）
- Linux（x86_64, aarch64）
- Windows（原生 + WSL2）
- Docker 容器
- Raspberry Pi
- Android（通过 Termux 或节点应用）
- iOS（通过节点应用）

## 安装指南

### 1. macOS / Linux / WSL2

一行命令安装（推荐）：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

安装脚本会自动完成以下步骤：
1. 检测操作系统和包管理器
2. 安装 Node.js 24（如缺失或版本过低）
3. 全局安装 OpenClaw 包
4. 启动交互式 Onboarding 向导

安装完成后，运行 Onboarding：

```bash
openclaw onboard --install-daemon
```

Onboarding 向导会引导你完成：
- 选择模型提供商并输入 API Key
- 配置 Gateway（生成令牌、设置端口）
- 选择消息渠道（可跳过，后续配置）
- 安装 Gateway 守护进程（launchd/systemd 用户服务）

**跳过 Onboarding**（CI/自动化场景）：

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

**本地前缀安装**（不依赖系统 Node.js）：

```bash
curl -fsSL https://openclaw.ai/install-cli.sh | bash
```

这会将 OpenClaw 和 Node.js 安装到 `~/.openclaw/` 目录下，不污染系统环境。

### 2. Windows

**方式一：Windows Hub 桌面应用（推荐）**

访问 [https://docs.openclaw.ai/platforms/windows](https://docs.openclaw.ai/platforms/windows) 下载 Windows Hub 安装包。它提供图形界面设置、系统托盘状态、聊天窗口、节点模式和本地 MCP 模式。

**方式二：PowerShell 安装**

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

跳过 Onboarding：

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
```

**方式三：WSL2**

在 WSL2 中使用与 Linux 相同的安装脚本。Gateway 在 WSL2 中运行，Windows 端通过浏览器访问控制面板。

### 3. npm / pnpm / bun 安装

如果你已经管理自己的 Node.js 环境：

```bash
# npm
npm install -g openclaw@latest
openclaw onboard --install-daemon

# pnpm（首次安装后需要批准构建脚本）
pnpm add -g openclaw@latest
pnpm approve-builds -g
openclaw onboard --install-daemon

# bun（实验性）
bun add -g openclaw@latest
openclaw onboard --install-daemon
```

### 4. Docker 部署

Docker 是服务器部署的推荐方式，提供隔离的 Gateway 环境。

**使用预构建镜像**：

```bash
# GHCR（主要注册表）
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# 或 Docker Hub 镜像
export OPENCLAW_IMAGE="openclaw/openclaw:latest"

# 克隆仓库并运行设置脚本
git clone https://github.com/openclaw/openclaw.git
cd openclaw
./scripts/docker/setup.sh
```

设置脚本会自动：
- 拉取/构建 Docker 镜像
- 提示输入提供商 API Key
- 生成 Gateway 令牌并写入 `.env`
- 创建认证密钥目录
- 通过 Docker Compose 启动 Gateway

**离线安装**（气隙环境）：

```bash
# 在有网络的机器上拉取镜像
docker pull ghcr.io/openclaw/openclaw:latest
docker save ghcr.io/openclaw/openclaw:latest -o openclaw-image.tar

# 传输到目标机器后加载
docker load -i openclaw-image.tar
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh --offline
```

**Docker 部署要点**：
- 最低 2GB 内存（`pnpm install` 在 1GB 主机上可能 OOM）
- 官方标签：`main`、`latest`、`<version>`（如 `2026.2.26`）
- `-browser` 变体（如 `latest-browser`）内置 Chromium，适用于沙箱浏览器
- 在 VPS 上部署前，务必阅读安全加固文档
- 控制面板地址：`http://127.0.0.1:18789/`

### 5. 其他平台

**Raspberry Pi**：支持 ARM 架构，使用与 Linux 相同的安装脚本。

**Android (Termux)**：在 Termux 中安装 Node.js 后使用 npm 安装。也可安装 OpenClaw Android 节点应用获得原生体验。

**iOS**：通过 App Store 安装 OpenClaw 节点应用，连接到你的 Gateway。

**Nix**：使用 `github.com/openclaw/nix-openclaw` 提供的 Nix flake。

## 初始配置

安装完成后，Onboarding 向导是配置的主要入口：

```bash
openclaw onboard    # 完整 Onboarding 流程
openclaw configure  # 配置向导（可随时运行修改配置）
```

### 配置文件结构

OpenClaw 使用 JSON5 格式的配置文件：

```
~/.openclaw/
├── openclaw.json          # 主配置文件（JSON5）
├── .env                   # API 密钥和敏感信息
├── workspace/             # 默认工作空间
│   ├── SOUL.md            # 助手人格定义
│   ├── MEMORY.md          # 长期记忆
│   ├── USER.md            # 用户画像
│   ├── AGENTS.md          # 工作空间指令
│   └── skills/            # 工作空间技能
├── skills/                # 全局技能目录
├── agents/                # 多 Agent 配置
│   └── main/              # 主 Agent
│       └── agent/
│           └── auth-profiles.json  # 认证配置
└── credentials/           # 渠道凭据
```

配置文件不存在时使用安全默认值。配置文件必须是常规文件（不能是符号链接，因为 OpenClaw 使用原子替换写入）。

如果配置文件在非默认位置，设置环境变量：

```bash
export OPENCLAW_CONFIG_PATH=/path/to/openclaw.json
```

### CLI 配置命令

```bash
# 读取配置值
openclaw config get agents.defaults.workspace

# 设置配置值
openclaw config set agents.defaults.heartbeat.every "2h"

# 删除配置值
openclaw config unset plugins.example

# 交互式配置向导
openclaw configure
```

### 最小配置示例

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

### 模型和提供商配置

OpenClaw 支持多种模型提供商，通过 `models.providers` 配置：

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
      // 自定义端点（连接 vLLM / Ollama 等）
      local: {
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        apiType: "openai",
      },
    },
  },
  agents: {
    defaults: {
      // 单模型
      model: "claude-sonnet-4-20250514",
      // 或带故障转移的模型链
      // model: {
      //   primary: "claude-sonnet-4-20250514",
      //   fallbacks: ["gpt-4o", "gemini-2.0-flash"],
      // },
    },
  },
}
```

**模型故障转移**：配置 `primary` 和 `fallbacks`，主模型不可用时自动切换。

**密钥存储**：API Key 支持三种格式：

```json5
// 1. 纯字符串
"apiKey": "sk-ant-xxx..."

// 2. 环境变量引用
"apiKey": "${ANTHROPIC_API_KEY}"

// 3. SecretRef 对象（高级）
"apiKey": { "source": "env", "id": "ANTHROPIC_API_KEY" }
```

推荐使用环境变量引用格式，密钥存储在 `~/.openclaw/.env` 文件中。

### 健康检查

```bash
openclaw doctor       # 检查配置、依赖和安全设置
openclaw gateway status  # 检查 Gateway 运行状态
```

`openclaw doctor` 会检查：
- Node.js 版本
- 配置文件完整性
- API Key 是否设置
- DM 安全策略是否合理
- 沙箱配置是否安全

## 基本使用

### 启动 Gateway

Onboarding 已安装守护进程时，Gateway 自动启动。手动控制：

```bash
openclaw gateway status          # 查看状态
openclaw gateway stop            # 停止
openclaw gateway --port 18789 --verbose  # 前台调试模式
```

### 打开控制面板

```bash
openclaw dashboard    # 在浏览器中打开控制面板
```

控制面板地址默认为 `http://127.0.0.1:18789/`，需要输入 Gateway 令牌登录。

### 发送消息

```bash
# 发送消息到指定渠道
openclaw message send --target +1234567890 --message "Hello from OpenClaw"

# 与助手对话（可投递到已连接的渠道）
openclaw agent --message "帮我写一个快速排序" --thinking high
```

### 前台调试模式

```bash
# 停止守护进程
openclaw gateway stop

# 前台启动，带详细日志
openclaw gateway --port 18789 --verbose
```

### 更新

```bash
openclaw update              # 更新到最新稳定版
openclaw update --channel dev  # 切换到开发版
openclaw update --channel stable  # 切换回稳定版
openclaw doctor              # 更新后运行健康检查
```

## 核心功能详解

### 消息渠道（Channels）

OpenClaw 支持 20+ 个消息平台，这是它的核心优势：

| 平台 | 说明 |
|------|------|
| WhatsApp | 通过 Baileys 库，QR 码配对 |
| Telegram | Bot Token，最易配置 |
| Discord | 需要 Bot Token + Message Content Intent |
| Slack | Bot Token + App Token |
| Google Chat | 企业用户 |
| Signal | 通过 signal-cli |
| iMessage | 通过 BlueBubbles |
| IRC | 传统 IRC 协议 |
| Microsoft Teams | 企业用户 |
| Matrix | 去中心化聊天 |
| 飞书 (Feishu) | 企业 IM |
| LINE | 日本/东南亚常用 |
| Mattermost | 开源 Slack 替代 |
| Nextcloud Talk | 自托管 |
| WeChat (微信) | 支持 |
| QQ | 支持 |
| WebChat | 网页聊天 |
| Twitch | 直播聊天 |
| Zalo | 越南常用 |
| Nostr | 去中心化协议 |

**渠道配置示例**（Telegram）：

```json5
{
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowFrom: ["123456789", "987654321"],  // 允许的用户 ID
    },
  },
}
```

**DM 安全策略**：

默认行为是 `dmPolicy: "pairing"` — 未知发送者收到配对码，Bot 不处理其消息。批准配对后发送者才被加入白名单。

```bash
# 批准配对
openclaw pairing approve telegram ABC123
```

如果需要开放公共 DM，显式设置：

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

**多渠道路由**：不同渠道可以路由到不同 Agent：

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
      agent: "shopping",  // WhatsApp 消息路由到购物 Agent
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
      allowFrom: ["123456789"],
      agent: "coding",  // Discord 消息路由到编码 Agent
    },
  },
}
```

### 工作空间和人格

OpenClaw 的工作空间定义了 Agent 的身份和行为：

| 文件 | 作用 |
|------|------|
| `SOUL.md` | 助手人格定义，决定 AI 的思维方式和工作边界 |
| `MEMORY.md` | 长期记忆，跨会话保持 |
| `USER.md` | 用户画像，记录用户偏好和信息 |
| `AGENTS.md` | 工作空间指令，类似系统提示 |
| `IDENTITY.md` | 身份信息（已弃用，建议合并到 SOUL.md） |
| `TOOLS.md` | 工具指令（OpenClaw 内置了工具说明） |

工作空间路径配置：

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      // 多 Agent 场景下使用 workspace-{agentId}
    },
  },
}
```

### 技能系统（Skills）

技能是可复用的工作流程，通过 ClawHub 技能市场分发。

**技能来源**（4 个层级）：

| 来源 | 路径 | 说明 |
|------|------|------|
| 工作空间技能 | `workspace/skills/` | 当前工作空间专属 |
| 全局技能 | `~/.openclaw/skills/` | 所有 Agent 共享 |
| 个人跨项目 | `~/.agents/skills/` | 跨工具共享 |
| 项目级共享 | `workspace/.agents/skills/` | 项目团队共享 |

**技能市场**：访问 [https://clawhub.ai](https://clawhub.ai) 浏览和安装技能。

### 工具系统

OpenClaw 内置多种工具：

| 工具 | 功能 |
|------|------|
| bash | Shell 命令执行 |
| process | 进程管理 |
| read / write / edit | 文件操作 |
| browser | 浏览器自动化 |
| canvas | Live Canvas 可视化 |
| nodes | 节点设备控制 |
| cron | 定时任务 |
| sessions | 会话管理 |
| discord / slack | 平台特定操作 |

**工具策略和沙箱**：

```json5
{
  agents: {
    defaults: {
      sandbox: {
        // 沙箱模式：non-main 会话在沙箱中运行
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

典型沙箱默认策略：允许 `bash`、`process`、`read`、`write`、`edit`、`sessions_*`；拒绝 `browser`、`canvas`、`nodes`、`cron`、`discord`、`gateway`。

### 语音功能

OpenClaw 的语音能力比大多数 Agent 更强：

| 功能 | 平台 | 说明 |
|------|------|------|
| Voice Wake | macOS / iOS | 唤醒词激活助手 |
| Talk Mode | Android | 连续语音对话 |
| TTS | 全平台 | 文字转语音（ElevenLabs + 系统 TTS） |

TTS 配置：

```json5
{
  messages: {
    tts: {
      providers: {
        elevenlabs: {
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          modelId: "eleven_multilingual_v2",
        },
        // 或使用系统 TTS
        microsoft: {
          voice: "en-US-AriaNeural",
        },
      },
    },
  },
}
```

### Live Canvas

Live Canvas 是 OpenClaw 独有的可视化工作空间，Agent 可以驱动 UI 元素：

- macOS 应用中通过 A2UI 协议渲染
- Agent 可以创建交互式组件
- 适用于数据可视化、仪表盘、工作流展示

### MCP 服务器

OpenClaw 支持 MCP（Model Context Protocol）连接外部工具：

```json5
{
  mcp: {
    servers: {
      "my-server": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: {},
        cwd: "/tmp",
        // 或 HTTP 传输
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

### 会话管理

OpenClaw 的会话系统支持多会话和会话间通信：

```bash
# 会话工具
openclaw agent --message "list sessions"  # 列出会话
```

会话重置策略配置：

```json5
{
  session: {
    reset: {
      mode: "daily",        // "daily" / "idle" / 两者
      atHour: 0,            // daily 模式：每天 0 点重置
      idleMinutes: 30,      // idle 模式：30 分钟无活动重置
    },
    // 或使用简化形式
    // resetTriggers: ["daily", "idle"],
  },
}
```

### Cron 定时任务

```json5
{
  // 在配置文件中定义
  // 或通过 openclaw 命令管理
}
```

通过 Webhook 和 Cron 实现自动化：

- **Cron Jobs**：定时执行任务
- **Webhooks**：事件驱动触发
- **Gmail Pub/Sub**：邮件触发自动化

### 认证和安全

**认证配置**：

```json5
{
  gateway: {
    auth: {
      token: "${HERMES_GATEWAY_TOKEN}",  // Gateway 访问令牌
    },
  },
}
```

**安全最佳实践**：
- 默认 DM 配对模式，防止陌生人滥用
- 非主会话在沙箱中运行
- 使用 `openclaw doctor` 检查安全配置
- 远程暴露前阅读 Gateway 暴露运行手册

## 会话内聊天命令

在消息平台或控制面板中与助手对话时，使用斜杠命令控制行为：

### 会话控制

```
/status              查看 Gateway 和会话状态
/new                 开启新会话
/reset               重置当前会话
/compact             压缩上下文
/think <level>       设置思考深度（off/low/medium/high）
/verbose on|off      开关详细输出
/trace on|off        开关调用追踪
/usage off|tokens|full  查看 Token 使用量
/restart             重启 Gateway
/activation mention|always  设置激活模式
```

- `activation mention`：需要 @提及才响应（群聊默认）
- `activation always`：始终响应所有消息

## 使用技巧与最佳实践

### 1. 模型选择策略

OpenClaw 的模型配置支持故障转移链：

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

不同场景推荐：

| 场景 | 推荐模型 | 原因 |
|------|---------|------|
| 代码编写 | Claude Sonnet/Opus | 代码生成能力强 |
| 日常对话 | GPT-4o | 速度快 |
| 语音对话 | Gemini 2.0 Flash | 低延迟 |
| 长文档处理 | Claude（200K 上下文） | 上下文窗口大 |
| 本地部署 | Ollama + Qwen2.5 | 无 API 费用 |

### 2. 多 Agent 架构

OpenClaw 原生支持多 Agent 路由，这是它的核心优势之一：

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
      agent: "work",  // Slack -> 工作 Agent
    },
    whatsapp: {
      allowFrom: ["+155****0123"],
      agent: "personal",  // WhatsApp -> 个人 Agent
    },
  },
}
```

每个 Agent 拥有：
- 独立的工作空间（SOUL.md、MEMORY.md）
- 独立的模型配置
- 独立的会话历史
- 独立的技能集

### 3. 上下文压缩

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "auto",     // "auto" / "off"
        model: "gpt-4o-mini",  // 压缩用模型（可选）
      },
    },
  },
}
```

### 4. 思考深度控制

不同任务适合不同的思考深度：

```bash
# 简单问题，快速回答
openclaw agent --message "今天天气怎样" --thinking off

# 复杂推理
openclaw agent --message "分析这个架构的扩展性问题" --thinking high
```

或在聊天中动态切换：

```
/think high
帮我设计一个微服务架构方案
```

### 5. 安全加固

**远程暴露前的检查清单**：

1. 运行 `openclaw doctor` 检查安全配置
2. 确保 DM 配对模式开启（默认）
3. 配置 `allowFrom` 白名单
4. 启用沙箱（非主会话）
5. 设置 Gateway 认证令牌
6. 配置防火墙规则

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

### 6. 性能优化

```json5
{
  agents: {
    defaults: {
      timeoutSeconds: 900,  // 最大执行时间（秒）
      humanDelay: {
        mode: "natural",   // "natural" / "custom" / "off"
        minMs: 500,        // 自定义模式下的最小延迟
        maxMs: 2000,       // 最大延迟
      },
    },
  },
}
```

`humanDelay` 模拟人类打字延迟，让回复更自然。在自动化场景中设为 `off`。

### 7. 节点设备

OpenClaw 的节点应用扩展了助手的能力：

- **macOS 节点**：Voice Wake、Live Canvas、Camera 捕获
- **iOS 节点**：语音对话、位置命令、媒体理解
- **Android 节点**：Talk Mode、连续语音

节点应用连接到你的 Gateway，不需要额外的 API Key。

### 8. 从 Hermes 迁移

如果你之前使用 Hermes Agent，OpenClaw 提供了迁移路径：

```bash
# 查看迁移指南
# https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

反之，从 OpenClaw 迁移到 Hermes：

```bash
hermes claw migrate              # 交互式迁移
hermes claw migrate --dry-run    # 预览不执行
hermes claw migrate --preset full --migrate-secrets --yes  # 完整迁移
```

迁移内容包括：SOUL.md、记忆、技能、渠道配置、API Key、MCP 服务器配置等。

## 故障排查

### 安装问题

**问题：Node.js 版本过低**

```bash
node --version  # 检查版本
# 需要 22.19+ 或 24+
# 使用 nvm 安装推荐版本
nvm install 24
nvm use 24
```

**问题：pnpm 安装后构建脚本被阻止**

```bash
pnpm approve-builds -g  # 批准构建脚本
```

**问题：Docker 构建 OOM（exit 137）**

主机内存不足 2GB。使用预构建镜像替代本地构建：

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

### Gateway 问题

**Gateway 未运行**：

```bash
openclaw gateway status     # 检查状态
openclaw gateway stop       # 确保停止
openclaw gateway --port 18789 --verbose  # 前台调试
```

**守护进程未安装**：

```bash
openclaw onboard --install-daemon  # 重新安装守护进程
```

**端口冲突**：

```bash
# 使用其他端口
openclaw gateway --port 18790
```

### 渠道问题

**Telegram Bot 不响应**：
1. 检查 Bot Token 是否正确
2. 确认 `allowFrom` 包含你的用户 ID
3. 检查 DM 配对状态

**WhatsApp 需要重新配对**：

WhatsApp 使用 QR 码配对（Baileys），不是 Token 迁移。运行 `openclaw configure` 重新配对。

**Discord Bot 只在 DM 中工作**：

需要在 Discord Developer Portal 中开启 Message Content Intent。

### 配置问题

**配置文件语法错误**：

OpenClaw 使用 JSON5 格式，支持注释和尾逗号。但仍需确保语法正确：

```bash
# 验证配置
openclaw config get agents.defaults.workspace
# 如果报错，检查 openclaw.json 语法
```

**API Key 未找到**：

Key 可能存储在多个位置：
1. `openclaw.json` 中的 `models.providers.*.apiKey`
2. `~/.openclaw/.env` 文件
3. `openclaw.json` 的 `env` 子对象
4. `agents/main/agent/auth-profiles.json`

使用 `openclaw doctor` 检查所有位置。

## CLI 命令速查表

```
# 安装和更新
openclaw onboard              # Onboarding 向导
openclaw onboard --install-daemon  # 安装守护进程
openclaw update               # 更新到最新版
openclaw update --channel dev  # 切换到开发版
openclaw doctor               # 健康检查

# Gateway 控制
openclaw gateway status       # 查看状态
openclaw gateway stop         # 停止
openclaw gateway --port 18789 --verbose  # 前台调试
openclaw dashboard            # 打开控制面板

# 配置
openclaw configure            # 配置向导
openclaw config get KEY       # 读取配置
openclaw config set KEY VAL   # 设置配置
openclaw config unset KEY     # 删除配置

# 消息和对话
openclaw message send --target +123 --message "Hello"  # 发送消息
openclaw agent --message "问题" --thinking high         # 与助手对话

# 安全
openclaw pairing approve <channel> <code>  # 批准 DM 配对

# 迁移（从 Hermes 迁移到 OpenClaw）
# 参见 https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

## OpenClaw vs Hermes：如何选择

| 维度 | 选 OpenClaw | 选 Hermes |
|------|-----------|----------|
| 消息平台数 | 需要 20+ 渠道（iMessage、LINE、QQ 等） | 15+ 渠道够用 |
| 语音交互 | 需要 Voice Wake / Talk Mode | STT + TTS 够用 |
| 可视化 | 需要 Live Canvas | Dashboard 够用 |
| 语言生态 | 偏好 TypeScript/Node.js | 偏好 Python |
| 多 Agent | 原生多 Agent 路由 | Profile 系统 |
| 自我进化 | 技能市场 | Skills + Curator 自动维护 |
| 持久记忆 | MEMORY.md + USER.md | 结构化记忆系统 |
| MCP 支持 | 有 | 有 |
| 迁移工具 | 从 Hermes 迁入 | 从 OpenClaw 迁入 |

两个项目互相提供了迁移工具，可以随时切换。

## 总结

OpenClaw 是一个功能丰富的个人 AI 助手框架，核心优势在于：

1. **多渠道覆盖** — 20+ 消息平台，一个助手覆盖所有沟通渠道
2. **多 Agent 路由** — 不同渠道路由到不同 Agent，各自独立
3. **本地优先** — 数据留在你的设备上，隐私有保障
4. **语音和可视化** — Voice Wake、Talk Mode、Live Canvas
5. **安全默认** — DM 配对、沙箱、白名单

掌握路径：安装 -> Onboarding -> 配置渠道 -> 测试对话 -> 按需添加技能和自动化。

官方文档：https://docs.openclaw.ai

GitHub 仓库：https://github.com/openclaw/openclaw

技能市场：https://clawhub.ai
