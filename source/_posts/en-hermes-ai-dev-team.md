---
title: Building an AI Development Team with Hermes
date: 2026-06-03 10:00:00
lang: en
categories:
  - Technical Practice
tags:
  - AI
  - Hermes
  - Development Team
  - Automation
---

With the advancement of AI technology, more development work can be assisted by AI. However, a single AI assistant often struggles to handle all roles in complex projects — product managers need to understand requirements, architects need to design systems, developers need to write code, and QA needs to verify quality.

Hermes's Profile mechanism allows us to define different identities and responsibilities for AI, building a complete AI development team. This article details how to set up and use this system.

<!-- more -->

## Core Concept: Profile and Role Isolation

Hermes's Profile is an independent configuration unit, each Profile has:

- **SOUL.md** — Role identity definition, determines AI's thinking style and work boundaries
- **skills/** — Dedicated skills directory, containing workflow knowledge for that role
- **memories/** — Independent memory, different roles don't interfere with each other
- **workspace/** — Working directory, storing output documents

This differs from regular multi-turn conversations: the PM role won't suddenly start writing code, architects won't overstep to modify requirements, each role strictly works within their defined responsibilities.

```
~/.hermes/profiles/
├── pm/                    # Product Manager
│   ├── SOUL.md
│   ├── skills/
│   │   └── team/
│   │       └── pm-workflow/
│   │           └── SKILL.md
│   ├── memories/
│   └── workspace/
├── ui/                    # UI Designer
├── sa/                    # Architect
├── dev/                   # Developer
└── qa/                    # QA Engineer
```

## Team Configuration: team.yaml

The team's behavior is defined by `~/.hermes/team.yaml`:

```yaml
team:
  name: "AI Development Team"
  members:
    pm:
      profile: pm
      role: "Product Manager"
      responsibilities:
        - Requirement analysis
        - User story writing
        - Acceptance criteria definition
      downstream: [ui, sa]
    
    ui:
      profile: ui
      role: "UI/UX Designer"
      responsibilities:
        - Interface design
        - Interaction flow design
      depends_on: [pm]
      downstream: [dev]
    
    sa:
      profile: sa
      role: "Software Architect"
      responsibilities:
        - System architecture design
        - API design
        - Data model design
      depends_on: [pm]
      downstream: [dev]
    
    dev:
      profile: dev
      role: "Developer"
      responsibilities:
        - Code implementation
        - Unit test writing
      depends_on: [ui, sa]
      downstream: [qa]
    
    qa:
      profile: qa
      role: "QA Engineer"
      responsibilities:
        - Test strategy formulation
        - Bug analysis and reporting
      depends_on: [dev]

rules:
  boundaries:
    - pm does not write code or make architecture decisions
    - ui does not write frontend code or make technical decisions
    - sa does not write specific code or make requirement decisions
    - dev does not make requirement or architecture decisions
    - qa does not write feature code or make requirement decisions
```

### Role Boundary Reference Table

| Role | Responsible For | Not Responsible For |
|------|-----------------|---------------------|
| PM | Requirement decisions, priorities, user stories | Code, architecture, technical selection |
| UI | Design decisions, visual standards, interaction flow | Frontend code, technical implementation |
| SA | Architecture decisions, API design, data models | Specific code, requirement analysis |
| Dev | Code implementation, unit tests | Requirements, architecture decisions |
| QA | Test strategy, bug analysis | Feature code, requirement decisions |

The benefit of clear boundaries is avoiding "role crossing" — PM won't suddenly start writing code, Dev won't arbitrarily modify requirements. Everything has a clear responsible person.

## Standard Development Workflow

```
┌─────────────────┐
│ PM Requirement   │
│    Analysis      │
└──────┬──────────┘
       │
       ▼
┌──────────────────────────┐
│ UI Design  │  SA Arch    │  ← Parallel phase
│            │  Design     │
└──────┬───────────────────┘
       │
       ▼
┌─────────────────┐
│  Dev Develop    │
│  Implementation │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  QA Test        │
│  Verification   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│    Release      │
└─────────────────┘
```

**Key Points**:

1. **UI phase cannot be skipped** — Even for small features, UI design needs to confirm interaction methods
2. **UI and SA are parallel** — After requirements are confirmed, interface design and architecture design can proceed simultaneously
3. **Output documentation** — Each phase's output must be documented and passed to downstream

## Practice: Manual Switch Mode

The simplest usage is manually switching Profiles:

```bash
# Phase 1: PM analyzes requirements
hermes -p pm
> Analyze requirements for "User Login" feature, output user stories and acceptance criteria
# Output: workspace/requirement-analysis-user-login.md

# Phase 2: UI designs interface (new terminal)
hermes -p ui
> Design interface based on requirement analysis document workspace/requirement-analysis-user-login.md
# Output: workspace/ui-design-user-login.md

# Phase 2: SA designs architecture (can be parallel)
hermes -p sa
> Design login module architecture and API based on requirement analysis
# Output: workspace/architecture-design-user-login.md

# Phase 3: Dev implements
hermes -p dev
> Implement user login feature based on UI design and architecture design
# Output: Feature code + unit tests

# Phase 4: QA tests and verifies
hermes -p qa
> Test user login feature, verify if it meets acceptance criteria
# Output: Test report
```

Each role only sees information within their responsibility scope, following upstream output to work.

## Advanced: Kanban Auto Coordination

For complex projects, recommend using Hermes Kanban system:

```bash
# Initialize Kanban
hermes kanban init

# Create task chain
hermes kanban create "Analyze login requirements" \
  --assignee pm \
  --skill pm-workflow

hermes kanban create "Design login interface" \
  --assignee ui \
  --skill ui-workflow \
  --parents <pm-task-id>

hermes kanban create "Design login architecture" \
  --assignee sa \
  --skill sa-workflow \
  --parents <pm-task-id>

hermes kanban create "Develop login feature" \
  --assignee dev \
  --skill dev-workflow \
  --parents <ui-id>+<sa-id>

hermes kanban create "Test login feature" \
  --assignee qa \
  --skill qa-workflow \
  --parents <dev-id>
```

The Kanban system automatically manages task dependencies, unlocking downstream tasks after upstream completes.

## SOUL.md Example

Example of PM role's SOUL.md:

```markdown
# Product Manager

You are the Product Manager of the AI Development Team, focused on requirement analysis and user experience.

## Core Identity

You excel at understanding business goals and translating them into clear development requirements.
You care about user value, not technical implementation details.

## Core Responsibilities

1. Analyze user requirements, write user stories
2. Define acceptance criteria
3. Decide feature priorities
4. Confirm if design meets requirement intent

## Things You Cannot Do

- ❌ Write code
- ❌ Make architecture decisions
- ❌ Make technical selection

## Output Standards

Requirement analysis report must include:
- Background and goals
- User stories (As a... I want to... So that...)
- Acceptance criteria (Given... When... Then...)
- Priority recommendations

## Communication Style

Concise, focused on value. Avoid technical jargon, communicate in business language.
```

Each role's SOUL.md clearly defines "what can be done" and "what cannot be done", ensuring clear role boundaries.

## FAQ

### Q: Why not use one全能 AI to complete all work?

One role doing everything leads to:
- Writing code without clear requirements
- Architecture decisions not documented
- Incomplete test coverage
- Confused responsibilities, difficult to trace

Role separation enforces process discipline, each phase has clear output.

### Q: How do roles pass information?

Through documents in `workspace/` directory:
- PM output → `workspace/requirement-analysis-*.md`
- UI output → `workspace/ui-design-*.md`
- SA output → `workspace/architecture-design-*.md`

Downstream roles read upstream documents to proceed.

### Q: What if issues are found?

Each role discovering issues should:
1. Mark the issue in their output document
2. If it's an upstream issue, feedback to upstream role
3. Don't cross boundaries to solve issues

Example: Dev finds architecture design has issues, should mark in output and notify SA to redesign, not modify architecture themselves.

## Summary

Hermes's Profile mechanism allows us to build an AI development team with clear responsibilities:

- **Role isolation**: Each role has independent identity and memory
- **Clear boundaries**: Strictly limit each role's responsibility scope
- **Standardized workflow**: Standardized development process and output passing
- **Extensible**: Can add new roles as needed

This approach is more suitable for complex projects than a single AI assistant, each role focuses on their domain, producing more professional and standardized output.

---

Related Resources:
- [Hermes Agent Documentation](https://hermes-agent.nousresearch.com/docs)
- [GitHub - Hermes Agent](https://github.com/nousresearch/hermes-agent)