---
title: 使用 Hermes 搭建 AI 开发团队
date: 2026-06-03 10:00:00
tags:
  - AI
  - Hermes
  - 开发团队
  - 自动化
categories:
  - 技术实践
---

随着 AI 技术的发展，越来越多的开发工作可以由 AI 辅助完成。但单一 AI 助手往往难以胜任复杂项目中的所有角色——产品经理需要理解需求，架构师需要设计系统，开发工程师需要编写代码，QA 需要验证质量。

Hermes 的 Profile 机制让我们可以为 AI 定义不同的身份和职责，构建一个完整的 AI 开发团队。本文详细介绍如何搭建和使用这套系统。

<!-- more -->

## 核心概念：Profile 与角色隔离

Hermes 的 Profile 是独立的配置单元，每个 Profile 拥有：

- **SOUL.md** — 角色身份定义，决定 AI 的思维方式和工作边界
- **skills/** — 专属技能目录，包含该角色的工作流程知识
- **memories/** — 独立记忆，不同角色互不干扰
- **workspace/** — 工作目录，存放产出文档

这与普通的多轮对话不同：PM 角色不会突然开始写代码，架构师不会越权修改需求，每个角色都严格在自己的职责范围内工作。

```
~/.hermes/profiles/
├── pm/                    # 产品经理
│   ├── SOUL.md
│   ├── skills/
│   │   └── team/
│   │       └── pm-workflow/
│   │           └── SKILL.md
│   ├── memories/
│   └── workspace/
├── ui/                    # UI 设计师
├── sa/                    # 架构师
├── dev/                   # 开发工程师
└── qa/                    # QA 工程师
```

## 团队配置：team.yaml

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

### 角色边界对照表

| 角色 | 负责 | 不负责 |
|------|------|--------|
| PM | 需求决策、优先级、用户故事 | 代码、架构、技术选型 |
| UI | 设计决策、视觉规范、交互流程 | 前端代码、技术实现 |
| SA | 架构决策、API设计、数据模型 | 具体代码、需求分析 |
| Dev | 代码实现、单元测试 | 需求、架构决策 |
| QA | 测试策略、Bug分析 | 功能代码、需求决策 |

边界清晰的好处是避免「串戏」——PM 不会突然开始写代码，Dev 不会擅自修改需求。每件事都有明确的负责人。

## 标准开发流程

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

## 进阶：Kanban 自动协调

对于复杂项目，推荐使用 Hermes Kanban 系统：

```bash
# 初始化 Kanban
hermes kanban init

# 创建任务链
hermes kanban create "分析登录需求" \
  --assignee pm \
  --skill pm-workflow

hermes kanban create "设计登录界面" \
  --assignee ui \
  --skill ui-workflow \
  --parents <pm-task-id>

hermes kanban create "设计登录架构" \
  --assignee sa \
  --skill sa-workflow \
  --parents <pm-task-id>

hermes kanban create "开发登录功能" \
  --assignee dev \
  --skill dev-workflow \
  --parents <ui-id>+<sa-id>

hermes kanban create "测试登录功能" \
  --assignee qa \
  --skill qa-workflow \
  --parents <dev-id>
```

Kanban 系统会自动管理任务依赖，上游完成后自动解锁下游任务。

## SOUL.md 示例

以 PM 角色的 SOUL.md 为例：

```markdown
# 产品经理

你是 AI 开发团队的产品经理，专注于需求分析和用户体验。

## 核心身份

你擅长理解业务目标，将其转化为清晰的开发需求。
你关心用户价值，而不是技术实现细节。

## 核心职责

1. 分析用户需求，编写用户故事
2. 定义验收标准
3. 决定功能优先级
4. 确认设计是否符合需求意图

## 不能做的事

- ❌ 编写代码
- ❌ 做架构决策
- ❌ 做技术选型

## 输出规范

需求分析报告必须包含：
- 背景和目标
- 用户故事（As a... I want to... So that...）
- 验收标准（Given... When... Then...）
- 优先级建议

## 沟通风格

简洁、聚焦价值。避免技术术语，用业务语言沟通。
```

每个角色的 SOUL.md 都明确定义了「能做什么」和「不能做什么」，确保角色边界清晰。

## 常见问题

### Q: 为什么不用一个全能 AI 完成所有工作？

一个角色做所有事会导致：
- 需求不清晰就开始写代码
- 架构决策没有文档记录
- 测试覆盖不完整
- 职责混乱，难以追溯

角色分离强制了流程纪律，每个阶段都有明确的产出。

### Q: 角色之间如何传递信息？

通过 `workspace/` 目录的文档传递：
- PM 产出 → `workspace/需求分析-*.md`
- UI 产出 → `workspace/UI设计-*.md`
- SA 产出 → `workspace/架构设计-*.md`

下游角色读取上游文档来开展工作。

### Q: 发现问题怎么办？

每个角色发现问题都应该：
1. 在自己的产出文档中标注问题
2. 如果是上游问题，反馈给上游角色
3. 不越界解决问题

例如：Dev 发现架构设计有问题，应该在产出中标注，并通知 SA 重新设计，而不是自己改架构。

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