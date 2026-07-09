---
title: Hermes Agent 完全指南：从安装到玩转
date: 2026-07-09 14:00:00
tags:
  - AI
  - Hermes
  - 教程
  - 自动化
  - LLM
categories:
  - 技术实践
---

Hermes Agent 是 Nous Research 开发的开源 AI Agent 框架，运行在终端、消息平台和 IDE 中。它可以通过工具调用与你的系统交互，支持 20+ 种 LLM 提供商，能在 Linux、macOS、Windows 和 Docker 上运行。

这篇文章的目标很简单：**只看这一篇，就能玩转 Hermes**。从安装部署到使用技巧，全覆盖。

<!-- more -->

## Hermes 是什么

Hermes 属于自主编码和任务执行 Agent，与 Claude Code、OpenAI Codex 属于同一类别。但它有几个显著区别：

- **通过 Skills 自我进化** — 解决复杂问题后，可将工作流程保存为 Skill，在后续会话中自动加载。随着时间推移，Agent 在你的特定任务上越来越强
- **跨会话持久记忆** — 记住你的偏好、环境信息和经验教训
- **多平台网关** — 同一个 Agent 可运行在 Telegram、Discord、Slack、微信、飞书等 15+ 个平台上，具备完整工具访问能力
- **Provider 无关** — 可中途切换模型和提供商，无需改动其他配置
- **Profile 隔离** — 运行多个独立 Hermes 实例，各自拥有独立配置、会话、技能和记忆
- **高度可扩展** — 支持插件、MCP 服务器、自定义工具、Webhook 触发、Cron 定时任务

## 系统要求

在安装之前，确认你的环境满足以下条件：

| 要求 | 最低版本 | 说明 |
|------|---------|------|
| Python | 3.11+ | 安装脚本会自动安装 |
| Node.js | 22+ | 浏览器工具需要（可选） |
| Git | 任意版本 | 克隆仓库必需 |
| 内存 | 512MB+ | Agent 本身占用很小 |
| 模型上下文 | 64K tokens | 模型必须支持至少 64K 上下文窗口 |

支持的平台（Tier 1）：

- macOS（Apple Silicon）
- Windows 10/11（x86_64, aarch64）
- Linux / WSL2（x86_64, aarch64）
- Docker 容器（x86_64, aarch64）

## 安装指南

### 1. Linux / macOS / WSL2

一行命令安装：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

安装脚本会自动完成以下步骤：
1. 检测操作系统和包管理器
2. 安装 Python 3.11+ 和 Git（如缺失）
3. 克隆 Hermes 仓库到 `~/.hermes/hermes-agent/`
4. 创建 Python 虚拟环境并安装依赖
5. 安装 `hermes` 命令到 `~/.local/bin/`
6. 运行交互式配置向导

安装完成后，重新加载 shell：

```bash
source ~/.bashrc   # 或 source ~/.zshrc
```

**以 root 用户安装时**，Hermes 会使用 FHS 布局：代码放在 `/usr/local/lib/hermes-agent`，命令链接到 `/usr/local/bin/hermes`，数据仍在 `~/.hermes/`。这与 Claude Code / Codex CLI 的行为一致。

**常用安装选项**：

```bash
# 跳过配置向导（CI/自动化场景）
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup

# 不使用虚拟环境
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --no-venv

# 指定分支
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --branch dev
```

### 2. Windows 原生

在 PowerShell 中运行：

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

也可以下载桌面安装程序：访问 [https://hermes-agent.nousresearch.com/](https://hermes-agent.nousresearch.com/) 下载 Hermes Desktop 安装包，它会同时安装 CLI 和桌面应用。

**Windows 注意事项**：

- Alt+Enter 会被 Windows Terminal 拦截用于全屏切换，请使用 Ctrl+Enter 换行
- 如果首次运行出现 HTTP 400 "No models provided"，可能是 config.yaml 被保存为 UTF-8 BOM 格式，用 `hermes config edit` 重新保存即可
- execute_code 沙箱在 Windows 上可能遇到 WinError 10106，通常是因为环境变量 SYSTEMROOT 被清除

### 3. WSL2（Windows Subsystem for Linux）

WSL2 使用与 Linux 相同的安装脚本。但需要确保 WSL2 启用了 systemd：

```bash
# /etc/wsl.conf
[boot]
systemd=true
```

没有 systemd，Gateway 服务会回退到 nohup 模式，在 WSL2 窗口关闭时会退出。

安装命令与 Linux 相同：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### 4. Docker 部署

Docker 是服务器部署的推荐方式。镜像本身无状态，所有数据通过卷挂载持久化。

**首次配置**（交互式）：

```bash
mkdir -p ~/.hermes
docker run -it --rm \
  -v ~/.hermes:/opt/data \
  nousresearch/hermes-agent setup
```

这会进入配置向导，提示输入 API 密钥并写入 `~/.hermes/.env`。只需执行一次。

**Gateway 模式**（后台常驻）：

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  nousresearch/hermes-agent gateway run
```

端口 8642 暴露 Gateway 的 API 服务器和健康检查端点。如果只使用聊天平台（Telegram、Discord 等），可以不映射此端口。

**启用 Web Dashboard**：

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

**Docker 部署要点**：
- 容器内 Gateway 由 s6-overlay 监管，崩溃后自动重启
- 更新方式是拉取新镜像，而非 `hermes update`
- 不要使用 VPS 浏览器控制台执行 docker 命令（特殊字符传输有问题），请通过 SSH 操作
- 如果要暴露 API 服务器，务必设置 `API_SERVER_KEY`：

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

在 Termux 终端中运行与 Linux 相同的安装脚本。安装脚本会自动检测 Termux 环境并使用 Python 标准库 venv + pip（而非 uv）。部分功能在手机上不可用，详见官方 Termux 文档。

## 初始配置

安装完成后，运行配置向导：

```bash
hermes setup
```

配置向导提供三种模式：

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| Quick Setup (Nous Portal) | OAuth 登录，零配置 | 快速上手推荐 |
| Full Setup | 逐步配置所有选项 | 需要精细控制 |
| Blank Slate | 只保留最小必需工具 | 极简控制 |

### 选择 Provider

Hermes 支持 30+ 种 LLM 提供商。使用交互式选择器：

```bash
hermes model
```

常用 Provider 速查：

| Provider | 认证方式 | 环境变量 |
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
| 阿里通义 (DashScope) | API Key | `DASHSCOPE_API_KEY` |
| GitHub Copilot | OAuth / Token | `COPILOT_GITHUB_TOKEN` |
| 自定义端点 | URL + Key | config.yaml 中配置 |

**国内用户推荐**：Z.AI (GLM)、Kimi、MiniMax China、阿里通义都支持国内网络直连。也可以使用自定义端点连接 vLLM、Ollama 等本地模型服务。

**自定义端点配置**（以连接本地 Ollama 为例）：

```bash
hermes config set model.provider custom
hermes config set model.base_url http://localhost:11434/v1
hermes config set model.api_key ollama
hermes config set model.default qwen2.5:32b
hermes config set model.context_length 65536
```

### 配置文件结构

Hermes 将敏感信息和非敏感配置分离：

```
~/.hermes/
├── config.yaml          # 主配置文件（设置）
├── .env                 # API 密钥和密钥
├── skills/              # 已安装的技能
├── sessions/            # 会话记录
├── state.db             # 会话存储（SQLite + FTS5）
├── auth.json            # OAuth 令牌和凭据池
├── logs/                # Gateway 和错误日志
└── hermes-agent/        # 源代码（git 安装方式）
```

查看和修改配置：

```bash
hermes config             # 查看当前配置
hermes config edit        # 用编辑器打开 config.yaml
hermes config set KEY VAL # 设置配置值
hermes config path        # 打印 config.yaml 路径
hermes config check       # 检查配置是否完整
```

### 健康检查

安装完成后，运行诊断工具确认一切正常：

```bash
hermes doctor
```

这会检查 Python 版本、依赖完整性、配置文件、API 密钥等。加 `--fix` 可自动修复部分问题。

## 基本使用

### 启动交互式会话

```bash
hermes            # 经典 CLI
hermes --tui      # 现代 TUI（推荐）
```

TUI 模式提供模态覆盖层、鼠标选择和非阻塞输入。两种界面共享相同的会话、斜杠命令和配置。

### 单次查询

不需要交互式会话时，可以直接提问：

```bash
hermes chat -q "用 Python 写一个快速排序"
```

### 预加载技能

启动时加载指定技能：

```bash
hermes -s github-pr-workflow
```

### 恢复会话

```bash
hermes --continue              # 恢复最近的会话
hermes --resume my-session     # 按名称恢复
hermes -r 20260709_143052_a1b2 # 按 ID 恢复
```

### 工作树模式

需要并行运行多个 Agent 编辑同一仓库时，使用工作树模式避免 git 冲突：

```bash
hermes -w
```

### YOLO 模式

跳过危险命令审批（谨慎使用）：

```bash
hermes --yolo
```

或通过配置设置为智能审批模式：

```bash
hermes config set approvals.mode smart  # 低风险自动通过，高风险仍提示
```

## 会话内斜杠命令

在交互式会话中输入斜杠命令来控制 Agent 行为。以下是常用命令分类速查。

### 会话控制

```
/new              开启新会话
/clear            清屏并开启新会话
/retry            重新发送上一条消息
/undo             撤销最后一次交互
/title [名称]     命名当前会话
/compress         手动压缩上下文
/stop             终止后台进程
/rollback [N]     恢复文件系统检查点（需启用 --checkpoints）
```

### 配置调整

```
/model [名称]     查看或切换模型
/personality [名称]  设置人格
/reasoning [级别]  设置推理深度（none|minimal|low|medium|high|xhigh）
/verbose          循环切换详细输出级别
/voice [on|off]   语音模式开关
/yolo             切换审批绕过
```

### 工具和技能

```
/tools            管理工具
/skills           搜索和安装技能
/skill <名称>     加载技能到当前会话
/reload-skills    重新扫描技能目录
/cron             管理 Cron 定时任务
```

### 实用工具

```
/branch           分叉当前会话
/history          显示对话历史
/save             保存对话到文件
/copy [N]         复制最近回复到剪贴板
/image            附加本地图片
/usage            查看 Token 使用量
/help             显示所有命令
/quit             退出
```

输入 `/help` 可以查看完整命令列表，新版本可能新增命令。

## 核心功能详解

### 工具系统（Toolsets）

Hermes 的能力通过工具集（Toolsets）实现。每个工具集是一组相关工具的集合，可以独立启用/禁用。

```bash
hermes tools           # 交互式启用/禁用（curses UI）
hermes tools list      # 列出所有工具和状态
hermes tools enable web     # 启用 Web 搜索
hermes tools disable browser # 禁用浏览器自动化
```

常用工具集一览：

| 工具集 | 功能说明 |
|--------|---------|
| `web` | Web 搜索和内容提取 |
| `browser` | 浏览器自动化（Browserbase、Camofox 或本地 Chromium） |
| `terminal` | Shell 命令执行和进程管理 |
| `file` | 文件读写、搜索、补丁 |
| `code_execution` | 沙箱化 Python 执行 |
| `vision` | 图片分析 |
| `image_gen` | AI 图片生成 |
| `tts` | 文字转语音 |
| `memory` | 跨会话持久记忆 |
| `session_search` | 搜索历史对话 |
| `delegation` | 子代理任务委派 |
| `cronjob` | 定时任务管理 |
| `todo` | 会话内任务规划和追踪 |
| `skills` | 技能浏览和管理 |
| `messaging` | 跨平台消息发送 |

工具变更在新会话生效（`/reset` 或重新启动），不会在当前会话中生效以保持 prompt 缓存。

### 技能系统（Skills）

技能是 Hermes 自我进化的核心机制。技能是可复用的工作流程文档，包含特定任务的步骤、命令和注意事项。

**安装技能**：

```bash
hermes skills list              # 列出已安装技能
hermes skills browse            # 浏览技能市场
hermes skills search github     # 搜索技能
hermes skills install ID        # 安装技能
hermes skills inspect ID        # 预览不安装
```

技能安装来源支持：
- 技能市场（hub identifier）
- 直接 URL（`https://.../SKILL.md`）
- GitHub 仓库（`hermes skills tap add owner/repo`）

**技能自动维护**：Hermes 内置 Curator 系统，自动追踪技能使用情况。长期未使用的技能会被标记为 stale 并归档（不会删除），所有操作前会自动备份。

**会话中加载技能**：

```
/skill github-pr-workflow
```

或在启动时预加载：

```bash
hermes -s github-pr-workflow,code-review
```

### Profile 多角色系统

Profile 是独立的配置单元，允许你运行多个具有不同身份和配置的 Hermes 实例。

```bash
hermes profile list              # 列出所有 Profile
hermes profile create dev        # 创建新 Profile
hermes profile create pm --clone # 从当前 Profile 克隆
hermes profile use dev           # 切换默认 Profile
hermes profile show dev          # 查看 Profile 详情
hermes -p dev                    # 临时使用指定 Profile 运行
```

每个 Profile 拥有：
- 独立的 SOUL.md（角色身份定义）
- 独立的 skills/ 目录
- 独立的 memories/（记忆）
- 独立的 config.yaml 和 .env

**典型应用场景**：构建 AI 开发团队。为 PM、架构师、开发工程师、QA 工程师分别创建 Profile，每个角色有专属的身份定义和工作流程技能。

### Gateway 消息平台

Gateway 让 Hermes 运行在消息平台上，具备完整的工具访问能力。

```bash
hermes gateway setup     # 配置平台
hermes gateway install   # 安装为后台服务
hermes gateway start     # 启动服务
hermes gateway stop      # 停止服务
hermes gateway status    # 查看状态
```

支持的平台：

| 平台 | 说明 |
|------|------|
| Telegram | 完整支持，推荐首选 |
| Discord | 需开启 Message Content Intent |
| Slack | 需订阅 message.channels 事件 |
| WhatsApp | 通过 Baileys 库 |
| Signal | 通过 signal-cli |
| Matrix | 通过 python-olm |
| Email | IMAP/SMTP |
| 微信 (Weixin) | 支持 |
| 飞书 (Feishu) | 支持 |
| 企业微信 (WeCom) | 支持 |
| 钉钉 (DingTalk) | 支持 |
| SMS | 通过 Twilio 等 |
| Home Assistant | 智能家居集成 |
| API Server | OpenAI 兼容 API |
| Webhooks | 事件驱动触发 |

**Gateway 管理命令**（在消息平台中使用）：

```
/approve    批准待执行的命令
/deny       拒绝命令
/restart    重启 Gateway
/sethome    设置当前聊天为主频道
/platforms  查看平台连接状态
```

### Cron 定时任务

```bash
hermes cron list                    # 列出定时任务
hermes cron create '0 9 * * *'      # 每天早上 9 点
hermes cron create '30m'            # 每 30 分钟
hermes cron create 'every 2h'       # 每 2 小时
hermes cron edit ID                 # 编辑任务
hermes cron pause/resume ID         # 暂停/恢复
hermes cron run ID                  # 立即触发
hermes cron remove ID               # 删除任务
```

每个 Cron 任务支持：
- 指定加载的 Skills
- 模型和 Provider 覆盖
- 预运行脚本（数据收集模式）
- 任务链（将上游任务输出注入下游任务）
- 多平台投递

### MCP 服务器

MCP（Model Context Protocol）让 Hermes 连接外部工具服务器。

```bash
hermes mcp list              # 列出已配置的服务器
hermes mcp add NAME          # 添加服务器（--url 或 --command）
hermes mcp remove NAME       # 移除服务器
hermes mcp test NAME         # 测试连接
hermes mcp configure NAME    # 配置工具选择
```

MCP 服务器支持 stdio 和 HTTP 两种传输方式，自动发现工具并注册到 Hermes。

### 子代理委派（Delegation）

`delegate_task` 允许 Hermes 生成子代理处理子任务，子代理拥有独立的会话和终端。

```bash
# 在会话中，Hermes 自动使用 delegate_task 工具
# 也可以通过 CLI 手动触发：
hermes chat -q "研究 GRPO 论文并写摘要到 ~/research/grpo.md"
```

子代理特点：
- 隔离的对话上下文
- 可选择工具子集
- 支持批量并行执行
- 自动汇总结果返回给父代理

### 持久记忆

Hermes 在会话间保持记忆，分为两类：

- **User Profile** — 用户信息：姓名、角色、偏好、沟通风格
- **Memory** — 环境笔记：项目结构、工具特性、经验教训

```bash
hermes memory status     # 查看记忆状态
hermes memory setup      # 配置记忆后端
hermes memory off        # 关闭记忆
```

记忆会被注入到每个新会话的系统提示中，保持简洁和聚焦。

## 使用技巧与最佳实践

### 1. 模型选择策略

不同任务适合不同模型：

| 任务类型 | 推荐模型 | 原因 |
|---------|---------|------|
| 代码编写 | Claude Sonnet/Opus | 代码理解和生成能力强 |
| 日常对话 | GPT-4o / Gemini | 速度快，性价比高 |
| 中文场景 | GLM / Qwen | 中文理解更准确 |
| 长文档处理 | Claude（200K 上下文） | 上下文窗口大 |
| 本地部署 | Ollama + Qwen2.5 | 无需 API 费用 |

切换模型只需一条命令，无锁定：

```bash
hermes model    # 交互式选择
```

### 2. Prompt 技巧

Hermes 理解自然语言指令，但好的 Prompt 能大幅提升效果：

```
# 差的 Prompt
修一下 bug

# 好的 Prompt
检查 ~/work/code/myapp/src/auth.py 文件，用户反馈登录时
偶发 500 错误，日志显示 JWT 验证失败。找出根因并修复，
修复后运行 pytest tests/test_auth.py 验证。
```

关键要素：
- 明确文件路径
- 描述具体症状和错误信息
- 指定验证方式
- 提供上下文（日志、环境）

### 3. 利用 Skills 积累经验

每当你发现一个可复用的工作流程，让 Hermes 保存为技能：

```
把刚才部署 Hexo 博客的步骤保存为技能
```

Hermes 会生成 SKILL.md 文件，包含触发条件、步骤、命令和注意事项。下次遇到类似任务时自动加载。

### 4. 会话管理

- 使用 `/title` 给会话命名，方便后续恢复
- 长会话用 `/compress` 压缩上下文，避免 Token 浪费
- 用 `/branch` 分叉会话，探索不同方案而不影响主线
- 用 `hermes sessions browse` 浏览和搜索历史会话

### 5. 安全配置

```bash
# 启用密钥脱敏（工具输出中的 API Key 会被自动遮蔽）
hermes config set security.redact_secrets true

# 智能命令审批（低风险自动通过，高风险仍提示）
hermes config set approvals.mode smart

# 启用文件系统检查点（可回滚文件修改）
hermes config set checkpoints.enabled true
```

### 6. 多 Agent 协作

通过 tmux 运行多个交互式 Hermes 实例：

```bash
# 启动后端 Agent
tmux new-session -d -s backend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t backend '构建用户管理的 REST API' Enter

# 启动前端 Agent
tmux new-session -d -s frontend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t frontend '构建用户管理的 React 仪表盘' Enter

# 查看进度
tmux capture-pane -t backend -p | tail -30
```

使用 `-w`（工作树模式）避免多个 Agent 编辑同一仓库时的 git 冲突。

### 7. 语音模式

```bash
# 配置语音转文字（本地 Whisper 免费）
pip install faster-whisper
hermes config set stt.enabled true
hermes config set stt.provider local
```

会话中切换语音模式：

```
/voice on    # 语音对话模式
/voice tts   # 始终语音回复
/voice off   # 关闭
```

### 8. 性能优化

```bash
# 启用上下文压缩（默认已启用）
hermes config set compression.enabled true
hermes config set compression.threshold 0.50  # 上下文使用 50% 时触发
hermes config set compression.target_ratio 0.20  # 压缩到 20%

# 限制最大交互轮次
hermes config set agent.max_turns 90
```

## 故障排查

### 安装问题

**问题：安装脚本报错 "Git not found"**

安装脚本会尝试自动安装 Git。如果失败，手动安装：
- Ubuntu/Debian: `sudo apt install git`
- CentOS/RHEL: `sudo yum install git`
- macOS: `brew install git` 或安装 Xcode Command Line Tools

**问题：Windows 上 HTTP 400 "No models provided"**

config.yaml 被保存为 UTF-8 BOM 格式。运行 `hermes config edit` 重新保存，编辑器会自动去除 BOM。

**问题：WSL2 上 Gateway 退出后不运行**

确保 `/etc/wsl.conf` 中启用了 systemd：
```ini
[boot]
systemd=true
```

### 模型和 Provider 问题

```bash
hermes doctor     # 检查配置和依赖
hermes auth       # 重新认证 OAuth Provider
```

**Copilot 403 错误**：`gh auth login` 的 token 不能用于 Copilot API。必须通过 `hermes model` -> GitHub Copilot 的 OAuth 设备码流程认证。

**模型上下文不足**：Hermes 要求模型至少支持 64K tokens 上下文。本地模型需设置：
```bash
# Ollama
ollama run qwen2.5:32b --ctx-size 65536

# llama.cpp
./main -m model.gguf -c 65536
```

### Gateway 问题

```bash
# 查看日志
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

**Gateway 在 SSH 断开后退出**：
```bash
sudo loginctl enable-linger $USER
```

**Gateway 崩溃循环**：
```bash
systemctl --user reset-failed hermes-gateway
```

**Discord Bot 无响应**：在 Discord Developer Portal 中，Bot -> Privileged Gateway Intents，开启 Message Content Intent。

**Slack Bot 只在 DM 中工作**：需要订阅 `message.channels` 事件，否则 Bot 忽略公共频道消息。

### 工具和技能问题

**工具不可用**：
1. `hermes tools` 检查工具集是否启用
2. 某些工具需要环境变量（检查 `.env`）
3. 启用工具后需要 `/reset` 开启新会话

**技能不显示**：
1. `hermes skills list` 确认已安装
2. `hermes skills config` 检查平台启用状态
3. 手动加载：`/skill name` 或 `hermes -s name`

### 变更不生效

| 变更类型 | 生效方式 |
|---------|---------|
| 工具/技能变更 | `/reset` 开启新会话 |
| 配置变更（Gateway） | `/restart` |
| 配置变更（CLI） | 退出并重新启动 |
| 代码修改 | 重启 CLI 或 Gateway 进程 |

### 辅助模型不工作

如果视觉分析、上下文压缩等辅助功能静默失败，说明 `auto` Provider 找不到后端。设置一个辅助模型：

```bash
hermes config set auxiliary.vision.provider openrouter
hermes config set auxiliary.vision.model anthropic/claude-sonnet-4
```

## CLI 命令速查表

### 全局参数

```
hermes [flags] [command]

  --version, -V             显示版本
  --resume, -r SESSION      按 ID 恢复会话
  --continue, -c [NAME]     恢复最近的或指定名称的会话
  --worktree, -w            工作树模式（并行 Agent）
  --skills, -s SKILL        预加载技能
  --profile, -p NAME        使用指定 Profile
  --yolo                    跳过危险命令审批
```

不带子命令时默认进入 `chat`。

### 常用命令

```
# 对话
hermes                          交互式聊天
hermes chat -q "问题"           单次查询
hermes chat -m model_name       指定模型

# 配置
hermes setup                    配置向导
hermes model                    模型选择器
hermes config                   查看配置
hermes config set KEY VAL       设置配置值
hermes auth                     凭据管理
hermes doctor [--fix]           诊断

# 工具和技能
hermes tools                    管理工具
hermes tools list               列出工具
hermes skills list              列出技能
hermes skills browse            浏览技能市场
hermes skills install ID        安装技能

# Profile
hermes profile list             列出 Profile
hermes profile create NAME      创建 Profile
hermes profile use NAME         切换默认 Profile

# Gateway
hermes gateway setup            配置平台
hermes gateway install          安装服务
hermes gateway start/stop       启停服务

# 会话
hermes sessions list            列出会话
hermes sessions browse          交互式浏览
hermes sessions export OUT      导出为 JSONL

# 定时任务
hermes cron list                列出任务
hermes cron create SCHED        创建任务

# 其他
hermes update                   更新到最新版
hermes status [--all]           组件状态
hermes insights [--days N]      使用分析
hermes completion bash|zsh      Shell 补全
```

## 总结

Hermes Agent 是一个功能强大且高度可扩展的 AI Agent 框架。掌握它需要理解几个核心概念：

1. **安装部署** — 根据操作系统选择合适的安装方式，Docker 适合服务器，桌面安装器适合个人电脑
2. **Provider 配置** — 选择合适的 LLM 提供商，国内用户推荐 GLM/Kimi/通义或自定义端点
3. **工具系统** — 按需启用工具集，不必全部开启
4. **技能积累** — 每解决一个复杂问题都可以保存为技能，让 Agent 持续进化
5. **Profile 隔离** — 多角色场景下使用 Profile 分离身份和配置
6. **Gateway 部署** — 让 Agent 运行在消息平台上，随时可用

关键设计理念：Hermes 的所有能力都是可选的。从最小配置开始，按需添加功能，这才是正确的使用姿势。

官方文档：https://hermes-agent.nousresearch.com/docs/

GitHub 仓库：https://github.com/NousResearch/hermes-agent
