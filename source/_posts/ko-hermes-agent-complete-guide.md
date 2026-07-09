---
title: "Hermes Agent 완전 가이드: 설치부터 마스터까지"
date: 2026-07-09 14:00:00
lang: ko
tags:
  - AI
  - Hermes
  - 튜토리얼
  - 자동화
  - LLM
categories:
  - 기술 실무
---

Hermes Agent는 Nous Research가 개발한 오픈소스 AI Agent 프레임워크로, 터미널, 메시징 플랫폼, IDE에서 실행됩니다. 도구 호출을 통해 시스템과 상호작용할 수 있으며, 20개 이상의 LLM 제공자를 지원하고 Linux, macOS, Windows, Docker에서 실행할 수 있습니다.

이 글의 목표는 간단합니다: **이 글 하나만 보면 Hermes를 마스터할 수 있다**. 설치 배포부터 사용 팁까지 모두 다룹니다.

<!-- more -->

## Hermes란 무엇인가

Hermes는 자율 코딩 및 작업 실행 Agent로, Claude Code, OpenAI Codex와 같은 카테고리에 속합니다. 하지만 몇 가지 중요한 차이점이 있습니다:

- **Skills를 통한 자기 진화** - 복잡한 문제를 해결한 후 작업 흐름을 Skill로 저장하여 이후 세션에서 자동으로 로드할 수 있습니다. 시간이 지남에 따라 Agent는 특정 작업에서 점점 더 강력해집니다
- **세션 간 영구 기억** - 사용자의 선호도, 환경 정보, 경험 교훈을 기억합니다
- **다중 플랫폼 게이트웨이** - 동일한 Agent가 Telegram, Discord, Slack, WeChat, Feishu 등 15개 이상의 플랫폼에서 실행되며, 완전한 도구 접근 능력을 갖춥니다
- **Provider 독립적** - 다른 설정 변경 없이 모델과 제공자를 중간에 전환할 수 있습니다
- **Profile 격리** - 각각 독립적인 설정, 세션, 기술, 기억을 가진 여러 Hermes 인스턴스를 실행할 수 있습니다
- **고도의 확장성** - 플러그인, MCP 서버, 커스텀 도구, Webhook 트리거, Cron 정기 작업을 지원합니다

## 시스템 요구사항

설치하기 전에 환경이 다음 조건을 충족하는지 확인하세요:

| 요구사항 | 최소 버전 | 설명 |
|------|---------|------|
| Python | 3.11+ | 설치 스크립트가 자동으로 설치 |
| Node.js | 22+ | 브라우저 도구에 필요 (선택) |
| Git | 모든 버전 | 저장소 복제에 필수 |
| 메모리 | 512MB+ | Agent 자체는 매우 적게 사용 |
| 모델 컨텍스트 | 64K tokens | 모델이 최소 64K 컨텍스트 창을 지원해야 함 |

지원 플랫폼 (Tier 1):

- macOS (Apple Silicon)
- Windows 10/11 (x86_64, aarch64)
- Linux / WSL2 (x86_64, aarch64)
- Docker 컨테이너 (x86_64, aarch64)

## 설치 가이드

### 1. Linux / macOS / WSL2

한 줄 명령으로 설치:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

설치 스크립트는 다음 단계를 자동으로 수행합니다:
1. 운영체제 및 패키지 매니저 감지
2. Python 3.11+ 및 Git 설치 (누락된 경우)
3. Hermes 저장소를 `~/.hermes/hermes-agent/`에 복제
4. Python 가상환경 생성 및 의존성 설치
5. `hermes` 명령을 `~/.local/bin/`에 설치
6. 대화형 설정 마법사 실행

설치 완료 후 셸을 다시 로드합니다:

```bash
source ~/.bashrc   # 또는 source ~/.zshrc
```

**root 사용자로 설치 시**, Hermes는 FHS 레이아웃을 사용합니다: 코드는 `/usr/local/lib/hermes-agent`에, 명령은 `/usr/local/bin/hermes`에 링크되며, 데이터는 `~/.hermes/`에 유지됩니다. 이는 Claude Code / Codex CLI의 동작과 일치합니다.

**자주 사용하는 설치 옵션**:

```bash
# 설정 마법사 건너뛰기 (CI/자동화 시나리오)
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup

# 가상환경 사용 안 함
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --no-venv

# 브랜치 지정
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --branch dev
```

### 2. Windows 네이티브

PowerShell에서 실행:

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

데스크톱 설치 프로그램을 다운로드할 수도 있습니다: [https://hermes-agent.nousresearch.com/](https://hermes-agent.nousresearch.com/)에서 Hermes Desktop 설치 패키지를 다운로드하면 CLI와 데스크톱 앱이 함께 설치됩니다.

**Windows 주의사항**:

- Alt+Enter는 Windows Terminal이 전체 화면 전환용으로 가로채므로, 줄바꿈에는 Ctrl+Enter를 사용하세요
- 첫 실행 시 HTTP 400 "No models provided"가 발생하면 config.yaml이 UTF-8 BOM 형식으로 저장되었을 수 있습니다. `hermes config edit`로 다시 저장하면 됩니다
- execute_code 샌드박스는 Windows에서 WinError 10106을 만날 수 있으며, 일반적으로 환경 변수 SYSTEMROOT가 제거되었기 때문입니다

### 3. WSL2 (Windows Subsystem for Linux)

WSL2는 Linux와 동일한 설치 스크립트를 사용합니다. 단, WSL2에서 systemd가 활성화되어 있는지 확인해야 합니다:

```bash
# /etc/wsl.conf
[boot]
systemd=true
```

systemd가 없으면 Gateway 서비스가 nohup 모드로 폴백되어 WSL2 창이 닫힐 때 종료됩니다.

설치 명령은 Linux와 동일합니다:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

### 4. Docker 배포

Docker는 서버 배포에 권장되는 방법입니다. 이미지 자체는 상태가 없으며, 모든 데이터는 볼륨 마운트를 통해 영속화됩니다.

**초기 설정** (대화형):

```bash
mkdir -p ~/.hermes
docker run -it --rm \
  -v ~/.hermes:/opt/data \
  nousresearch/hermes-agent setup
```

이렇게 하면 설정 마법사가 시작되어 API 키를 입력하라는 메시지가 표시되고 `~/.hermes/.env`에 기록됩니다. 한 번만 실행하면 됩니다.

**Gateway 모드** (백그라운드 상주):

```bash
docker run -d \
  --name hermes \
  --restart unless-stopped \
  -v ~/.hermes:/opt/data \
  -p 8642:8642 \
  nousresearch/hermes-agent gateway run
```

포트 8642는 Gateway의 API 서버와 헬스 체크 엔드포인트를 노출합니다. 채팅 플랫폼(Telegram, Discord 등)만 사용하는 경우 이 포트를 매핑하지 않아도 됩니다.

**Web Dashboard 활성화**:

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

**Docker 배포 핵심 사항**:
- 컨테이너 내 Gateway는 s6-overlay가 관리하며, 크래시 후 자동으로 재시작됩니다
- 업데이트는 `hermes update`가 아닌 새 이미지를 풀하는 방식입니다
- VPS 브라우저 콘솔에서 docker 명령을 실행하지 마세요 (특수 문자 전송에 문제가 있음). SSH를 통해 조작하세요
- API 서버를 노출하려면 반드시 `API_SERVER_KEY`를 설정하세요:

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

Termux 터미널에서 Linux와 동일한 설치 스크립트를 실행합니다. 설치 스크립트는 Termux 환경을 자동으로 감지하고 Python 표준 라이브러리 venv + pip를 사용합니다 (uv가 아님). 일부 기능은 휴대폰에서 사용할 수 없으며, 자세한 내용은 공식 Termux 문서를 참조하세요.

## 초기 설정

설치 완료 후 설정 마법사를 실행합니다:

```bash
hermes setup
```

설정 마법사는 세 가지 모드를 제공합니다:

| 모드 | 설명 | 적용 시나리오 |
|------|------|---------|
| Quick Setup (Nous Portal) | OAuth 로그인, 제로 설정 | 빠른 시작 추천 |
| Full Setup | 모든 옵션을 단계별로 설정 | 세밀한 제어가 필요한 경우 |
| Blank Slate | 최소 필수 도구만 유지 | 미니멀 제어 |

### Provider 선택

Hermes는 30개 이상의 LLM 제공자를 지원합니다. 대화형 선택기를 사용하세요:

```bash
hermes model
```

자주 사용하는 Provider 빠른 참조:

| Provider | 인증 방식 | 환경 변수 |
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
| 커스텀 엔드포인트 | URL + Key | config.yaml에서 설정 |

**중국 내 사용자 추천**: Z.AI (GLM), Kimi, MiniMax China, Alibaba Tongyi는 모두 중국 네트워크 직접 연결을 지원합니다. 커스텀 엔드포인트를 사용하여 vLLM, Ollama 등 로컬 모델 서비스에 연결할 수도 있습니다.

**커스텀 엔드포인트 설정** (로컬 Ollama 연결 예):

```bash
hermes config set model.provider custom
hermes config set model.base_url http://localhost:11434/v1
hermes config set model.api_key ollama
hermes config set model.default qwen2.5:32b
hermes config set model.context_length 65536
```

### 설정 파일 구조

Hermes는 민감한 정보와 비민감한 설정을 분리합니다:

```
~/.hermes/
├── config.yaml          # 메인 설정 파일 (설정)
├── .env                 # API 키 및 시크릿
├── skills/              # 설치된 기술
├── sessions/            # 세션 기록
├── state.db             # 세션 저장소 (SQLite + FTS5)
├── auth.json            # OAuth 토큰 및 자격 증명 풀
├── logs/                # Gateway 및 에러 로그
└── hermes-agent/        # 소스 코드 (git 설치 방식)
```

설정 확인 및 수정:

```bash
hermes config             # 현재 설정 확인
hermes config edit        # 편집기로 config.yaml 열기
hermes config set KEY VAL # 설정값 지정
hermes config path        # config.yaml 경로 출력
hermes config check       # 설정 완전성 확인
```

### 헬스 체크

설치 완료 후 진단 도구를 실행하여 모든 것이 정상인지 확인합니다:

```bash
hermes doctor
```

이 도구는 Python 버전, 의존성 무결성, 설정 파일, API 키 등을 확인합니다. `--fix`를 추가하면 일부 문제를 자동으로 수정할 수 있습니다.

## 기본 사용

### 대화형 세션 시작

```bash
hermes            # 클래식 CLI
hermes --tui      # 모던 TUI (추천)
```

TUI 모드는 모달 오버레이, 마우스 선택, 비차단 입력을 제공합니다. 두 인터페이스는 동일한 세션, 슬래시 명령, 설정을 공유합니다.

### 단일 쿼리

대화형 세션이 필요 없을 때 직접 질문할 수 있습니다:

```bash
hermes chat -q "Python으로 퀵소트 작성해줘"
```

### 기술 사전 로드

시작 시 지정된 기술을 로드합니다:

```bash
hermes -s github-pr-workflow
```

### 세션 복원

```bash
hermes --continue              # 가장 최근 세션 복원
hermes --resume my-session     # 이름으로 복원
hermes -r 20260709_143052_a1b2 # ID로 복원
```

### 작업 트리 모드

여러 Agent가 동일한 저장소를 병렬로 편집해야 할 때, 작업 트리 모드를 사용하여 git 충돌을 방지합니다:

```bash
hermes -w
```

### YOLO 모드

위험한 명령 승인을 건너뜁니다 (주의해서 사용):

```bash
hermes --yolo
```

또는 설정을 통해 스마트 승인 모드로 변경:

```bash
hermes config set approvals.mode smart  # 저위험은 자동 통과, 고위험은 여전히 확인
```

## 세션 내 슬래시 명령

대화형 세션에서 슬래시 명령을 입력하여 Agent 동작을 제어합니다. 다음은 자주 사용하는 명령 분류별 빠른 참조입니다.

### 세션 제어

```
/new              새 세션 시작
/clear            화면 지우고 새 세션 시작
/retry            마지막 메시지 재전송
/undo             마지막 상호작용 취소
/title [이름]     현재 세션 이름 지정
/compress         컨텍스트 수동 압축
/stop             백그라운드 프로세스 종료
/rollback [N]     파일 시스템 체크포인트 복원 (--checkpoints 필요)
```

### 설정 조정

```
/model [이름]     모델 확인 또는 전환
/personality [이름]  페르소나 설정
/reasoning [레벨]  추론 깊이 설정 (none|minimal|low|medium|high|xhigh)
/verbose          상세 출력 레벨 토글
/voice [on|off]   음성 모드 켜기/끄기
/yolo             승인 우회 토글
```

### 도구 및 기술

```
/tools            도구 관리
/skills           기술 검색 및 설치
/skill <이름>     현재 세션에 기술 로드
/reload-skills    기술 디렉토리 재스캔
/cron             Cron 정기 작업 관리
```

### 유틸리티

```
/branch           현재 세션 분기
/history          대화 기록 표시
/save             대화를 파일로 저장
/copy [N]         최근 응답을 클립보드에 복사
/image            로컬 이미지 첨부
/usage            Token 사용량 확인
/help             모든 명령 표시
/quit             종료
```

`/help`를 입력하면 전체 명령 목록을 볼 수 있으며, 새 버전에서는 명령이 추가될 수 있습니다.

## 핵심 기능 상세

### 도구 시스템 (Toolsets)

Hermes의 능력은 도구 세트(Toolsets)를 통해 구현됩니다. 각 도구 세트는 관련 도구들의 모음이며, 독립적으로 활성화/비활성화할 수 있습니다.

```bash
hermes tools           # 대화형 활성화/비활성화 (curses UI)
hermes tools list      # 모든 도구 및 상태 나열
hermes tools enable web     # Web 검색 활성화
hermes tools disable browser # 브라우저 자동화 비활성화
```

자주 사용하는 도구 세트 개요:

| 도구 세트 | 기능 설명 |
|--------|---------|
| `web` | Web 검색 및 콘텐츠 추출 |
| `browser` | 브라우저 자동화 (Browserbase, Camofox 또는 로컬 Chromium) |
| `terminal` | Shell 명령 실행 및 프로세스 관리 |
| `file` | 파일 읽기/쓰기, 검색, 패치 |
| `code_execution` | 샌드박스화된 Python 실행 |
| `vision` | 이미지 분석 |
| `image_gen` | AI 이미지 생성 |
| `tts` | 텍스트 음성 변환 |
| `memory` | 세션 간 영구 기억 |
| `session_search` | 과거 대화 검색 |
| `delegation` | 하위 Agent 작업 위임 |
| `cronjob` | 정기 작업 관리 |
| `todo` | 세션 내 작업 계획 및 추적 |
| `skills` | 기술 탐색 및 관리 |
| `messaging` | 크로스 플랫폼 메시지 전송 |

도구 변경은 새 세션(`/reset` 또는 재시작)에서 적용되며, prompt 캐시를 유지하기 위해 현재 세션에서는 즉시 적용되지 않습니다.

### 기술 시스템 (Skills)

기술은 Hermes가 자기 진화하는 핵심 메커니즘입니다. 기술은 재사용 가능한 작업 흐름 문서로, 특정 작업의 단계, 명령, 주의사항을 포함합니다.

**기술 설치**:

```bash
hermes skills list              # 설치된 기술 나열
hermes skills browse            # 기술 마켓 탐색
hermes skills search github     # 기술 검색
hermes skills install ID        # 기술 설치
hermes skills inspect ID        # 설치 없이 미리보기
```

기술 설치 소스 지원:
- 기술 마켓 (hub identifier)
- 직접 URL (`https://.../SKILL.md`)
- GitHub 저장소 (`hermes skills tap add owner/repo`)

**기술 자동 관리**: Hermes에는 Curator 시스템이 내장되어 있어 기술 사용 현황을 자동으로 추적합니다. 장기간 미사용 기술은 stale로 표시되어 아카이브됩니다 (삭제되지 않음). 모든 작업 전 자동 백업이 수행됩니다.
**세션 중 기술 로드**:

```
/skill github-pr-workflow
```

또는 시작 시 사전 로드:

```bash
hermes -s github-pr-workflow,code-review
```

### Profile 다중 역할 시스템

Profile은 독립된 설정 단위로, 서로 다른 정체성과 설정을 가진 여러 Hermes 인스턴스를 실행할 수 있습니다.

```bash
hermes profile list              # 모든 Profile 나열
hermes profile create dev        # 새 Profile 생성
hermes profile create pm --clone # 현재 Profile에서 복제
hermes profile use dev           # 기본 Profile 전환
hermes profile show dev          # Profile 상세 보기
hermes -p dev                    # 임시로 지정된 Profile로 실행
```

각 Profile은 다음을 가집니다:
- 독립된 SOUL.md (역할 정체성 정의)
- 독립된 skills/ 디렉토리
- 독립된 memories/ (기억)
- 독립된 config.yaml 및 .env

**전형적 적용 시나리오**: AI 개발팀 구축. PM, 아키텍트, 개발 엔지니어, QA 엔지니어 각각에 대해 Profile을 생성하여, 각 역할에 전용 정체성 정의와 작업 흐름 기술을 부여합니다.

### Gateway 메시징 플랫폼

Gateway는 Hermes를 메시징 플랫폼에서 실행하게 하며, 완전한 도구 접근 능력을 갖춥니다.

```bash
hermes gateway setup     # 플랫폼 설정
hermes gateway install   # 백그라운드 서비스로 설치
hermes gateway start     # 서비스 시작
hermes gateway stop      # 서비스 중지
hermes gateway status    # 상태 확인
```

지원 플랫폼:

| 플랫폼 | 설명 |
|------|------|
| Telegram | 완전 지원, 첫 번째 추천 |
| Discord | Message Content Intent 활성화 필요 |
| Slack | message.channels 이벤트 구독 필요 |
| WhatsApp | Baileys 라이브러리를 통해 |
| Signal | signal-cli를 통해 |
| Matrix | python-olm을 통해 |
| Email | IMAP/SMTP |
| WeChat (Weixin) | 지원 |
| Feishu | 지원 |
| WeCom (Enterprise WeChat) | 지원 |
| DingTalk | 지원 |
| SMS | Twilio 등을 통해 |
| Home Assistant | 스마트홈 연동 |
| API Server | OpenAI 호환 API |
| Webhooks | 이벤트 구동 트리거 |

**Gateway 관리 명령** (메시징 플랫폼에서 사용):

```
/approve    대기 중인 명령 승인
/deny       명령 거부
/restart    Gateway 재시작
/sethome    현재 채팅을 메인 채널로 설정
/platforms  플랫폼 연결 상태 확인
```

### Cron 정기 작업

```bash
hermes cron list                    # 정기 작업 나열
hermes cron create '0 9 * * *'      # 매일 아침 9시
hermes cron create '30m'            # 30분마다
hermes cron create 'every 2h'       # 2시간마다
hermes cron edit ID                 # 작업 편집
hermes cron pause/resume ID         # 일시정지/재개
hermes cron run ID                  # 즉시 트리거
hermes cron remove ID               # 작업 삭제
```

각 Cron 작업은 다음을 지원합니다:
- 로드할 Skills 지정
- 모델 및 Provider 오버라이드
- 사전 실행 스크립트 (데이터 수집 모드)
- 작업 체인 (상위 작업 출력을 하위 작업에 주입)
- 다중 플랫폼 전달

### MCP 서버

MCP (Model Context Protocol)는 Hermes를 외부 도구 서버에 연결합니다.

```bash
hermes mcp list              # 설정된 서버 나열
hermes mcp add NAME          # 서버 추가 (--url 또는 --command)
hermes mcp remove NAME       # 서버 제거
hermes mcp test NAME         # 연결 테스트
hermes mcp configure NAME    # 도구 선택 설정
```

MCP 서버는 stdio와 HTTP 두 가지 전송 방식을 지원하며, 도구를 자동으로 발견하여 Hermes에 등록합니다.

### 하위 Agent 위임 (Delegation)

`delegate_task`는 Hermes가 하위 Agent를 생성하여 하위 작업을 처리하게 하며, 하위 Agent는 독립된 세션과 터미널을 가집니다.

```bash
# 세션 중, Hermes가 자동으로 delegate_task 도구를 사용합니다
# CLI를 통해 수동으로 트리거할 수도 있습니다:
hermes chat -q "GRPO 논문을 조사하고 요약을 ~/research/grpo.md에 작성해줘"
```

하위 Agent 특징:
- 격리된 대화 컨텍스트
- 도구 하위 집합 선택 가능
- 배치 병렬 실행 지원
- 결과를 자동으로 요약하여 부모 Agent에 반환

### 영구 기억

Hermes는 세션 간 기억을 유지하며, 두 가지 유형으로 나뉩니다:

- **User Profile** - 사용자 정보: 이름, 역할, 선호도, 소통 스타일
- **Memory** - 환경 노트: 프로젝트 구조, 도구 특성, 경험 교훈

```bash
hermes memory status     # 기억 상태 확인
hermes memory setup      # 기억 백엔드 설정
hermes memory off        # 기억 끄기
```

기억은 각 새 세션의 시스템 프롬프트에 주입되며, 간결하고 집중되게 유지됩니다.

## 사용 팁 및 모범 사례

### 1. 모델 선택 전략

작업에 따라 적합한 모델이 다릅니다:

| 작업 유형 | 추천 모델 | 이유 |
|---------|---------|------|
| 코드 작성 | Claude Sonnet/Opus | 코드 이해 및 생성 능력 우수 |
| 일상 대화 | GPT-4o / Gemini | 속도가 빠르고 가성비 좋음 |
| 한국어 시나리오 | GLM / Qwen | 한국어 이해가 더 정확함 |
| 긴 문서 처리 | Claude (200K 컨텍스트) | 컨텍스트 창이 큼 |
| 로컬 배포 | Ollama + Qwen2.5 | API 비용 불필요 |

모델 전환은 한 번의 명령으로 가능하며, 종속성이 없습니다:

```bash
hermes model    # 대화형 선택
```

### 2. Prompt 팁

Hermes는 자연어 지시를 이해하지만, 좋은 Prompt는 효과를 크게 높입니다:

```
# 나쁜 Prompt
버그 좀 고쳐줘

# 좋은 Prompt
~/work/code/myapp/src/auth.py 파일을 확인해줘. 사용자가 로그인 시
간헐적으로 500 에러가 발생한다고 하고, 로그에 JWT 검증 실패가 표시됨.
근본 원인을 찾아 수정하고, 수정 후 pytest tests/test_auth.py로 검증해.
```

핵심 요소:
- 명확한 파일 경로
- 구체적 증상 및 에러 메시지 설명
- 검증 방법 지정
- 컨텍스트 제공 (로그, 환경)

### 3. Skills로 경험 축적

재사용 가능한 작업 흐름을 발견할 때마다 Hermes에게 기술로 저장하게 하세요:

```
방금 Hexo 블로그 배포 단계를 기술로 저장해줘
```

Hermes는 트리거 조건, 단계, 명령, 주의사항을 포함한 SKILL.md 파일을 생성합니다. 다음에 유사한 작업을 만나면 자동으로 로드됩니다.

### 4. 세션 관리

- `/title`로 세션에 이름을 지정하여 나중에 복원하기 쉽게 하세요
- 긴 세션은 `/compress`로 컨텍스트를 압축하여 Token 낭비를 방지하세요
- `/branch`로 세션을 분기하여 메인 라인에 영향을 주지 않고 다른 방법을 탐색하세요
- `hermes sessions browse`로 과거 세션을 탐색하고 검색하세요

### 5. 보안 설정

```bash
# 시크릿 마스킹 활성화 (도구 출력의 API Key가 자동으로 가려짐)
hermes config set security.redact_secrets true

# 스마트 명령 승인 (저위험 자동 통과, 고위험은 여전히 확인)
hermes config set approvals.mode smart

# 파일 시스템 체크포인트 활성화 (파일 수정 롤백 가능)
hermes config set checkpoints.enabled true
```

### 6. 다중 Agent 협업

tmux를 통해 여러 대화형 Hermes 인스턴스를 실행합니다:

```bash
# 백엔드 Agent 시작
tmux new-session -d -s backend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t backend '사용자 관리 REST API 구축' Enter

# 프론트엔드 Agent 시작
tmux new-session -d -s frontend -x 120 -y 40 'hermes -w'
sleep 8
tmux send-keys -t frontend '사용자 관리 React 대시보드 구축' Enter

# 진행 상황 확인
tmux capture-pane -t backend -p | tail -30
```

`-w` (작업 트리 모드)를 사용하여 여러 Agent가 동일한 저장소를 편집할 때 git 충돌을 방지합니다.

### 7. 음성 모드

```bash
# 음성-텍스트 변환 설정 (로컬 Whisper는 무료)
pip install faster-whisper
hermes config set stt.enabled true
hermes config set stt.provider local
```

세션 중 음성 모드 전환:

```
/voice on    # 음성 대화 모드
/voice tts   # 항상 음성으로 응답
/voice off   # 끄기
```

### 8. 성능 최적화

```bash
# 컨텍스트 압축 활성화 (기본적으로 이미 활성화됨)
hermes config set compression.enabled true
hermes config set compression.threshold 0.50  # 컨텍스트 50% 사용 시 트리거
hermes config set compression.target_ratio 0.20  # 20%로 압축

# 최대 상호작용 라운드 제한
hermes config set agent.max_turns 90
```

## 문제 해결

### 설치 문제

**문제: 설치 스크립트에서 "Git not found" 오류**

설치 스크립트가 Git 자동 설치를 시도합니다. 실패하면 수동으로 설치하세요:
- Ubuntu/Debian: `sudo apt install git`
- CentOS/RHEL: `sudo yum install git`
- macOS: `brew install git` 또는 Xcode Command Line Tools 설치

**문제: Windows에서 HTTP 400 "No models provided"**

config.yaml이 UTF-8 BOM 형식으로 저장되었습니다. `hermes config edit`로 다시 저장하면 편집기가 자동으로 BOM을 제거합니다.

**문제: WSL2에서 Gateway가 종료된 후 실행되지 않음**

`/etc/wsl.conf`에서 systemd가 활성화되어 있는지 확인하세요:
```ini
[boot]
systemd=true
```

### 모델 및 Provider 문제

```bash
hermes doctor     # 설정 및 의존성 확인
hermes auth       # OAuth Provider 재인증
```

**Copilot 403 오류**: `gh auth login`의 토큰은 Copilot API에 사용할 수 없습니다. 반드시 `hermes model` -> GitHub Copilot의 OAuth 디바이스 코드 흐름으로 인증해야 합니다.

**모델 컨텍스트 부족**: Hermes는 모델이 최소 64K tokens 컨텍스트를 지원해야 합니다. 로컬 모델은 다음과 같이 설정해야 합니다:
```bash
# Ollama
ollama run qwen2.5:32b --ctx-size 65536

# llama.cpp
./main -m model.gguf -c 65536
```

### Gateway 문제

```bash
# 로그 확인
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

**Gateway가 SSH 연결 끊김 후 종료됨**:
```bash
sudo loginctl enable-linger $USER
```

**Gateway 크래시 루프**:
```bash
systemctl --user reset-failed hermes-gateway
```

**Discord Bot 응답 없음**: Discord Developer Portal에서 Bot -> Privileged Gateway Intents로 이동하여 Message Content Intent를 활성화하세요.

**Slack Bot이 DM에서만 작동**: `message.channels` 이벤트를 구독해야 합니다. 그렇지 않으면 Bot이 공개 채널 메시지를 무시합니다.

### 도구 및 기술 문제

**도구 사용 불가**:
1. `hermes tools`로 도구 세트가 활성화되어 있는지 확인
2. 일부 도구는 환경 변수가 필요합니다 (`.env` 확인)
3. 도구 활성화 후 `/reset`으로 새 세션을 시작해야 합니다

**기술이 표시되지 않음**:
1. `hermes skills list`로 설치되었는지 확인
2. `hermes skills config`로 플랫폼 활성화 상태 확인
3. 수동 로드: `/skill name` 또는 `hermes -s name`

### 변경 사항이 적용되지 않음

| 변경 유형 | 적용 방식 |
|---------|---------|
| 도구/기술 변경 | `/reset`으로 새 세션 시작 |
| 설정 변경 (Gateway) | `/restart` |
| 설정 변경 (CLI) | 종료 후 재시작 |
| 코드 수정 | CLI 또는 Gateway 프로세스 재시작 |

### 보조 모델이 작동하지 않음

시각 분석, 컨텍스트 압축 등 보조 기능이 조용히 실패하는 경우, `auto` Provider가 백엔드를 찾지 못한 것입니다. 보조 모델을 설정하세요:

```bash
hermes config set auxiliary.vision.provider openrouter
hermes config set auxiliary.vision.model anthropic/claude-sonnet-4
```

## CLI 명령 빠른 참조표

### 전역 매개변수

```
hermes [flags] [command]

  --version, -V             버전 표시
  --resume, -r SESSION      ID로 세션 복원
  --continue, -c [NAME]     최근 또는 지정된 이름의 세션 복원
  --worktree, -w            작업 트리 모드 (병렬 Agent)
  --skills, -s SKILL        기술 사전 로드
  --profile, -p NAME        지정된 Profile 사용
  --yolo                    위험한 명령 승인 건너뛰기
```

하위 명령 없이 실행하면 기본적으로 `chat`이 시작됩니다.

### 자주 사용하는 명령

```
# 대화
hermes                          대화형 채팅
hermes chat -q "질문"           단일 쿼리
hermes chat -m model_name       모델 지정

# 설정
hermes setup                    설정 마법사
hermes model                    모델 선택기
hermes config                   설정 확인
hermes config set KEY VAL       설정값 지정
hermes auth                     자격 증명 관리
hermes doctor [--fix]           진단

# 도구 및 기술
hermes tools                    도구 관리
hermes tools list               도구 나열
hermes skills list              기술 나열
hermes skills browse            기술 마켓 탐색
hermes skills install ID        기술 설치

# Profile
hermes profile list             Profile 나열
hermes profile create NAME      Profile 생성
hermes profile use NAME         기본 Profile 전환

# Gateway
hermes gateway setup            플랫폼 설정
hermes gateway install          서비스 설치
hermes gateway start/stop       서비스 시작/중지

# 세션
hermes sessions list            세션 나열
hermes sessions browse          대화형 탐색
hermes sessions export OUT      JSONL로 내보내기

# 정기 작업
hermes cron list                작업 나열
hermes cron create SCHED        작업 생성

# 기타
hermes update                   최신 버전으로 업데이트
hermes status [--all]           컴포넌트 상태
hermes insights [--days N]      사용 분석
hermes completion bash|zsh      Shell 자동완성
```

## 결론

Hermes Agent는 강력하고 고도로 확장 가능한 AI Agent 프레임워크입니다. 이를 마스터하려면 몇 가지 핵심 개념을 이해해야 합니다:

1. **설치 배포** - 운영체제에 따라 적절한 설치 방법을 선택하세요. Docker는 서버에, 데스크톱 설치 프로그램은 개인 컴퓨터에 적합합니다
2. **Provider 설정** - 적절한 LLM 제공자를 선택하세요. 한국 사용자에게는 GLM/Kimi/Tongyi 또는 커스텀 엔드포인트를 추천합니다
3. **도구 시스템** - 필요에 따라 도구 세트를 활성화하고, 모두 활성화할 필요는 없습니다
4. **기술 축적** - 복잡한 문제를 해결할 때마다 기술로 저장하여 Agent가 지속적으로 진화하게 하세요
5. **Profile 격리** - 다중 역할 시나리오에서 Profile로 정체성과 설정을 분리하세요
6. **Gateway 배포** - Agent를 메시징 플랫폼에서 실행하여 언제든 사용할 수 있게 하세요

핵심 설계 철학: Hermes의 모든 능력은 선택 사항입니다. 최소 설정으로 시작하여 필요에 따라 기능을 추가하는 것이 올바른 사용 방법입니다.

공식 문서: https://hermes-agent.nousresearch.com/docs/

GitHub 저장소: https://github.com/NousResearch/hermes-agent
