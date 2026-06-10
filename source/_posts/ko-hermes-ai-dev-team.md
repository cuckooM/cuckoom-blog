---
title: Hermes로 AI 개발 팀 구축하기
date: 2026-06-03 10:00:00
lang: ko
tags:
  - AI
  - Hermes
  - 개발팀
  - 자동화
categories:
  - 기술 실천
---

AI 기술의 발전으로 점점 더 많은 개발 작업을 AI가 보조할 수 있게 되었습니다. 하지만 단일 AI 어시스턴트는 복잡한 프로젝트의 모든 역할을 수행하기 어렵습니다. 제품 관리자(PM)는 요구사항을 이해하고, 아키텍트는 시스템을 설계하며, 개발 엔지니어는 코드를 작성하고, QA는 품질을 검증해야 합니다.

Hermes의 Profile 메커니즘을 통해 AI에 서로 다른 신원과 책임을 정의하여 완전한 AI 개발 팀을 구축할 수 있습니다. 이 글에서는 이 시스템을 구축하고 사용하는 방법을 자세히 소개합니다.

<!-- more -->

## 핵심 개념: Profile과 역할 격리

Hermes의 Profile은 독립적인 설정 단위로, 각 Profile은 다음을 가집니다:

- **SOUL.md** — 역할 정체성 정의, AI의 사고방식과 작업 범위 결정
- **skills/** — 전용 스킬 디렉토리, 해당 역할의 워크플로우 지식 포함
- **memories/** — 독립된 메모리, 다른 역할과 간섭하지 않음
- **workspace/** — 작업 디렉토리, 산출물 문서 저장

이는 일반적인 대화와 다릅니다: PM 역할은 갑자기 코드를 작성하지 않고, 아키텍트는 권한을 넘어 요구사항을 수정하지 않으며, 각 역할은 자신의 책임 범위 내에서 엄격하게 작업합니다.

```
~/.hermes/profiles/
├── pm/                    # 제품 관리자
│   ├── SOUL.md
│   ├── skills/
│   │   └── team/
│   │       └── pm-workflow/
│   │           └── SKILL.md
│   ├── memories/
│   └── workspace/
├── ui/                    # UI 디자이너
├── sa/                    # 소프트웨어 아키텍트
├── dev/                   # 개발 엔지니어
└── qa/                    # QA 엔지니어
```

## 팀 구성: team.yaml

팀의 행동은 `~/.hermes/team.yaml`에 의해 정의됩니다:

```yaml
team:
  name: "AI개발팀"
  members:
    pm:
      profile: pm
      role: "제품 관리자"
      responsibilities:
        - 요구사항 분석
        - 사용자 스토리 작성
        - 수용 기준 정의
      downstream: [ui, sa]
    
    ui:
      profile: ui
      role: "UI/UX 디자이너"
      responsibilities:
        - 인터페이스 설계
        - 인터랙션 플로우 설계
      depends_on: [pm]
      downstream: [dev]
    
    sa:
      profile: sa
      role: "소프트웨어 아키텍트"
      responsibilities:
        - 시스템 아키텍처 설계
        - API 설계
        - 데이터 모델 설계
      depends_on: [pm]
      downstream: [dev]
    
    dev:
      profile: dev
      role: "개발 엔지니어"
      responsibilities:
        - 코드 구현
        - 단위 테스트 작성
      depends_on: [ui, sa]
      downstream: [qa]
    
    qa:
      profile: qa
      role: "QA 엔지니어"
      responsibilities:
        - 테스트 전략 수립
        - 버그 분석 및 보고
      depends_on: [dev]

rules:
  boundaries:
    - pm은 코드를 작성하거나 아키텍처 결정을 하지 않음
    - ui는 프론트엔드 코드를 작성하거나 기술 결정을 하지 않음
    - sa는 구체적인 코드를 작성하거나 요구사항 결정을 하지 않음
    - dev는 요구사항이나 아키텍처 결정을 하지 않음
    - qa는 기능 코드를 작성하거나 요구사항 결정을 하지 않음
```

### 역할 경계 표

| 역할 | 담당 | 비담당 |
|------|------|--------|
| PM | 요구사항 결정, 우선순위, 사용자 스토리 | 코드, 아키텍처, 기술 선택 |
| UI | 설계 결정, 시각 규범, 인터랙션 플로우 | 프론트엔드 코드, 기술 구현 |
| SA | 아키텍처 결정, API 설계, 데이터 모델 | 구체적 코드, 요구사항 분석 |
| Dev | 코드 구현, 단위 테스트 | 요구사항, 아키텍처 결정 |
| QA | 테스트 전략, 버그 분석 | 기능 코드, 요구사항 결정 |

경계가 명확하면 '역할 혼동'을 방지할 수 있습니다. PM이 갑자기 코드를 작성하지 않고, Dev가 요구사항을 임의로 수정하지 않습니다. 모든 일에 명확한 담당자가 있습니다.

## 표준 개발 프로세스

```
┌─────────────┐
│ PM 요구사항 분석 │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ UI 설계  │  SA 아키텍처 설계 │  ← 병렬 단계
└──────┬───────────────┘
       │
       ▼
┌─────────────┐
│ Dev 개발 구현 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ QA 테스트 검증 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   배포 출시   │
└─────────────┘
```

**핵심 포인트**:

1. **UI 단계 건너뛰기 불가** — 작은 기능이라도 UI 설계로 인터랙션 방식 확인 필요
2. **UI와 SA 병렬** — 요구사항 확인 후, 인터페이스 설계와 아키텍처 설계 동시 진행 가능
3. **산출물 문서화** — 각 단계 산출물은 문서화되어야 하며, 다운스트림에 전달

## 실천: 수동 전환 모드

가장 간단한 사용 방식은 수동으로 Profile을 전환하는 것입니다:

```bash
# 단계1: PM 요구사항 분석
hermes -p pm
> 「사용자 로그인」 기능 요구사항 분석, 사용자 스토리와 수용 기준 출력
# 산출물: workspace/요구사항분석-사용자로그인.md

# 단계2: UI 인터페이스 설계 (새 터미널)
hermes -p ui
> 요구사항 분석 문서 workspace/요구사항분석-사용자로그인.md 기반 인터페이스 설계
# 산출물: workspace/UI설계-사용자로그인.md

# 단계2: SA 아키텍처 설계 (병렬 가능)
hermes -p sa
> 요구사항 분석 문서 기반 로그인 모듈 아키텍처와 API 설계
# 산출물: workspace/아키텍처설계-사용자로그인.md

# 단계3: Dev 개발 구현
hermes -p dev
> UI 설계와 아키텍처 설계 기반 사용자 로그인 기능 구현
# 산출물: 기능 코드 + 단위 테스트

# 단계4: QA 테스트 검증
hermes -p qa
> 사용자 로그인 기능 테스트, 수용 기준 충족 여부 검증
# 산출물: 테스트 보고서
```

각 역할은 자신의 책임 범위 내 정보만 보고, 업스트림 산출물을 따라 작업합니다.

## 역할 작업 조율

팀 구성 후, 핵심 문제는 서로 다른 역할 간 작업을 어떻게 조율할지입니다. 이를 위해 **코디네이터** 역할이 필요합니다.

### 코디네이터의 책임

코디네이터(Orchestrator)는 다음을 담당합니다:

1. **작업 분해** — 사용자 요청을 각 역할의 하위 작업으로 분해
2. **실행 스케줄링** — 의존 관계에 따라 각 Profile 작업 실행 스케줄링
3. **컨텍스트 전달** — 업스트림 산출물을 다운스트림 역할에 전달
4. **진행 모니터링** — 실행 진행 모니터링, 예외 처리
5. **결과 통합** — 각 역할 산출물 통합, 사용자에게 보고

### 세 가지 스케줄링 방식 비교

| 방식 | 적용 시나리오 | 특징 |
|------|----------|------|
| **tmux** | 일회성 개발 작업, 빠른 응답 | 실시간 제어, 직접 Prompt 전달, 대기 지연 없음 |
| **Kanban** | 지속적 프로젝트, 세션 간 작업 | 작업 지속화, 의존성 자동 관리, 60초 dispatch 주기 |
| **delegate_task** | 동일 Profile 내 하위 작업 위임 | Profile 간 불가, 현재 세션만 가능 |

**추천 전략:**
- 빠른 개발 작업 (현재 세션 내 완료): **tmux** 사용
- 장기 프로젝트 (세션 간 지속 필요): **Kanban** 사용

### tmux 방식: 실시간 조율

빠른 개발 작업의 경우 tmux가 가장 유연한 방식입니다:

```bash
# 단계1: PM 요구사항 분석 시작
tmux new-session -d -s pm-agent -x 120 -y 40 'hermes -p pm'
tmux send-keys -t pm-agent '「사용자 로그인」 기능 요구사항 분석, 사용자 스토리와 수용 기준 출력' Enter

# 대기 후 PM 출력 획득
sleep 30 && tmux capture-pane -t pm-agent -p -S -100 > /tmp/pm-output.txt

# 단계2: UI와 SA 병렬 시작 (PM 출력 전달)
tmux new-session -d -s ui-agent 'hermes -p ui'
tmux new-session -d -s sa-agent 'hermes -p sa'

tmux send-keys -t ui-agent '요구사항 분석 결과 기반 로그인 인터페이스 설계...' Enter
tmux send-keys -t sa-agent '요구사항 분석 결과 기반 로그인 API 아키텍처 설계...' Enter

# 단계3: Dev 구현 시작 (UI + SA 완료 대기)
tmux new-session -d -s dev-agent 'hermes -p dev'
tmux send-keys -t dev-agent 'UI 설계와 아키텍처 설계 기반 로그인 기능 구현' Enter

# 단계4: QA 테스트 시작
tmux new-session -d -s qa-agent 'hermes -p qa'
tmux send-keys -t qa-agent '로그인 기능 테스트, 수용 기준 검증' Enter
```

**핵심 기법: Follow-up Prompt**

Agent가 하위 작업 실행 후 멈출 수 있어 후속 명령 전송 필요:

```bash
# Agent 상태 확인
tmux capture-pane -t dev-agent -p -S -50

# 계속 진행하도록 follow-up 전송
tmux send-keys -t dev-agent '계속해서 프론트엔드 코드를 생성하세요...' Enter
```

### 컨텍스트 전달 방식

역할 간 정보 전달은 두 가지 방식:

**방식 1: 문서 전달 (추천)**

각 역할이 `workspace/` 디렉토리에 문서를 산출하고, 다운스트림 역할이 읽기:

```
workspace/
├── 요구사항분석-사용자로그인.md      # PM 산출물
├── UI설계-사용자로그인.md        # UI 산출물
├── 아키텍처설계-사용자로그인.md      # SA 산출물
└── 테스트보고서-사용자로그인.md      # QA 산출물
```

**방식 2: 직접 전달 (tmux)**

코디네이터가 업스트림 출력을 캡처하여 다운스트림 Prompt에 직접 주입:

```bash
pm_output=$(tmux capture-pane -t pm-agent -p -S -100)
tmux send-keys -t ui-agent "다음 요구사항 기반 인터페이스 설계:\n$pm_output" Enter
```

### 조율 보고서 템플릿

작업 완료 후 코디네이터는 표준화된 보고서를 출력:

```markdown
## 팀 협업 보고서

### 작업 개요
- 유형: 신규 기능 개발
- 설명: 사용자 로그인 기능
- 프로세스: standard

### 실행 과정

#### Stage 1: PM 요구사항 분석
- 상태: 완료
- 산출물: workspace/요구사항분석-사용자로그인.md
- 소요 시간: 2분

#### Stage 2: UI + SA 설계
- UI 상태: 완료
- SA 상태: 완료
- 산출물: workspace/UI설계-사용자로그인.md, workspace/아키텍처설계-사용자로그인.md

#### Stage 3: Dev 개발
- 상태: 완료
- 산출물: src/auth/login.ts, tests/auth.test.ts

#### Stage 4: QA 테스트
- 상태: 완료
- 산출물: workspace/테스트보고서-사용자로그인.md

### 최종 결과
- 기능 완전성: 100%
- 테스트 통과율: 100%
- 인도물:
  - src/auth/login.ts
  - src/auth/login.service.ts
  - tests/auth.test.ts

### 다음 단계 제안
메인 브랜치에 병합 준비, 테스트 환경 배포 검증
```

## 심화: Kanban 자동 조율

복잡한 프로젝트의 경우 Hermes Kanban 시스템 사용을 권장:

```bash
# Kanban 초기화
hermes kanban init

# 작업 체인 생성
hermes kanban create "로그인 요구사항 분석" \
  --assignee pm \
  --skill pm-workflow

hermes kanban create "로그인 인터페이스 설계" \
  --assignee ui \
  --skill ui-workflow \
  --parents <pm-task-id>

hermes kanban create "로그인 아키텍처 설계" \
  --assignee sa \
  --skill sa-workflow \
  --parents <pm-task-id>

hermes kanban create "로그인 기능 개발" \
  --assignee dev \
  --skill dev-workflow \
  --parents <ui-id>+<sa-id>

hermes kanban create "로그인 기능 테스트" \
  --assignee qa \
  --skill qa-workflow \
  --parents <dev-id>
```

Kanban 시스템은 작업 의존성을 자동으로 관리하며, 업스트림 완료 후 다운스트림 작업이 자동으로 잠금 해제됩니다.

## 요약

Hermes의 Profile 메커니즘을 통해 책임이 명확한 AI 개발 팀을 구축할 수 있습니다:

- **역할 격리**: 각 역할은 독립된 정체성과 메모리 보유
- **경계 명확**: 각 역할의 책임 범위를 엄격히 제한
- **프로세스 규범**: 표준화된 개발 프로세스와 산출물 전달
- **확장 가능**: 필요에 따라 새 역할 추가 가능

이 방식은 단일 AI 어시스턴트보다 복잡한 프로젝트에 더 적합하며, 각 역할은 자신의 영역에 집중하여 더 전문적이고 규범화된 산출물을 제공합니다.

---

관련 리소스:
- [Hermes Agent 문서](https://hermes-agent.nousresearch.com/docs)
- [GitHub - Hermes Agent](https://github.com/nousresearch/hermes-agent)