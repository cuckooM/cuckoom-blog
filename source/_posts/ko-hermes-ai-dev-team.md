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

AI 기술의 발전으로越来越多的开发工作可以由 AI 辅助完成。但单一 AI 助手往往难以胜任复杂项目中的所有角色——产品经理需要理解需求，架构师需要设计系统，开发工程师需要编写代码，QA 需要验证质量。

Hermes 的 Profile 机制让我们可以为 AI 定义不同的身份和职责，构建一个完整的 AI 开发团队。本文详细介绍如何搭建和使用这套系统。

<!-- more -->

## 핵심 개념: Profile과 역할 격리

Hermes 的 Profile 是独立的配置单元，每个 Profile 拥有：

- **SOUL.md** — 角色身份定义，决定 AI 的思维方式和工作边界
- **skills/** — 专属技能目录，包含该角色的工作流程知识
- **memories/** — 独立记忆，不同角色互不干扰
- **workspace/** — 工作目录，存放产出文档

这与普通的多轮对话不同：PM 角色不会突然开始写代码，架构师不会越权修改需求，每个角色都严格在自己的职责范围内工作。

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

团队的行为由 `~/.hermes/team.yaml` 定义：

```yaml
team:
  name: "AI开发团队"
  members:
    pm:
      profile: pm
      role: "产品经理"
      responsibilities:
        - 需求分析
        - 用户故事编写
        - 验收标准定义
      downstream: [ui, sa]
    
    ui:
      profile: ui
      role: "UI/UX设计师"
      responsibilities:
        - 界面设计
        - 交互流程设计
      depends_on: [pm]
      downstream: [dev]
    
    sa:
      profile: sa
      role: "软件架构师"
      responsibilities:
        - 系统架构设计
        - API设计
        - 数据模型设计
      depends_on: [pm]
      downstream: [dev]
    
    dev:
      profile: dev
      role: "开发工程师"
      responsibilities:
        - 代码实现
        - 单元测试编写
      depends_on: [ui, sa]
      downstream: [qa]
    
    qa:
      profile: qa
      role: "QA工程师"
      responsibilities:
        - 测试策略制定
        - Bug分析和报告
      depends_on: [dev]

rules:
  boundaries:
    - pm不编写代码或做架构决策
    - ui不写前端代码或做技术决策
    - sa不写具体代码或做需求决策
    - dev不做需求或架构决策
    - qa不写功能代码或做需求决策
```

### 역할 경계 표

| 角色 | 负责 | 不负责 |
|------|------|--------|
| PM | 需求决策、优先级、用户故事 | 代码、架构、技术选型 |
| UI | 设计决策、视觉规范、交互流程 | 前端代码、技术实现 |
| SA | 架构决策、API设计、数据模型 | 具体代码、需求分析 |
| Dev | 代码实现、单元测试 | 需求、架构决策 |
| QA | 测试策略、Bug分析 | 功能代码、需求决策 |

边界清晰的好处是避免「串戏」——PM 不会突然开始写代码，Dev 不会擅自修改需求。每件事都有明确的负责人。

## 표준 개발 프로세스

```
┌─────────────┐
│ PM 需求分析  │
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│ UI设计  │  SA架构设计 │  ← 并行阶段
└──────┬───────────────┘
       │
       ▼
┌─────────────┐
│ Dev 开发实现 │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ QA 测试验证  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   发布上线   │
└─────────────┘
```

**关键点**：

1. **UI 阶段不可跳过** — 即使是小功能，也需要 UI 设计确认交互方式
2. **UI 和 SA 并行** — 需求确认后，界面设计和架构设计可以同时进行
3. **产出文档化** — 每阶段产出必须形成文档，传递给下游

## 实践：手动切换模式

最简单的使用方式是手动切换 Profile：

```bash
# 阶段1：PM 分析需求
hermes -p pm
> 分析「用户登录」功能的需求，输出用户故事和验收标准
# 产出：workspace/需求分析-用户登录.md

# 阶段2：UI 设计界面（新终端）
hermes -p ui
> 根据需求分析文档 workspace/需求分析-用户登录.md 设计界面
# 产出：workspace/UI设计-用户登录.md

# 阶段2：SA 设计架构（可并行）
hermes -p sa
> 根据需求分析文档设计登录模块的架构和 API
# 产出：workspace/架构设计-用户登录.md

# 阶段3：Dev 开发实现
hermes -p dev
> 根据 UI 设计和架构设计实现用户登录功能
# 产出：功能代码 + 单元测试

# 阶段4：QA 测试验证
hermes -p qa
> 测试用户登录功能，验证是否符合验收标准
# 产出：测试报告
```

每个角色只看到自己职责范围内的信息，遵循上游产出来工作。

## 总结

Hermes 的 Profile 机制让我们可以构建一个职责清晰的 AI 开发团队：

- **角色隔离**：每个角色有独立身份和记忆
- **边界清晰**：严格限制每个角色的职责范围
- **流程规范**：标准化的开发流程和产出传递
- **可扩展**：可以根据需要添加新角色

这种方式比单一 AI 助手更适合复杂项目，每个角色专注于自己的领域，产出更专业、更规范。

---

相关资源：
- [Hermes Agent 文档](https://hermes-agent.nousresearch.com/docs)
- [GitHub - Hermes Agent](https://github.com/nousresearch/hermes-agent)