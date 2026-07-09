---
title: "OpenClaw Complete Guide: From Installation to Mastery"
date: 2026-07-09 15:00:00
tags:
  - AI
  - OpenClaw
  - Tutorial
  - Automation
  - LLM
categories:
  - Technical Practices
lang: en
---

OpenClaw is an open-source personal AI assistant framework that runs on your own devices. Built on TypeScript, it connects the messaging channels you use every day through a Gateway, letting you chat with your AI assistant on 20+ platforms including WhatsApp, Telegram, Slack, and Discord.

The goal of this article is the same as the Hermes guide: **read just this one article, and you'll master OpenClaw**. From installation and deployment to usage tips, it's all covered.

<!-- more -->

## What is OpenClaw

The core philosophy of OpenClaw is a "personal AI assistant" — you run it on your own devices, and you control your data. It belongs to the category of autonomous task-execution agents, the same category as Hermes Agent and Claude Code, but with a different focus:

- **Local-first Gateway** - A single control plane manages sessions, channels, tools, and events, with all data staying on your devices
- **Multi-channel inbox** - 20+ messaging platforms unified into one, with a single assistant covering all communication channels
- **Multi-agent routing** - Route different channels/contacts to isolated agent instances, each with its own workspace and session
- **Voice wake + conversation mode** - macOS/iOS support wake words, Android supports continuous voice conversation
- **Live Canvas** - Agent-driven visual workspace, supports the A2UI protocol
- **Companion apps** - Windows Hub, macOS menu bar app, iOS/Android node apps
- **Skill ecosystem** - Install and share skills through the ClawHub skill marketplace

Key differences between OpenClaw and Hermes:

| Dimension | OpenClaw | Hermes Agent |
|------|---------|-------------|
| Language | TypeScript (Node.js) | Python |
| Installation | npm / install script | pip / install script |
| Config format | JSON5 (openclaw.json) | YAML (config.yaml) |
| Data directory | ~/.openclaw/ | ~/.hermes/ |
| Number of messaging platforms | 20+ | 15+ |
| Desktop app | Windows Hub / macOS menu bar | Hermes Desktop |
| Skill marketplace | ClawHub | Hermes Skills Hub |
| Voice | Voice Wake + Talk Mode | STT + TTS |
| Visualization | Live Canvas (A2UI) | Dashboard |

## System Requirements

Before installing, confirm that your environment meets the following conditions:

| Requirement | Minimum version | Notes |
|------|---------|------|
| Node.js | 22.19+ or 24+ | 24 is the recommended version; the install script will install it automatically |
| Memory | 512MB+ | The Gateway itself has a small footprint |
| Disk | 200MB+ | Includes dependencies and skills |
| API Key | Any model provider | Anthropic, OpenAI, Google, etc. |

Supported platforms:

- macOS (Apple Silicon + Intel)
- Linux (x86_64, aarch64)
- Windows (native + WSL2)
- Docker containers
- Raspberry Pi
- Android (via Termux or node app)
- iOS (via node app)

## Installation Guide

### 1. macOS / Linux / WSL2

One-line installation (recommended):

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

The install script will automatically complete the following steps:
1. Detect the operating system and package manager
2. Install Node.js 24 (if missing or version is too low)
3. Globally install the OpenClaw package
4. Launch the interactive Onboarding wizard

After installation, run Onboarding:

```bash
openclaw onboard --install-daemon
```

The Onboarding wizard will guide you through:
- Selecting a model provider and entering your API Key
- Configuring the Gateway (generating tokens, setting ports)
- Choosing messaging channels (can be skipped for later configuration)
- Installing the Gateway daemon (launchd/systemd user service)

**Skip Onboarding** (CI/automation scenarios):

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

**Local prefix installation** (no dependency on system Node.js):

```bash
curl -fsSL https://openclaw.ai/install-cli.sh | bash
```

This installs OpenClaw and Node.js into the `~/.openclaw/` directory without polluting the system environment.

### 2. Windows

**Option 1: Windows Hub desktop app (recommended)**

Visit [https://docs.openclaw.ai/platforms/windows](https://docs.openclaw.ai/platforms/windows) to download the Windows Hub installer. It provides a graphical interface setup, system tray status, chat window, node mode, and local MCP mode.

**Option 2: PowerShell installation**

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

Skip Onboarding:

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
```

**Option 3: WSL2**

Use the same install script as Linux inside WSL2. The Gateway runs in WSL2, and the Windows side accesses the control panel via a browser.

### 3. npm / pnpm / bun installation

If you already manage your own Node.js environment:

```bash
# npm
npm install -g openclaw@latest
openclaw onboard --install-daemon

# pnpm (need to approve build scripts after first install)
pnpm add -g openclaw@latest
pnpm approve-builds -g
openclaw onboard --install-daemon

# bun (experimental)
bun add -g openclaw@latest
openclaw onboard --install-daemon
```

### 4. Docker deployment

Docker is the recommended way for server deployment, providing an isolated Gateway environment.

**Using prebuilt images**:

```bash
# GHCR (primary registry)
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# or Docker Hub image
export OPENCLAW_IMAGE="openclaw/openclaw:latest"

# Clone the repository and run the setup script
git clone https://github.com/openclaw/openclaw.git
cd openclaw
./scripts/docker/setup.sh
```

The setup script will automatically:
- Pull/build the Docker image
- Prompt for the provider API Key
- Generate a Gateway token and write it to `.env`
- Create the authentication key directory
- Start the Gateway via Docker Compose

**Offline installation** (air-gapped environments):

```bash
# Pull the image on a machine with internet access
docker pull ghcr.io/openclaw/openclaw:latest
docker save ghcr.io/openclaw/openclaw:latest -o openclaw-image.tar

# Transfer to the target machine, then load
docker load -i openclaw-image.tar
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh --offline
```

**Docker deployment notes**:
- Minimum 2GB of memory (`pnpm install` may OOM on a 1GB host)
- Official tags: `main`, `latest`, `<version>` (e.g., `2026.2.26`)
- The `-browser` variant (e.g., `latest-browser`) ships with Chromium built in, suitable for sandboxed browsers
- Before deploying on a VPS, be sure to read the security hardening documentation
- Control panel address: `http://127.0.0.1:18789/`

### 5. Other platforms

**Raspberry Pi**: Supports ARM architecture, uses the same install script as Linux.

**Android (Termux)**: Install Node.js in Termux, then install via npm. You can also install the OpenClaw Android node app for a native experience.

**iOS**: Install the OpenClaw node app from the App Store and connect it to your Gateway.

**Nix**: Use the Nix flake provided by `github.com/openclaw/nix-openclaw`.

## Initial Configuration

After installation, the Onboarding wizard is the main entry point for configuration:

```bash
openclaw onboard    # Full Onboarding flow
openclaw configure  # Configuration wizard (can be run at any time to modify settings)
```

### Configuration file structure

OpenClaw uses a JSON5-format configuration file:

```
~/.openclaw/
├── openclaw.json          # Main configuration file (JSON5)
├── .env                   # API keys and sensitive information
├── workspace/             # Default workspace
│   ├── SOUL.md            # Assistant personality definition
│   ├── MEMORY.md          # Long-term memory
│   ├── USER.md            # User profile
│   ├── AGENTS.md          # Workspace instructions
│   └── skills/            # Workspace skills
├── skills/                # Global skills directory
├── agents/                # Multi-agent configuration
│   └── main/              # Main agent
│       └── agent/
│           └── auth-profiles.json  # Authentication configuration
└── credentials/           # Channel credentials
```

When the configuration file does not exist, safe defaults are used. The configuration file must be a regular file (not a symbolic link, because OpenClaw writes using atomic replacement).

If the configuration file is in a non-default location, set the environment variable:

```bash
export OPENCLAW_CONFIG_PATH=/path/to/openclaw.json
```

### CLI configuration commands

```bash
# Read a configuration value
openclaw config get agents.defaults.workspace

# Set a configuration value
openclaw config set agents.defaults.heartbeat.every "2h"

# Delete a configuration value
openclaw config unset plugins.example

# Interactive configuration wizard
openclaw configure
```

### Minimal configuration example

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

### Model and provider configuration

OpenClaw supports multiple model providers, configured via `models.providers`:

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
      // Custom endpoint (connect to vLLM / Ollama, etc.)
      local: {
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        apiType: "openai",
      },
    },
  },
  agents: {
    defaults: {
      // Single model
      model: "claude-sonnet-4-20250514",
      // Or a model chain with failover
      // model: {
      //   primary: "claude-sonnet-4-20250514",
      //   fallbacks: ["gpt-4o", "gemini-2.0-flash"],
      // },
    },
  },
}
```

**Model failover**: Configure `primary` and `fallbacks` to automatically switch when the primary model is unavailable.

**Key storage**: The API Key supports three formats:

```json5
// 1. Plain string
"apiKey": "sk-ant-xxx..."

// 2. Environment variable reference
"apiKey": "${ANTHROPIC_API_KEY}"

// 3. SecretRef object (advanced)
"apiKey": { "source": "env", "id": "ANTHROPIC_API_KEY" }
```

The environment variable reference format is recommended, with keys stored in the `~/.openclaw/.env` file.

### Health check

```bash
openclaw doctor       # Check configuration, dependencies, and security settings
openclaw gateway status  # Check Gateway running status
```

`openclaw doctor` will check:
- Node.js version
- Configuration file integrity
- Whether the API Key is set
- Whether the DM security policy is reasonable
- Whether the sandbox configuration is safe

## Basic Usage

### Starting the Gateway

When Onboarding has installed the daemon, the Gateway starts automatically. Manual control:

```bash
openclaw gateway status          # View status
openclaw gateway stop            # Stop
openclaw gateway --port 18789 --verbose  # Foreground debug mode
```

### Opening the control panel

```bash
openclaw dashboard    # Open the control panel in the browser
```

The control panel address defaults to `http://127.0.0.1:18789/` and requires entering the Gateway token to log in.

### Sending messages

```bash
# Send a message to a specified channel
openclaw message send --target +123****7890 --message "Hello from OpenClaw"

# Chat with the assistant (can be delivered to connected channels)
openclaw agent --message "Help me write a quicksort" --thinking high
```

### Foreground debug mode

```bash
# Stop the daemon
openclaw gateway stop

# Start in foreground with verbose logs
openclaw gateway --port 18789 --verbose
```

### Updating

```bash
openclaw update              # Update to the latest stable version
openclaw update --channel dev  # Switch to the dev channel
openclaw update --channel stable  # Switch back to the stable channel
openclaw doctor              # Run a health check after updating
```

## Core Features in Detail

### Messaging Channels

OpenClaw supports 20+ messaging platforms, which is its core advantage:

| Platform | Notes |
|------|------|
| WhatsApp | Via the Baileys library, QR code pairing |
| Telegram | Bot Token, easiest to configure |
| Discord | Requires Bot Token + Message Content Intent |
| Slack | Bot Token + App Token |
| Google Chat | Enterprise users |
| Signal | Via signal-cli |
| iMessage | Via BlueBubbles |
| IRC | Traditional IRC protocol |
| Microsoft Teams | Enterprise users |
| Matrix | Decentralized chat |
| Feishu | Enterprise IM |
| LINE | Popular in Japan/Southeast Asia |
| Mattermost | Open-source Slack alternative |
| Nextcloud Talk | Self-hosted |
| WeChat | Supported |
| QQ | Supported |
| WebChat | Web chat |
| Twitch | Live stream chat |
| Zalo | Popular in Vietnam |
| Nostr | Decentralized protocol |

**Channel configuration example** (Telegram):

```json5
{
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowFrom: ["123456789", "987654321"],  // Allowed user IDs
    },
  },
}
```

**DM security policy**:

The default behavior is `dmPolicy: "pairing"` - unknown senders receive a pairing code, and the Bot does not process their messages. Only after the pairing is approved is the sender added to the whitelist.

```bash
# Approve pairing
openclaw pairing approve telegram ABC123
```

If you need to open public DM, set it explicitly:

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

**Multi-channel routing**: Different channels can be routed to different agents:

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
      agent: "shopping",  // WhatsApp messages routed to the shopping agent
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
      allowFrom: ["123456789"],
      agent: "coding",  // Discord messages routed to the coding agent
    },
  },
}
```

### Workspace and personality

OpenClaw's workspace defines the agent's identity and behavior:

| File | Purpose |
|------|------|
| `SOUL.md` | Assistant personality definition, determines the AI's way of thinking and work boundaries |
| `MEMORY.md` | Long-term memory, persists across sessions |
| `USER.md` | User profile, records user preferences and information |
| `AGENTS.md` | Workspace instructions, similar to a system prompt |
| `IDENTITY.md` | Identity information (deprecated, recommended to merge into SOUL.md) |
| `TOOLS.md` | Tool instructions (OpenClaw has built-in tool descriptions) |

Workspace path configuration:

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      // Use workspace-{agentId} in multi-agent scenarios
    },
  },
}
```

### Skill system (Skills)

Skills are reusable workflows distributed through the ClawHub skill marketplace.

**Skill sources** (4 tiers):

| Source | Path | Notes |
|------|------|------|
| Workspace skills | `workspace/skills/` | Specific to the current workspace |
| Global skills | `~/.openclaw/skills/` | Shared by all agents |
| Personal cross-project | `~/.agents/skills/` | Shared across tools |
| Project-level shared | `workspace/.agents/skills/` | Shared by the project team |

**Skill marketplace**: Visit [https://clawhub.ai](https://clawhub.ai) to browse and install skills.

### Tool system

OpenClaw has a variety of built-in tools:

| Tool | Function |
|------|------|
| bash | Shell command execution |
| process | Process management |
| read / write / edit | File operations |
| browser | Browser automation |
| canvas | Live Canvas visualization |
| nodes | Node device control |
| cron | Scheduled tasks |
| sessions | Session management |
| discord / slack | Platform-specific operations |

**Tool policy and sandbox**:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        // Sandbox mode: non-main sessions run in the sandbox
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

Typical sandbox default policy: allows `bash`, `process`, `read`, `write`, `edit`, `sessions_*`; denies `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway`.

### Voice features

OpenClaw's voice capabilities are stronger than most agents:

| Feature | Platform | Notes |
|------|------|------|
| Voice Wake | macOS / iOS | Wake word activates the assistant |
| Talk Mode | Android | Continuous voice conversation |
| TTS | All platforms | Text-to-speech (ElevenLabs + system TTS) |

TTS configuration:

```json5
{
  messages: {
    tts: {
      providers: {
        elevenlabs: {
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          modelId: "eleven_multilingual_v2",
        },
        // or use system TTS
        microsoft: {
          voice: "en-US-AriaNeural",
        },
      },
    },
  },
}
```

### Live Canvas

Live Canvas is OpenClaw's unique visual workspace, where the agent can drive UI elements:

- Rendered via the A2UI protocol in the macOS app
- The agent can create interactive components
- Suitable for data visualization, dashboards, and workflow display

### MCP servers

OpenClaw supports MCP (Model Context Protocol) to connect external tools:

```json5
{
  mcp: {
    servers: {
      "my-server": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: {},
        cwd: "/tmp",
        // or HTTP transport
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

### Session management

OpenClaw's session system supports multiple sessions and inter-session communication:

```bash
# Session tools
openclaw agent --message "list sessions"  # List sessions
```

Session reset policy configuration:

```json5
{
  session: {
    reset: {
      mode: "daily",        // "daily" / "idle" / both
      atHour: 0,            // daily mode: reset at 0:00 every day
      idleMinutes: 30,      // idle mode: reset after 30 minutes of inactivity
    },
    // or use the simplified form
    // resetTriggers: ["daily", "idle"],
  },
}
```

### Cron scheduled tasks

```json5
{
  // Defined in the configuration file
  // or managed via the openclaw command
}
```

Automation is achieved via Webhooks and Cron:

- **Cron Jobs**: Execute tasks on a schedule
- **Webhooks**: Event-driven triggers
- **Gmail Pub/Sub**: Email-triggered automation

### Authentication and security

**Authentication configuration**:

```json5
{
  gateway: {
    auth: {
      token: "${HERMES_GATEWAY_TOKEN}",  // Gateway access token
    },
  },
}
```

**Security best practices**:
- Default DM pairing mode to prevent abuse by strangers
- Non-main sessions run in the sandbox
- Use `openclaw doctor` to check security configuration
- Read the Gateway exposure runbook before remote exposure

## In-session chat commands

When chatting with the assistant in a messaging platform or the control panel, use slash commands to control behavior:

### Session control

```
/status              View Gateway and session status
/new                 Start a new session
/reset               Reset the current session
/compact             Compact context
/think <level>       Set thinking depth (off/low/medium/high)
/verbose on|off      Toggle verbose output
/trace on|off        Toggle call tracing
/usage off|tokens|full  View token usage
/restart             Restart the Gateway
/activation mention|always  Set activation mode
```

- `activation mention`: Only responds when @mentioned (default for group chats)
- `activation always`: Always responds to all messages

## Tips and Best Practices

### 1. Model selection strategy

OpenClaw's model configuration supports failover chains:

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

Recommendations for different scenarios:

| Scenario | Recommended model | Reason |
|------|---------|------|
| Code writing | Claude Sonnet/Opus | Strong code generation |
| Daily conversation | GPT-4o | Fast |
| Voice conversation | Gemini 2.0 Flash | Low latency |
| Long document processing | Claude (200K context) | Large context window |
| Local deployment | Ollama + Qwen2.5 | No API cost |

### 2. Multi-agent architecture

OpenClaw natively supports multi-agent routing, which is one of its core advantages:

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
      agent: "work",  // Slack -> work agent
    },
    whatsapp: {
      allowFrom: ["+155****0123"],
      agent: "personal",  // WhatsApp -> personal agent
    },
  },
}
```

Each agent has:
- An independent workspace (SOUL.md, MEMORY.md)
- Independent model configuration
- Independent session history
- An independent skill set

### 3. Context compaction

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "auto",     // "auto" / "off"
        model: "gpt-4o-mini",  // Model used for compaction (optional)
      },
    },
  },
}
```

### 4. Thinking depth control

Different tasks suit different thinking depths:

```bash
# Simple question, quick answer
openclaw agent --message "How's the weather today" --thinking off

# Complex reasoning
openclaw agent --message "Analyze the scalability of this architecture" --thinking high
```

Or switch dynamically in chat:

```
/think high
Help me design a microservices architecture plan
```

### 5. Security hardening

**Checklist before remote exposure**:

1. Run `openclaw doctor` to check security configuration
2. Ensure DM pairing mode is enabled (default)
3. Configure the `allowFrom` whitelist
4. Enable the sandbox (non-main sessions)
5. Set the Gateway authentication token
6. Configure firewall rules

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

### 6. Performance optimization

```json5
{
  agents: {
    defaults: {
      timeoutSeconds: 900,  // Maximum execution time (seconds)
      humanDelay: {
        mode: "natural",   // "natural" / "custom" / "off"
        minMs: 500,        // Minimum delay in custom mode
        maxMs: 2000,       // Maximum delay
      },
    },
  },
}
```

`humanDelay` simulates human typing delay to make replies more natural. Set it to `off` in automation scenarios.

### 7. Node devices

OpenClaw's node apps extend the assistant's capabilities:

- **macOS node**: Voice Wake, Live Canvas, Camera capture
- **iOS node**: Voice conversation, location commands, media understanding
- **Android node**: Talk Mode, continuous voice

Node apps connect to your Gateway and do not require an additional API Key.

### 8. Migrating from Hermes

If you previously used Hermes Agent, OpenClaw provides a migration path:

```bash
# View the migration guide
# https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

Conversely, migrating from OpenClaw to Hermes:

```bash
hermes claw migrate              # Interactive migration
hermes claw migrate --dry-run    # Preview without executing
hermes claw migrate --preset full --migrate-secrets --yes  # Full migration
```

Migration includes: SOUL.md, memories, skills, channel configuration, API Keys, MCP server configuration, etc.

## Troubleshooting

### Installation issues

**Issue: Node.js version too low**

```bash
node --version  # Check version
# Requires 22.19+ or 24+
# Use nvm to install the recommended version
nvm install 24
nvm use 24
```

**Issue: Build scripts blocked after pnpm install**

```bash
pnpm approve-builds -g  # Approve build scripts
```

**Issue: Docker build OOM (exit 137)**

The host has less than 2GB of memory. Use a prebuilt image instead of building locally:

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

### Gateway issues

**Gateway not running**:

```bash
openclaw gateway status     # Check status
openclaw gateway stop       # Ensure it's stopped
openclaw gateway --port 18789 --verbose  # Foreground debugging
```

**Daemon not installed**:

```bash
openclaw onboard --install-daemon  # Reinstall the daemon
```

**Port conflict**:

```bash
# Use a different port
openclaw gateway --port 18790
```

### Channel issues

**Telegram Bot not responding**:
1. Check that the Bot Token is correct
2. Confirm that `allowFrom` includes your user ID
3. Check the DM pairing status

**WhatsApp needs re-pairing**:

WhatsApp uses QR code pairing (Baileys), not token migration. Run `openclaw configure` to re-pair.

**Discord Bot only works in DMs**:

You need to enable Message Content Intent in the Discord Developer Portal.

### Configuration issues

**Configuration file syntax error**:

OpenClaw uses the JSON5 format, which supports comments and trailing commas. But you still need to ensure the syntax is correct:

```bash
# Validate the configuration
openclaw config get agents.defaults.workspace
# If it errors, check the syntax of openclaw.json
```

**API Key not found**:

The key may be stored in multiple locations:
1. `models.providers.*.apiKey` in `openclaw.json`
2. The `~/.openclaw/.env` file
3. The `env` sub-object of `openclaw.json`
4. `agents/main/agent/auth-profiles.json`

Use `openclaw doctor` to check all locations.

## CLI command cheat sheet

```
# Installation and update
openclaw onboard              # Onboarding wizard
openclaw onboard --install-daemon  # Install daemon
openclaw update               # Update to the latest version
openclaw update --channel dev  # Switch to the dev channel
openclaw doctor               # Health check

# Gateway control
openclaw gateway status       # View status
openclaw gateway stop         # Stop
openclaw gateway --port 18789 --verbose  # Foreground debugging
openclaw dashboard            # Open the control panel

# Configuration
openclaw configure            # Configuration wizard
openclaw config get KEY       # Read configuration
openclaw config set KEY VAL   # Set configuration
openclaw config unset KEY     # Delete configuration

# Messaging and conversation
openclaw message send --target +123 --message "Hello"  # Send a message
openclaw agent --message "Question" --thinking high     # Chat with the assistant

# Security
openclaw pairing approve <channel> <code>  # Approve DM pairing

# Migration (from Hermes to OpenClaw)
# See https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

## OpenClaw vs Hermes: How to choose

| Dimension | Choose OpenClaw | Choose Hermes |
|------|-----------|----------|
| Number of messaging platforms | Need 20+ channels (iMessage, LINE, QQ, etc.) | 15+ channels is enough |
| Voice interaction | Need Voice Wake / Talk Mode | STT + TTS is enough |
| Visualization | Need Live Canvas | Dashboard is enough |
| Language ecosystem | Prefer TypeScript/Node.js | Prefer Python |
| Multi-agent | Native multi-agent routing | Profile system |
| Self-evolution | Skill marketplace | Skills + Curator auto-maintenance |
| Persistent memory | MEMORY.md + USER.md | Structured memory system |
| MCP support | Yes | Yes |
| Migration tool | Migrate in from Hermes | Migrate in from OpenClaw |

Both projects provide migration tools for each other, so you can switch at any time.

## Summary

OpenClaw is a feature-rich personal AI assistant framework, whose core advantages are:

1. **Multi-channel coverage** - 20+ messaging platforms, one assistant covering all communication channels
2. **Multi-agent routing** - Different channels routed to different agents, each independent
3. **Local-first** - Data stays on your devices, privacy is guaranteed
4. **Voice and visualization** - Voice Wake, Talk Mode, Live Canvas
5. **Secure defaults** - DM pairing, sandbox, whitelist

Learning path: Install -> Onboarding -> Configure channels -> Test conversation -> Add skills and automation as needed.

Official documentation: https://docs.openclaw.ai

GitHub repository: https://github.com/openclaw/openclaw

Skill marketplace: https://clawhub.ai
