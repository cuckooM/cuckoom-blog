---
title: "OpenClaw 완전 가이드: 설치부터 마스터까지"
date: 2026-07-09 15:00:00
lang: ko
tags:
  - AI
  - OpenClaw
  - 튜토리얼
  - 자동화
  - LLM
categories:
  - 기술 실천
---

OpenClaw는 자신의 기기에서 실행되는 오픈소스 개인 AI 어시스턴트 프레임워크입니다. TypeScript 기반으로 구축되었으며, Gateway를 통해 일상적으로 사용하는 메시징 채널을 연결하여 WhatsApp, Telegram, Slack, Discord 등 20개 이상의 플랫폼에서 AI 어시스턴트와 대화할 수 있게 해줍니다.

이 글의 목표는 Hermes 가이드와 동일합니다: **이 글 하나만 보면 OpenClaw를 마스터할 수 있습니다**. 설치 및 배포부터 사용 팁까지 모두 다룹니다.

<!-- more -->

## OpenClaw란 무엇인가

OpenClaw의 핵심 철학은 "개인 AI 어시스턴트"입니다 - 자신의 기기에서 실행되며 데이터는 본인이 통제합니다. 자율 작업 실행 Agent에 속하며, Hermes Agent, Claude Code와 같은 카테고리에 속하지만 중점이 다릅니다:

- **로컬 우선 Gateway** - 단일 제어 평면이 세션, 채널, 도구 및 이벤트를 관리하며, 모든 데이터는 본인의 기기에 남습니다
- **다중 채널 수신함** - 20개 이상의 메시징 플랫폼을 통합 접속, 하나의 어시스턴트로 모든 커뮤니케이션 채널 커버
- **다중 Agent 라우팅** - 서로 다른 채널/연락처를 격리된 Agent 인스턴스로 라우팅, 각 Agent는 독립된 작업 공간과 세션 보유
- **음성 웨이크 + 대화 모드** - macOS/iOS는 웨이크 워드 지원, Android는 연속 음성 대화 지원
- **Live Canvas** - Agent 기반 시각화 작업 공간, A2UI 프로토콜 지원
- **컴패니언 앱** - Windows Hub, macOS 메뉴바 앱, iOS/Android 노드 앱
- **스킬 생태계** - ClawHub 스킬 마켓을 통해 스킬 설치 및 공유

OpenClaw와 Hermes의 주요 차이점:

| 차원 | OpenClaw | Hermes Agent |
|------|---------|-------------|
| 언어 | TypeScript (Node.js) | Python |
| 설치 방식 | npm / 설치 스크립트 | pip / 설치 스크립트 |
| 설정 형식 | JSON5 (openclaw.json) | YAML (config.yaml) |
| 데이터 디렉토리 | ~/.openclaw/ | ~/.hermes/ |
| 메시징 플랫폼 수 | 20+ | 15+ |
| 데스크톱 앱 | Windows Hub / macOS 메뉴바 | Hermes Desktop |
| 스킬 마켓 | ClawHub | Hermes Skills Hub |
| 음성 | Voice Wake + Talk Mode | STT + TTS |
| 시각화 | Live Canvas (A2UI) | Dashboard |

## 시스템 요구사항

설치하기 전에 환경이 다음 조건을 충족하는지 확인하세요:

| 요구사항 | 최소 버전 | 설명 |
|------|---------|------|
| Node.js | 22.19+ 또는 24+ | 24가 권장 버전, 설치 스크립트가 자동 설치 |
| 메모리 | 512MB+ | Gateway 자체는 매우 가벼움 |
| 디스크 | 200MB+ | 의존성 및 스킬 포함 |
| API Key | 임의의 모델 제공자 | Anthropic, OpenAI, Google 등 |

지원 플랫폼:

- macOS (Apple Silicon + Intel)
- Linux (x86_64, aarch64)
- Windows (네이티브 + WSL2)
- Docker 컨테이너
- Raspberry Pi
- Android (Termux 또는 노드 앱 통해)
- iOS (노드 앱 통해)

## 설치 가이드

### 1. macOS / Linux / WSL2

원라인 명령어 설치 (권장):

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

설치 스크립트는 다음 단계를 자동으로 수행합니다:
1. 운영체제 및 패키지 매니저 감지
2. Node.js 24 설치 (누락되거나 버전이 너무 낮은 경우)
3. OpenClaw 패키지 전역 설치
4. 대화형 Onboarding 마법사 실행

설치 완료 후, Onboarding 실행:

```bash
openclaw onboard --install-daemon
```

Onboarding 마법사가 다음을 안내합니다:
- 모델 제공자 선택 및 API Key 입력
- Gateway 구성 (토큰 생성, 포트 설정)
- 메시징 채널 선택 (건너뛰기 가능, 이후 구성 가능)
- Gateway 데몬 설치 (launchd/systemd 사용자 서비스)

**Onboarding 건너뛰기** (CI/자동화 시나리오):

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

**로컬 접두사 설치** (시스템 Node.js에 의존하지 않음):

```bash
curl -fsSL https://openclaw.ai/install-cli.sh | bash
```

이렇게 하면 OpenClaw와 Node.js가 `~/.openclaw/` 디렉토리에 설치되어 시스템 환경을 오염시키지 않습니다.

### 2. Windows

**방법 1: Windows Hub 데스크톱 앱 (권장)**

[https://docs.openclaw.ai/platforms/windows](https://docs.openclaw.ai/platforms/windows) 에 접속하여 Windows Hub 설치 패키지를 다운로드하세요. 그래픽 인터페이스 설정, 시스템 트레이 상태, 채팅 창, 노드 모드 및 로컬 MCP 모드를 제공합니다.

**방법 2: PowerShell 설치**

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

Onboarding 건너뛰기:

```powershell
& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard
```

**방법 3: WSL2**

WSL2에서 Linux와 동일한 설치 스크립트를 사용하세요. Gateway는 WSL2에서 실행되며, Windows 측에서는 브라우저를 통해 제어판에 접속합니다.

### 3. npm / pnpm / bun 설치

자신의 Node.js 환경을 직접 관리하는 경우:

```bash
# npm
npm install -g openclaw@latest
openclaw onboard --install-daemon

# pnpm (최초 설치 후 빌드 스크립트 승인 필요)
pnpm add -g openclaw@latest
pnpm approve-builds -g
openclaw onboard --install-daemon

# bun (실험적)
bun add -g openclaw@latest
openclaw onboard --install-daemon
```

### 4. Docker 배포

Docker는 서버 배포의 권장 방식으로, 격리된 Gateway 환경을 제공합니다.

**사전 빌드된 이미지 사용**:

```bash
# GHCR (주요 레지스트리)
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# 또는 Docker Hub 이미지
export OPENCLAW_IMAGE="openclaw/openclaw:latest"

# 저장소 복제 및 설정 스크립트 실행
git clone https://github.com/openclaw/openclaw.git
cd openclaw
./scripts/docker/setup.sh
```

설정 스크립트는 자동으로 다음을 수행합니다:
- Docker 이미지 풀/빌드
- 제공자 API Key 입력 프롬프트
- Gateway 토큰 생성 및 `.env`에 기록
- 인증 키 디렉토리 생성
- Docker Compose를 통해 Gateway 시작

**오프라인 설치** (에어갭 환경):

```bash
# 네트워크가 있는 기기에서 이미지 풀
docker pull ghcr.io/openclaw/openclaw:latest
docker save ghcr.io/openclaw/openclaw:latest -o openclaw-image.tar

# 대상 기기로 전송 후 로드
docker load -i openclaw-image.tar
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh --offline
```

**Docker 배포 핵심 사항**:
- 최소 2GB 메모리 (`pnpm install`는 1GB 호스트에서 OOM 발생 가능)
- 공식 태그: `main`, `latest`, `<version>` (예: `2026.2.26`)
- `-browser` 변형 (예: `latest-browser`)은 Chromium 내장, 샌드박스 브라우저용
- VPS에 배포하기 전에 반드시 보안 강화 문서 읽기
- 제어판 주소: `http://127.0.0.1:18789/`

### 5. 기타 플랫폼

**Raspberry Pi**: ARM 아키텍처 지원, Linux와 동일한 설치 스크립트 사용.

**Android (Termux)**: Termux에서 Node.js 설치 후 npm으로 설치. OpenClaw Android 노드 앱을 설치하면 네이티브 경험을 얻을 수 있습니다.

**iOS**: App Store에서 OpenClaw 노드 앱을 설치하여 본인의 Gateway에 연결.

**Nix**: `github.com/openclaw/nix-openclaw`에서 제공하는 Nix flake 사용.

## 초기 구성

설치 완료 후, Onboarding 마법사가 구성의 주요 진입점입니다:

```bash
openclaw onboard    # 전체 Onboarding 프로세스
openclaw configure  # 구성 마법사 (언제든 실행하여 구성 수정 가능)
```

### 설정 파일 구조

OpenClaw는 JSON5 형식의 설정 파일을 사용합니다:

```
~/.openclaw/
├── openclaw.json          # 주 설정 파일 (JSON5)
├── .env                   # API 키 및 민감 정보
├── workspace/             # 기본 작업 공간
│   ├── SOUL.md            # 어시스턴트 인격 정의
│   ├── MEMORY.md          # 장기 기억
│   ├── USER.md            # 사용자 프로필
│   ├── AGENTS.md          # 작업 공간 지시
│   └── skills/            # 작업 공간 스킬
├── skills/                # 전역 스킬 디렉토리
├── agents/                # 다중 Agent 구성
│   └── main/              # 메인 Agent
│       └── agent/
│           └── auth-profiles.json  # 인증 구성
└── credentials/           # 채널 자격 증명
```

설정 파일이 없으면 안전한 기본값을 사용합니다. 설정 파일은 일반 파일이어야 합니다 (OpenClaw가 원자 교체 쓰기를 사용하므로 심볼릭 링크는 불가).

설정 파일이 기본 위치가 아닌 곳에 있는 경우, 환경 변수를 설정하세요:

```bash
export OPENCLAW_CONFIG_PATH=/path/to/openclaw.json
```

### CLI 구성 명령어

```bash
# 설정 값 읽기
openclaw config get agents.defaults.workspace

# 설정 값 지정
openclaw config set agents.defaults.heartbeat.every "2h"

# 설정 값 삭제
openclaw config unset plugins.example

# 대화형 구성 마법사
openclaw configure
```

### 최소 구성 예시

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

### 모델 및 제공자 구성

OpenClaw는 다양한 모델 제공자를 지원하며, `models.providers`를 통해 구성합니다:

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
      // 커스텀 엔드포인트 (vLLM / Ollama 등 연결)
      local: {
        baseUrl: "http://localhost:11434/v1",
        apiKey: "ollama",
        apiType: "openai",
      },
    },
  },
  agents: {
    defaults: {
      // 단일 모델
      model: "claude-sonnet-4-20250514",
      // 또는 장애 조치가 있는 모델 체인
      // model: {
      //   primary: "claude-sonnet-4-20250514",
      //   fallbacks: ["gpt-4o", "gemini-2.0-flash"],
      // },
    },
  },
}
```

**모델 장애 조치**: `primary`와 `fallbacks`를 구성하면, 주 모델을 사용할 수 없을 때 자동으로 전환됩니다.

**키 저장**: API Key는 세 가지 형식을 지원합니다:

```json5
// 1. 단순 문자열
"apiKey": "sk-ant-xxx..."

// 2. 환경 변수 참조
"apiKey": "${ANTHROPIC_API_KEY}"

// 3. SecretRef 객체 (고급)
"apiKey": { "source": "env", "id": "ANTHROPIC_API_KEY" }
```

환경 변수 참조 형식을 권장하며, 키는 `~/.openclaw/.env` 파일에 저장됩니다.

### 헬스 체크

```bash
openclaw doctor       # 구성, 의존성 및 보안 설정 확인
openclaw gateway status  # Gateway 실행 상태 확인
```

`openclaw doctor`는 다음을 확인합니다:
- Node.js 버전
- 설정 파일 무결성
- API Key 설정 여부
- DM 보안 정책 적절성
- 샌드박스 구성 안전성

## 기본 사용

### Gateway 시작

Onboarding에서 데몬을 설치한 경우, Gateway가 자동으로 시작됩니다. 수동 제어:

```bash
openclaw gateway status          # 상태 확인
openclaw gateway stop            # 중지
openclaw gateway --port 18789 --verbose  # 포그라운드 디버그 모드
```

### 제어판 열기

```bash
openclaw dashboard    # 브라우저에서 제어판 열기
```

제어판 주소는 기본적으로 `http://127.0.0.1:18789/`이며, Gateway 토큰을 입력하여 로그인해야 합니다.

### 메시지 보내기

```bash
# 지정된 채널로 메시지 전송
openclaw message send --target +123****7890 --message "Hello from OpenClaw"

# 어시스턴트와 대화 (연결된 채널에 전달 가능)
openclaw agent --message "퀵 정렬을 작성해 줘" --thinking high
```

### 포그라운드 디버그 모드

```bash
# 데몬 중지
openclaw gateway stop

# 포그라운드로 시작, 상세 로그 포함
openclaw gateway --port 18789 --verbose
```

### 업데이트

```bash
openclaw update              # 최신 안정 버전으로 업데이트
openclaw update --channel dev  # 개발 버전으로 전환
openclaw update --channel stable  # 안정 버전으로 전환
openclaw doctor              # 업데이트 후 헬스 체크 실행
```

## 핵심 기능 상세

### 메시징 채널 (Channels)

OpenClaw는 20개 이상의 메시징 플랫폼을 지원하며, 이것이 핵심 강점입니다:

| 플랫폼 | 설명 |
|------|------|
| WhatsApp | Baileys 라이브러리 통해, QR 코드 페어링 |
| Telegram | Bot Token, 가장 구성하기 쉬움 |
| Discord | Bot Token + Message Content Intent 필요 |
| Slack | Bot Token + App Token |
| Google Chat | 엔터프라이즈 사용자 |
| Signal | signal-cli 통해 |
| iMessage | BlueBubbles 통해 |
| IRC | 전통적 IRC 프로토콜 |
| Microsoft Teams | 엔터프라이즈 사용자 |
| Matrix | 탈중앙화 채팅 |
| Feishu (비서) | 엔터프라이즈 IM |
| LINE | 일본/동남아에서 주로 사용 |
| Mattermost | 오픈소스 Slack 대체 |
| Nextcloud Talk | 자체 호스팅 |
| WeChat (위챗) | 지원 |
| QQ | 지원 |
| WebChat | 웹 채팅 |
| Twitch | 라이브 방송 채팅 |
| Zalo | 베트남에서 주로 사용 |
| Nostr | 탈중앙화 프로토콜 |

**채널 구성 예시** (Telegram):

```json5
{
  channels: {
    telegram: {
      botToken: "${TELEGRAM_BOT_TOKEN}",
      allowFrom: ["123456789", "987654321"],  // 허용된 사용자 ID
    },
  },
}
```

**DM 보안 정책**:

기본 동작은 `dmPolicy: "pairing"`입니다 - 알 수 없는 발신자는 페어링 코드를 받으며, Bot은 해당 메시지를 처리하지 않습니다. 페어링을 승인한 후에야 발신자가 허용 목록에 추가됩니다.

```bash
# 페어링 승인
openclaw pairing approve telegram ABC123
```

공개 DM을 허용하려면 명시적으로 설정:

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

**다중 채널 라우팅**: 서로 다른 채널을 서로 다른 Agent로 라우팅할 수 있습니다:

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
      agent: "shopping",  // WhatsApp 메시지를 쇼핑 Agent로 라우팅
    },
    discord: {
      token: "${DISCORD_BOT_TOKEN}",
      allowFrom: ["123456789"],
      agent: "coding",  // Discord 메시지를 코딩 Agent로 라우팅
    },
  },
}
```

### 작업 공간 및 인격

OpenClaw의 작업 공간은 Agent의 정체성과 행동을 정의합니다:

| 파일 | 역할 |
|------|------|
| `SOUL.md` | 어시스턴트 인격 정의, AI의 사고 방식과 작업 경계 결정 |
| `MEMORY.md` | 장기 기억, 세션 간 유지 |
| `USER.md` | 사용자 프로필, 사용자 선호도 및 정보 기록 |
| `AGENTS.md` | 작업 공간 지시, 시스템 프롬프트와 유사 |
| `IDENTITY.md` | 정체성 정보 (사용 중단, SOUL.md로 병합 권장) |
| `TOOLS.md` | 도구 지시 (OpenClaw가 도구 설명을 내장함) |

작업 공간 경로 구성:

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      // 다중 Agent 시나리오에서 workspace-{agentId} 사용
    },
  },
}
```

### 스킬 시스템 (Skills)

스킬은 재사용 가능한 워크플로우이며, ClawHub 스킬 마켓을 통해 배포됩니다.

**스킬 소스** (4개 계층):

| 소스 | 경로 | 설명 |
|------|------|------|
| 작업 공간 스킬 | `workspace/skills/` | 현재 작업 공간 전용 |
| 전역 스킬 | `~/.openclaw/skills/` | 모든 Agent 공유 |
| 개인 크로스 프로젝트 | `~/.agents/skills/` | 도구 간 공유 |
| 프로젝트 레벨 공유 | `workspace/.agents/skills/` | 프로젝트 팀 공유 |

**스킬 마켓**: [https://clawhub.ai](https://clawhub.ai) 에 접속하여 스킬을 탐색하고 설치하세요.

### 도구 시스템

OpenClaw는 다양한 도구를 내장합니다:

| 도구 | 기능 |
|------|------|
| bash | Shell 명령 실행 |
| process | 프로세스 관리 |
| read / write / edit | 파일 작업 |
| browser | 브라우저 자동화 |
| canvas | Live Canvas 시각화 |
| nodes | 노드 기기 제어 |
| cron | 정기 작업 |
| sessions | 세션 관리 |
| discord / slack | 플랫폼 특정 작업 |

**도구 정책 및 샌드박스**:

```json5
{
  agents: {
    defaults: {
      sandbox: {
        // 샌드박스 모드: non-main 세션은 샌드박스에서 실행
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

일반적인 샌드박스 기본 정책: `bash`, `process`, `read`, `write`, `edit`, `sessions_*` 허용; `browser`, `canvas`, `nodes`, `cron`, `discord`, `gateway` 거부.

### 음성 기능

OpenClaw의 음성 기능은 대부분의 Agent보다 강력합니다:

| 기능 | 플랫폼 | 설명 |
|------|------|------|
| Voice Wake | macOS / iOS | 웨이크 워드로 어시스턴트 활성화 |
| Talk Mode | Android | 연속 음성 대화 |
| TTS | 전 플랫폼 | 텍스트 음성 변환 (ElevenLabs + 시스템 TTS) |

TTS 구성:

```json5
{
  messages: {
    tts: {
      providers: {
        elevenlabs: {
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          modelId: "eleven_multilingual_v2",
        },
        // 또는 시스템 TTS 사용
        microsoft: {
          voice: "en-US-AriaNeural",
        },
      },
    },
  },
}
```

### Live Canvas

Live Canvas는 OpenClaw만의 고유한 시각화 작업 공간으로, Agent가 UI 요소를 구동할 수 있습니다:

- macOS 앱에서 A2UI 프로토콜을 통해 렌더링
- Agent가 인터랙티브 컴포넌트 생성 가능
- 데이터 시각화, 대시보드, 워크플로 표시에 적합

### MCP 서버

OpenClaw는 MCP (Model Context Protocol)를 지원하여 외부 도구를 연결합니다:

```json5
{
  mcp: {
    servers: {
      "my-server": {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        env: {},
        cwd: "/tmp",
        // 또는 HTTP 전송
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

### 세션 관리

OpenClaw의 세션 시스템은 다중 세션 및 세션 간 통신을 지원합니다:

```bash
# 세션 도구
openclaw agent --message "list sessions"  # 세션 나열
```

세션 재설정 정책 구성:

```json5
{
  session: {
    reset: {
      mode: "daily",        // "daily" / "idle" / 둘 다
      atHour: 0,            // daily 모드: 매일 0시에 재설정
      idleMinutes: 30,      // idle 모드: 30분 비활동 시 재설정
    },
    // 또는 간소화된 형식 사용
    // resetTriggers: ["daily", "idle"],
  },
}
```

### Cron 정기 작업

```json5
{
  // 설정 파일에 정의
  // 또는 openclaw 명령을 통해 관리
}
```

Webhook와 Cron을 통해 자동화 구현:

- **Cron Jobs**: 정기 작업 실행
- **Webhooks**: 이벤트 구동 트리거
- **Gmail Pub/Sub**: 이메일 트리거 자동화

### 인증 및 보안

**인증 구성**:

```json5
{
  gateway: {
    auth: {
      token: "${HERMES_GATEWAY_TOKEN}",  // Gateway 접근 토큰
    },
  },
}
```

**보안 모범 사례**:
- 기본 DM 페어링 모드로 낯선 사람의 남용 방지
- 메인이 아닌 세션은 샌드박스에서 실행
- `openclaw doctor`로 보안 설정 확인
- 원격 노출 전 Gateway 노출 런북 읽기

## 세션 내 채팅 명령어

메시징 플랫폼이나 제어판에서 어시스턴트와 대화할 때, 슬래시 명령어로 동작을 제어합니다:

### 세션 제어

```
/status              Gateway 및 세션 상태 확인
/new                 새 세션 시작
/reset               현재 세션 재설정
/compact             컨텍스트 압축
/think <level>       사고 깊이 설정 (off/low/medium/high)
/verbose on|off      상세 출력 켜기/끄기
/trace on|off        호출 추적 켜기/끄기
/usage off|tokens|full  Token 사용량 확인
/restart             Gateway 재시작
/activation mention|always  활성화 모드 설정
```

- `activation mention`: @멘션 시에만 응답 (그룹 채팅 기본값)
- `activation always`: 모든 메시지에 항상 응답

## 사용 팁 및 모범 사례

### 1. 모델 선택 전략

OpenClaw의 모델 구성은 장애 조치 체인을 지원합니다:

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

시나리오별 추천:

| 시나리오 | 추천 모델 | 이유 |
|------|---------|------|
| 코드 작성 | Claude Sonnet/Opus | 코드 생성 능력 우수 |
| 일상 대화 | GPT-4o | 속도 빠름 |
| 음성 대화 | Gemini 2.0 Flash | 저지연 |
| 긴 문서 처리 | Claude (200K 컨텍스트) | 컨텍스트 윈도우 큼 |
| 로컬 배포 | Ollama + Qwen2.5 | API 비용 없음 |

### 2. 다중 Agent 아키텍처

OpenClaw는 다중 Agent 라우팅을 네이티브로 지원하며, 이것이 핵심 강점 중 하나입니다:

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
      agent: "work",  // Slack -> 업무 Agent
    },
    whatsapp: {
      allowFrom: ["+155****0123"],
      agent: "personal",  // WhatsApp -> 개인 Agent
    },
  },
}
```

각 Agent는 다음을 보유:
- 독립된 작업 공간 (SOUL.md, MEMORY.md)
- 독립된 모델 구성
- 독립된 세션 기록
- 독립된 스킬 세트

### 3. 컨텍스트 압축

```json5
{
  agents: {
    defaults: {
      compaction: {
        mode: "auto",     // "auto" / "off"
        model: "gpt-4o-mini",  // 압축용 모델 (선택 사항)
      },
    },
  },
}
```

### 4. 사고 깊이 제어

작업에 따라 적절한 사고 깊이가 다릅니다:

```bash
# 간단한 질문, 빠른 응답
openclaw agent --message "오늘 날씨 어때" --thinking off

# 복잡한 추론
openclaw agent --message "이 아키텍처의 확장성 문제 분석해 줘" --thinking high
```

또는 채팅에서 동적으로 전환:

```
/think high
마이크로서비스 아키텍처 방안 설계해 줘
```

### 5. 보안 강화

**원격 노출 전 체크리스트**:

1. `openclaw doctor` 실행하여 보안 설정 확인
2. DM 페어링 모드 활성화 확인 (기본값)
3. `allowFrom` 허용 목록 구성
4. 샌드박스 활성화 (메인이 아닌 세션)
5. Gateway 인증 토큰 설정
6. 방화벽 규칙 구성

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

### 6. 성능 최적화

```json5
{
  agents: {
    defaults: {
      timeoutSeconds: 900,  // 최대 실행 시간 (초)
      humanDelay: {
        mode: "natural",   // "natural" / "custom" / "off"
        minMs: 500,        // 커스텀 모드에서 최소 지연
        maxMs: 2000,       // 최대 지연
      },
    },
  },
}
```

`humanDelay`는 사람의 타이핑 지연을 시뮬레이션하여 응답을 더 자연스럽게 만듭니다. 자동화 시나리오에서는 `off`로 설정하세요.

### 7. 노드 기기

OpenClaw의 노드 앱은 어시스턴트의 능력을 확장합니다:

- **macOS 노드**: Voice Wake, Live Canvas, Camera 캡처
- **iOS 노드**: 음성 대화, 위치 명령, 미디어 이해
- **Android 노드**: Talk Mode, 연속 음성

노드 앱은 본인의 Gateway에 연결되며, 추가 API Key가 필요 없습니다.

### 8. Hermes에서 마이그레이션

이전에 Hermes Agent를 사용했다면, OpenClaw가 마이그레이션 경로를 제공합니다:

```bash
# 마이그레이션 가이드 확인
# https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

반대로, OpenClaw에서 Hermes로 마이그레이션:

```bash
hermes claw migrate              # 대화형 마이그레이션
hermes claw migrate --dry-run    # 실행 없이 미리보기
hermes claw migrate --preset full --migrate-secrets --yes  # 전체 마이그레이션
```

마이그레이션 내용: SOUL.md, 기억, 스킬, 채널 구성, API Key, MCP 서버 구성 등.

## 문제 해결

### 설치 문제

**문제: Node.js 버전이 너무 낮음**

```bash
node --version  # 버전 확인
# 22.19+ 또는 24+ 필요
# nvm으로 권장 버전 설치
nvm install 24
nvm use 24
```

**문제: pnpm 설치 후 빌드 스크립트 차단**

```bash
pnpm approve-builds -g  # 빌드 스크립트 승인
```

**문제: Docker 빌드 OOM (exit 137)**

호스트 메모리가 2GB 미만. 사전 빌드된 이미지로 로컬 빌드 대체:

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

### Gateway 문제

**Gateway가 실행되지 않음**:

```bash
openclaw gateway status     # 상태 확인
openclaw gateway stop       # 중지 확인
openclaw gateway --port 18789 --verbose  # 포그라운드 디버그
```

**데몬이 설치되지 않음**:

```bash
openclaw onboard --install-daemon  # 데몬 재설치
```

**포트 충돌**:

```bash
# 다른 포트 사용
openclaw gateway --port 18790
```

### 채널 문제

**Telegram Bot이 응답하지 않음**:
1. Bot Token이 올바른지 확인
2. `allowFrom`에 본인의 사용자 ID가 포함되어 있는지 확인
3. DM 페어링 상태 확인

**WhatsApp 재페어링 필요**:

WhatsApp은 QR 코드 페어링 (Baileys)을 사용하며, Token 마이그레이션이 아닙니다. `openclaw configure`를 실행하여 재페어링하세요.

**Discord Bot이 DM에서만 작동**:

Discord Developer Portal에서 Message Content Intent를 활성화해야 합니다.

### 구성 문제

**설정 파일 구문 오류**:

OpenClaw는 JSON5 형식을 사용하여 주석과 후행 쉼표를 지원합니다. 하지만 여전히 구문이 올바른지 확인해야 합니다:

```bash
# 설정 검증
openclaw config get agents.defaults.workspace
# 오류 발생 시 openclaw.json 구문 확인
```

**API Key를 찾을 수 없음**:

Key는 여러 위치에 저장될 수 있습니다:
1. `openclaw.json`의 `models.providers.*.apiKey`
2. `~/.openclaw/.env` 파일
3. `openclaw.json`의 `env` 하위 객체
4. `agents/main/agent/auth-profiles.json`

`openclaw doctor`로 모든 위치를 확인하세요.

## CLI 명령어 빠른 참조표

```
# 설치 및 업데이트
openclaw onboard              # Onboarding 마법사
openclaw onboard --install-daemon  # 데몬 설치
openclaw update               # 최신 버전으로 업데이트
openclaw update --channel dev  # 개발 버전으로 전환
openclaw doctor               # 헬스 체크

# Gateway 제어
openclaw gateway status       # 상태 확인
openclaw gateway stop         # 중지
openclaw gateway --port 18789 --verbose  # 포그라운드 디버그
openclaw dashboard            # 제어판 열기

# 구성
openclaw configure            # 구성 마법사
openclaw config get KEY       # 설정 읽기
openclaw config set KEY VAL   # 설정 지정
openclaw config unset KEY     # 설정 삭제

# 메시지 및 대화
openclaw message send --target +123 --message "Hello"  # 메시지 전송
openclaw agent --message "질문" --thinking high         # 어시스턴트와 대화

# 보안
openclaw pairing approve <channel> <code>  # DM 페어링 승인

# 마이그레이션 (Hermes에서 OpenClaw로)
# 참조 https://docs.openclaw.ai/install/migrating/migrating-from-hermes
```

## OpenClaw vs Hermes: 어떻게 선택할까

| 차원 | OpenClaw 선택 | Hermes 선택 |
|------|-----------|----------|
| 메시징 플랫폼 수 | 20+ 채널 필요 (iMessage, LINE, QQ 등) | 15+ 채널이면 충분 |
| 음성 상호작용 | Voice Wake / Talk Mode 필요 | STT + TTS면 충분 |
| 시각화 | Live Canvas 필요 | Dashboard면 충분 |
| 언어 생태계 | TypeScript/Node.js 선호 | Python 선호 |
| 다중 Agent | 네이티브 다중 Agent 라우팅 | Profile 시스템 |
| 자가 진화 | 스킬 마켓 | Skills + Curator 자동 유지보수 |
| 영구 기억 | MEMORY.md + USER.md | 구조화된 기억 시스템 |
| MCP 지원 | 있음 | 있음 |
| 마이그레이션 도구 | Hermes에서 전입 | OpenClaw에서 전입 |

두 프로젝트는 서로 마이그레이션 도구를 제공하므로 언제든 전환할 수 있습니다.

## 요약

OpenClaw는 기능이 풍부한 개인 AI 어시스턴트 프레임워크이며, 핵심 강점은:

1. **다중 채널 커버리지** - 20+ 메시징 플랫폼, 하나의 어시스턴트로 모든 커뮤니케이션 채널 커버
2. **다중 Agent 라우팅** - 서로 다른 채널을 서로 다른 Agent로 라우팅, 각각 독립적
3. **로컬 우선** - 데이터는 본인의 기기에 남아 프라이버시 보장
4. **음성 및 시각화** - Voice Wake, Talk Mode, Live Canvas
5. **안전한 기본값** - DM 페어링, 샌드박스, 허용 목록

마스터 경로: 설치 -> Onboarding -> 채널 구성 -> 테스트 대화 -> 필요에 따라 스킬 및 자동화 추가.

공식 문서: https://docs.openclaw.ai

GitHub 저장소: https://github.com/openclaw/openclaw

스킬 마켓: https://clawhub.ai
