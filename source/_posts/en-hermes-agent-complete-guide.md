---
title: "Hermes Agent Complete Guide: From Installation to Mastery"
date: 2026-07-09 14:00:00
lang: en
tags:
  - AI
  - Hermes
  - Tutorial
  - Automation
  - LLM
categories:
  - Technical Practices
---

Hermes Agent is an open-source AI Agent framework developed by Nous Research that runs in terminals, messaging platforms, and IDEs. It can interact with your system through tool calls, supports 20+ LLM providers, and runs on Linux, macOS, Windows, and Docker.

The goal of this article is simple: **read just this one piece, and you'll be able to master Hermes**. From installation and deployment to usage tips, it's all covered.

<!-- more -->

## What is Hermes

Hermes is an autonomous coding and task execution agent, in the same category as Claude Code and OpenAI Codex. However, it has several notable differences:

- **Self-evolution through Skills** - After solving complex problems, you can save the workflow as a Skill that is automatically loaded in subsequent sessions. Over time, the Agent becomes increasingly strong at your specific tasks
- **Persistent memory across sessions** - Remembers your preferences, environment details, and lessons learned
- **Multi-platform gateway** - The same Agent can run on 15+ platforms including Telegram, Discord, Slack, WeChat, Feishu, and more, with full tool access
- **Provider agnostic** - You can switch models and providers mid-session without changing other configurations
- **Profile isolation** - Run multiple independent Hermes instances, each with its own configuration, sessions, skills, and memory
- **Highly extensible** - Supports plugins, MCP servers, custom tools, Webhook triggers, and Cron scheduled tasks

## System Requirements

Before installing, make sure your environment meets the following conditions:

| Requirement | Minimum Version | Notes |
|------|---------|------|
| Python | 3.11+ | Auto-installed by the install script |
| Node.js | 22+ | Required for browser tools (optional) |
| Git | Any version | Required for cloning the repository |
| Memory | 512MB+ | The Agent itself has a very small footprint |
| Model context | 64K tokens | The model must support at least a 64K context window |

Supported platforms (Tier 1):

- macOS (Apple Silicon)
- Windows 10/11 (x86_64, aarch64)
- Linux / WSL2 (x86_64, aarch64)
- Docker containers (x86_64, aarch64)

## Installation Guide

### 1. Linux / macOS / WSL2

Install with a single command:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

The installation script will automatically perform the following steps:
1. Detect the operating system and package manager
2. Install Python 3.11+ and Git (if missing)
3. Clone the Hermes repository to `~/.hermes/hermes-agent/`
4. Create a Python virtual environment and install dependencies
5. Install the `hermes` command to `~/.local/bin/`
6. Run the interactive configuration wizard

After installation, reload your shell:

```bash
source ~/.bashrc   # or source ~/.zshrc
```

**When installing as root**, Hermes uses an FHS layout: code is placed in `/usr/local/lib/hermes-agent`, the command is symlinked to `/usr/local/bin/hermes`, and data stays in `~/.hermes/`. This is consistent with the behavior of Claude Code / Codex CLI.

**Common installation options**:

```bash
# Skip the configuration wizard (for CI/automation scenarios)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup

# Don't use a virtual environment
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --no-venv

# Specify a branch
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --branch dev
```

### 2. Native Windows

Run in PowerShell:

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

You can also download the desktop installer: visit [https://hermes-agent.nousresearch.com/](https://hermes-agent.nousresearch.com/) to download the Hermes Desktop installer, which installs both the CLI and the desktop app.

**Windows notes**:

- Alt+Enter is intercepted by Windows Terminal for fullscreen toggling; use Ctrl+Enter for line breaks
- If you encounter HTTP 400 "No models provided" on first run, config.yaml may have been saved in UTF-8 BOM format. Re-save it using `hermes config edit`
- The execute_code sandbox may encounter WinError 10106 on Windows, usually because the SYSTEMROOT environment variable has been cleared

### 3. WSL2 (Windows Subsystem for Linux)

WSL2 uses the same installation script as Linux. However, you need to ensure that WSL2 has systemd enabled:

```bash
# /etc/wsl.conf
[boot]
systemd=true
```

Without systemd, the Gateway service falls back to nohup mode, which exits when the WSL2 window is closed.

The installation command is the same as Linux:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### 4. Docker Deployment

Docker is the recommended approach for server deployment. The image itself is stateless; all data is persisted through volume mounts.

**Initial configuration** (interactive):

```bash
mkdir -p ~/.hermes
docker run -it --rm \
  -v ~/.hermes:/opt/data \
  nousresearch/hermes-agent setup
```

This enters the configuration wizard, prompting you for API keys and writing them to `~/.hermes/.env`. This only needs to be done once.

**Gateway mode** (background daemon):

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  nousresearch/hermes-agent gateway run
```

Port 8642 exposes the Gateway's API server and health check endpoint. If you only use chat platforms (Telegram, Discord, etc.), you don't need to map this port.

**Enabling Web Dashboard**:

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

**Docker deployment key points**:
- The Gateway inside the container is supervised by s6-overlay and automatically restarts after crashes
- Updates are done by pulling a new image, not via `hermes update`
- Do not run docker commands through a VPS browser console (special character transmission issues); use SSH instead
- If you want to expose the API server, be sure to set `API_SERVER_KEY`:

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

### 5. Android (Termux)

Run the same installation script as Linux in the Termux terminal. The installation script automatically detects the Termux environment and uses Python's standard library venv + pip (instead of uv). Some features are unavailable on phones; see the official Termux documentation for details.

## Initial Configuration

After installation, run the configuration wizard:

```bash
hermes setup
```

The configuration wizard offers three modes:

| Mode | Description | Use Case |
|------|------|---------|
| Quick Setup (Nous Portal) | OAuth login, zero configuration | Recommended for quick start |
| Full Setup | Step-by-step configuration of all options | When you need fine-grained control |
| Blank Slate | Only keeps the minimum required tools | For minimalist control |

### Choosing a Provider

Hermes supports 30+ LLM providers. Use the interactive selector:

```bash
hermes model
```

Quick reference for common providers:

| Provider | Authentication | Environment Variable |
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
| Alibaba Tongyi (DashScope) | API Key | `DASHSCOPE_API_KEY` |
| GitHub Copilot | OAuth / Token | `COPILOT_GITHUB_TOKEN` |
| Custom endpoint | URL + Key | Configure in config.yaml |

**Recommended for users in mainland China**: Z.AI (GLM), Kimi, MiniMax China, and Alibaba Tongyi all support direct connections over domestic networks. You can also use a custom endpoint to connect to local model services like vLLM or Ollama.

**Custom endpoint configuration** (connecting to a local Ollama as an example):

```bash
hermes config set model.provider custom
hermes config set model.base_url http://localhost:11434/v1
hermes config set model.api_key ollama
hermes config set model.default qwen2.5:32b
hermes config set model.context_length 65536
```

### Configuration File Structure

Hermes separates sensitive information from non-sensitive configuration:

```
~/.hermes/
├── config.yaml          # Main configuration file (settings)
├── .env                 # API keys and secrets
├── skills/              # Installed skills
├── sessions/            # Session records
├── state.db             # Session storage (SQLite + FTS5)
├── auth.json            # OAuth tokens and credential pool
├── logs/                # Gateway and error logs
└── hermes-agent/        # Source code (git install method)
```

View and modify configuration:

```bash
hermes config             # View current configuration
hermes config edit        # Open config.yaml in an editor
hermes config set KEY VAL # Set a configuration value
hermes config path        # Print the config.yaml path
hermes config check       # Check if configuration is complete
```

### Health Check

After installation, run the diagnostic tool to confirm everything is working:

```bash
hermes doctor
```

This checks the Python version, dependency integrity, configuration files, API keys, and more. Add `--fix` to automatically fix some issues.

## Basic Usage

### Starting an Interactive Session

```bash
hermes            # Classic CLI
hermes --tui      # Modern TUI (recommended)
```

TUI mode provides modal overlays, mouse selection, and non-blocking input. Both interfaces share the same sessions, slash commands, and configuration.

### One-off Query

When you don't need an interactive session, you can ask a question directly:

```bash
hermes chat -q "Write a quicksort in Python"
```

### Preloading Skills

Load specified skills at startup:

```bash
hermes -s github-pr-workflow
```

### Resuming Sessions

```bash
hermes --continue              # Resume the most recent session
hermes --resume my-session     # Resume by name
hermes -r 20260709_143052_a1b2 # Resume by ID
```

### Worktree Mode

When you need to run multiple Agents editing the same repository in parallel, use worktree mode to avoid git conflicts:

```bash
hermes -w
```

### YOLO Mode

Skip approval for dangerous commands (use with caution):

```bash
hermes --yolo
```

Or configure it to use smart approval mode:

```bash
hermes config set approvals.mode smart  # Low-risk auto-approve, high-risk still prompts
```

## In-Session Slash Commands

Type slash commands in an interactive session to control Agent behavior. Below is a categorized quick reference of common commands.

### Session Control

```
/new              Start a new session
/clear            Clear screen and start a new session
/retry            Resend the last message
/undo             Undo the last interaction
/title [name]     Name the current session
/compress         Manually compress the context
/stop             Terminate background processes
/rollback [N]     Restore filesystem checkpoints (requires --checkpoints enabled)
```

### Configuration Adjustments

```
/model [name]     View or switch the model
/personality [name]  Set personality
/reasoning [level]  Set reasoning depth (none|minimal|low|medium|high|xhigh)
/verbose          Cycle through verbose output levels
/voice [on|off]   Toggle voice mode
/yolo             Toggle approval bypass
```

### Tools and Skills

```
/tools            Manage tools
/skills           Search and install skills
/skill <name>     Load a skill into the current session
/reload-skills    Rescan the skills directory
/cron             Manage Cron scheduled tasks
```

### Utilities

```
/branch           Fork the current session
/history          Show conversation history
/save             Save the conversation to a file
/copy [N]         Copy the most recent reply to clipboard
/image            Attach a local image
/usage            View token usage
/help             Show all commands
/quit             Exit
```

Type `/help` to see the full command list. New versions may add additional commands.

## Core Features In Depth

### Tool System (Toolsets)

Hermes's capabilities are implemented through toolsets. Each toolset is a collection of related tools that can be enabled/disabled independently.

```bash
hermes tools           # Interactive enable/disable (curses UI)
hermes tools list      # List all tools and their status
hermes tools enable web     # Enable Web search
hermes tools disable browser # Disable browser automation
```

Overview of common toolsets:

| Toolset | Description |
|--------|---------|
| `web` | Web search and content extraction |
| `browser` | Browser automation (Browserbase, Camofox, or local Chromium) |
| `terminal` | Shell command execution and process management |
| `file` | File read/write, search, patching |
| `code_execution` | Sandboxed Python execution |
| `vision` | Image analysis |
| `image_gen` | AI image generation |
| `tts` | Text to speech |
| `memory` | Cross-session persistent memory |
| `session_search` | Search historical conversations |
| `delegation` | Sub-agent task delegation |
| `cronjob` | Scheduled task management |
| `todo` | In-session task planning and tracking |
| `skills` | Skill browsing and management |
| `messaging` | Cross-platform message sending |

Tool changes take effect in new sessions (`/reset` or restart) and do not apply to the current session in order to preserve the prompt cache.

### Skill System (Skills)

Skills are the core mechanism for Hermes's self-evolution. A skill is a reusable workflow document containing steps, commands, and considerations for a specific task.

**Installing skills**:

```bash
hermes skills list              # List installed skills
hermes skills browse            # Browse the skill marketplace
hermes skills search github     # Search for skills
hermes skills install ID        # Install a skill
hermes skills inspect ID        # Preview without installing
```

Supported skill installation sources:
- Skill marketplace (hub identifier)
- Direct URL (`https://.../SKILL.md`)
- GitHub repository (`hermes skills tap add owner/repo`)

**Automatic skill maintenance**: Hermes has a built-in Curator system that automatically tracks skill usage. Skills that haven't been used for a long time are marked as stale and archived (not deleted), with automatic backups before all operations.

**Loading skills within a session**:

```
/skill github-pr-workflow
```

Or preload at startup:

```bash
hermes -s github-pr-workflow,code-review
```

### Profile Multi-Role System

A Profile is an independent configuration unit that allows you to run multiple Hermes instances with different identities and configurations.

```bash
hermes profile list              # List all Profiles
hermes profile create dev        # Create a new Profile
hermes profile create pm --clone # Clone from the current Profile
hermes profile use dev           # Switch the default Profile
hermes profile show dev          # View Profile details
hermes -p dev                    # Temporarily run with a specified Profile
```

Each Profile has:
- An independent SOUL.md (role identity definition)
- An independent skills/ directory
- Independent memories/ (memory)
- An independent config.yaml and .env

**Typical use case**: Building an AI development team. Create separate Profiles for the PM, architect, developer, and QA engineer, each with their own identity definition and workflow skills.

### Gateway Messaging Platforms

The Gateway lets Hermes run on messaging platforms with full tool access.

```bash
hermes gateway setup     # Configure platforms
hermes gateway install   # Install as a background service
hermes gateway start     # Start the service
hermes gateway stop      # Stop the service
hermes gateway status    # Check status
```

Supported platforms:

| Platform | Notes |
|------|------|
| Telegram | Fully supported, recommended first choice |
| Discord | Requires enabling Message Content Intent |
| Slack | Requires subscribing to message.channels events |
| WhatsApp | Via the Baileys library |
| Signal | Via signal-cli |
| Matrix | Via python-olm |
| Email | IMAP/SMTP |
| WeChat (Weixin) | Supported |
| Feishu | Supported |
| WeCom (Enterprise WeChat) | Supported |
| DingTalk | Supported |
| SMS | Via Twilio, etc. |
| Home Assistant | Smart home integration |
| API Server | OpenAI-compatible API |
| Webhooks | Event-driven triggers |

**Gateway management commands** (used within messaging platforms):

```
/approve    Approve pending commands
/deny       Deny a command
/restart    Restart the Gateway
/sethome    Set the current chat as the home channel
/platforms  View platform connection status
```

### Cron Scheduled Tasks

```bash
hermes cron list                    # List scheduled tasks
hermes cron create '0 9 * * *'      # Every day at 9 AM
hermes cron create '30m'            # Every 30 minutes
hermes cron create 'every 2h'       # Every 2 hours
hermes cron edit ID                 # Edit a task
hermes cron pause/resume ID         # Pause/resume
hermes cron run ID                  # Trigger immediately
hermes cron remove ID               # Delete a task
```

Each Cron task supports:
- Specifying which Skills to load
- Model and provider overrides
- Pre-run scripts (data collection mode)
- Task chaining (injecting upstream task output into downstream tasks)
- Multi-platform delivery

### MCP Servers

MCP (Model Context Protocol) lets Hermes connect to external tool servers.

```bash
hermes mcp list              # List configured servers
hermes mcp add NAME          # Add a server (--url or --command)
hermes mcp remove NAME       # Remove a server
hermes mcp test NAME         # Test the connection
hermes mcp configure NAME    # Configure tool selection
```

MCP servers support both stdio and HTTP transport methods, automatically discovering tools and registering them with Hermes.

### Sub-Agent Delegation

`delegate_task` allows Hermes to spawn sub-agents to handle subtasks. Sub-agents have their own independent sessions and terminals.

```bash
# In a session, Hermes automatically uses the delegate_task tool
# You can also trigger it manually via the CLI:
hermes chat -q "Research the GRPO paper and write a summary to ~/research/grpo.md"
```

Sub-agent characteristics:
- Isolated conversation context
- Configurable tool subset
- Supports batch parallel execution
- Automatically summarizes results back to the parent agent

### Persistent Memory

Hermes maintains memory across sessions, divided into two categories:

- **User Profile** - User information: name, role, preferences, communication style
- **Memory** - Environmental notes: project structure, tool characteristics, lessons learned

```bash
hermes memory status     # View memory status
hermes memory setup      # Configure memory backend
hermes memory off        # Turn off memory
```

Memories are injected into the system prompt of each new session, kept concise and focused.

## Tips and Best Practices

### 1. Model Selection Strategy

Different tasks suit different models:

| Task Type | Recommended Model | Reason |
|---------|---------|------|
| Code writing | Claude Sonnet/Opus | Strong code comprehension and generation |
| Daily conversation | GPT-4o / Gemini | Fast, good value for money |
| Chinese-language scenarios | GLM / Qwen | More accurate Chinese understanding |
| Long document processing | Claude (200K context) | Large context window |
| Local deployment | Ollama + Qwen2.5 | No API costs |

Switching models takes just one command, with no lock-in:

```bash
hermes model    # Interactive selection
```

### 2. Prompting Techniques

Hermes understands natural language instructions, but good prompts can significantly improve results:

```
# Bad prompt
fix the bug

# Good prompt
Check the ~/work/code/myapp/src/auth.py file. Users report occasional
500 errors during login, and logs show JWT verification failures. Find
the root cause and fix it. After fixing, run pytest tests/test_auth.py
to verify.
```

Key elements:
- Specify exact file paths
- Describe specific symptoms and error messages
- Specify the verification method
- Provide context (logs, environment)

### 3. Leverage Skills to Accumulate Experience

Whenever you find a reusable workflow, have Hermes save it as a skill:

```
Save the steps for deploying the Hexo blog just now as a skill
```

Hermes will generate a SKILL.md file containing trigger conditions, steps, commands, and considerations. It will be automatically loaded the next time you encounter a similar task.

### 4. Session Management

- Use `/title` to name sessions for easier future recovery
- Use `/compress` on long sessions to compress context and avoid token waste
- Use `/branch` to fork a session and explore different approaches without affecting the main line
- Use `hermes sessions browse` to browse and search historical sessions

### 5. Security Configuration

```bash
# Enable secret redaction (API keys in tool output will be automatically masked)
hermes config set security.redact_secrets true

# Smart command approval (low-risk auto-approve, high-risk still prompts)
hermes config set approvals.mode smart

# Enable filesystem checkpoints (allows rolling back file modifications)
hermes config set checkpoints.enabled true
```

### 6. Multi-Agent Collaboration

Run multiple interactive Hermes instances via tmux:

```bash
# Start the backend Agent
tmux new-session -d -s backend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t backend 'Build a REST API for user management' Enter

# Start the frontend Agent
tmux new-session -d -s frontend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t frontend 'Build a React dashboard for user management' Enter

# Check progress
tmux capture-pane -t backend -p | tail -30
```

Use `-w` (worktree mode) to avoid git conflicts when multiple Agents edit the same repository.

### 7. Voice Mode

```bash
# Configure speech-to-text (local Whisper is free)
pip install faster-whisper
hermes config set stt.enabled true
hermes config set stt.provider local
```

Toggle voice mode within a session:

```
/voice on    # Voice conversation mode
/voice tts   # Always reply with voice
/voice off   # Turn off
```

### 8. Performance Optimization

```bash
# Enable context compression (enabled by default)
hermes config set compression.enabled true
hermes config set compression.threshold 0.50  # Trigger when context usage reaches 50%
hermes config set compression.target_ratio 0.20  # Compress to 20%

# Limit the maximum number of interaction turns
hermes config set agent.max_turns 90
```

## Troubleshooting

### Installation Issues

**Problem: Install script reports "Git not found"**

The install script will attempt to install Git automatically. If that fails, install it manually:
- Ubuntu/Debian: `sudo apt install git`
- CentOS/RHEL: `sudo yum install git`
- macOS: `brew install git` or install Xcode Command Line Tools

**Problem: HTTP 400 "No models provided" on Windows**

config.yaml was saved in UTF-8 BOM format. Run `hermes config edit` to re-save; the editor will automatically strip the BOM.

**Problem: Gateway doesn't run after exiting on WSL2**

Make sure systemd is enabled in `/etc/wsl.conf`:
```ini
[boot]
systemd=true
```

### Model and Provider Issues

```bash
hermes doctor     # Check configuration and dependencies
hermes auth       # Re-authenticate OAuth providers
```

**Copilot 403 error**: The token from `gh auth login` cannot be used for the Copilot API. You must authenticate via the OAuth device code flow through `hermes model` -> GitHub Copilot.

**Insufficient model context**: Hermes requires the model to support at least 64K tokens of context. Local models need to be configured as follows:
```bash
# Ollama
ollama run qwen2.5:32b --ctx-size 65536

# llama.cpp
./main -m model.gguf -c 65536
```

### Gateway Issues

```bash
# View logs
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

**Gateway exits after SSH disconnects**:
```bash
sudo loginctl enable-linger $USER
```

**Gateway crash loop**:
```bash
systemctl --user reset-failed hermes-gateway
```

**Discord Bot not responding**: In the Discord Developer Portal, go to Bot -> Privileged Gateway Intents and enable Message Content Intent.

**Slack Bot only works in DMs**: You need to subscribe to the `message.channels` event, otherwise the Bot ignores messages in public channels.

### Tools and Skills Issues

**Tools unavailable**:
1. Run `hermes tools` to check whether the toolset is enabled
2. Some tools require environment variables (check `.env`)
3. After enabling tools, you need to `/reset` to start a new session

**Skills not showing**:
1. Run `hermes skills list` to confirm they are installed
2. Run `hermes skills config` to check platform enablement status
3. Load manually: `/skill name` or `hermes -s name`

### Changes Not Taking Effect

| Change Type | How It Takes Effect |
|---------|---------|
| Tool/skill changes | `/reset` to start a new session |
| Configuration changes (Gateway) | `/restart` |
| Configuration changes (CLI) | Exit and restart |
| Code modifications | Restart the CLI or Gateway process |

### Auxiliary Model Not Working

If auxiliary features like vision analysis or context compression silently fail, it means the `auto` provider cannot find a backend. Set an auxiliary model:

```bash
hermes config set auxiliary.vision.provider openrouter
hermes config set auxiliary.vision.model anthropic/claude-sonnet-4
```

## CLI Command Quick Reference

### Global Flags

```
hermes [flags] [command]

  --version, -V             Show version
  --resume, -r SESSION      Resume session by ID
  --continue, -c [NAME]     Resume the most recent or named session
  --worktree, -w            Worktree mode (parallel Agents)
  --skills, -s SKILL        Preload skills
  --profile, -p NAME        Use a specified Profile
  --yolo                    Skip dangerous command approval
```

When no subcommand is given, it defaults to `chat`.

### Common Commands

```
# Chat
hermes                          Interactive chat
hermes chat -q "question"       One-off query
hermes chat -m model_name       Specify a model

# Configuration
hermes setup                    Configuration wizard
hermes model                    Model selector
hermes config                   View configuration
hermes config set KEY VAL       Set a configuration value
hermes auth                     Credential management
hermes doctor [--fix]           Diagnostics

# Tools and skills
hermes tools                    Manage tools
hermes tools list               List tools
hermes skills list              List skills
hermes skills browse            Browse skill marketplace
hermes skills install ID        Install a skill

# Profile
hermes profile list             List Profiles
hermes profile create NAME      Create a Profile
hermes profile use NAME         Switch the default Profile

# Gateway
hermes gateway setup            Configure platforms
hermes gateway install          Install the service
hermes gateway start/stop       Start/stop the service

# Sessions
hermes sessions list            List sessions
hermes sessions browse          Interactive browsing
hermes sessions export OUT      Export as JSONL

# Scheduled tasks
hermes cron list                List tasks
hermes cron create SCHED        Create a task

# Other
hermes update                   Update to the latest version
hermes status [--all]           Component status
hermes insights [--days N]      Usage analytics
hermes completion bash|zsh      Shell completion
```

## Conclusion

Hermes Agent is a powerful and highly extensible AI Agent framework. Mastering it requires understanding a few core concepts:

1. **Installation and deployment** - Choose the right installation method for your operating system; Docker is suitable for servers, and the desktop installer is suitable for personal computers
2. **Provider configuration** - Choose the right LLM provider; for users in mainland China, GLM/Kimi/Tongyi or custom endpoints are recommended
3. **Tool system** - Enable toolsets as needed; you don't need to turn them all on
4. **Skill accumulation** - Every complex problem you solve can be saved as a skill, letting the Agent continuously evolve
5. **Profile isolation** - Use Profiles to separate identities and configurations in multi-role scenarios
6. **Gateway deployment** - Run the Agent on messaging platforms so it's available anytime

Key design philosophy: All of Hermes's capabilities are optional. Start with a minimal configuration and add features as needed — that's the right way to use it.

Official documentation: https://hermes-agent.nousresearch.com/docs/

GitHub repository: https://github.com/NousResearch/hermes-agent
