# Universal Project Architecture Framework

> Reusable AI-driven project architecture for Claude Code / OpenCode

## Framework Overview

This framework provides a universal architecture design system for AI-assisted development. It includes commands, skills, hooks, and rules that enforce best practices across all projects.

## Quick Start Commands

| Command | Description |
|---------|-------------|
| `/bootstrap` | Initialize new project with architecture templates |
| `/commit` | Complete task with documentation update and git commit |
| `/start` | Show current project status |
| `/progress` | View detailed project progress |
| `/next` | Get next development suggestions |
| `/update-status` | Update project status documentation |

---

## Skills (Organized by Category)

### Core Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `planning-with-files` | `.claude/skills/core/` | plan, planning, task, project, scope, requirements, manus |
| `spec-interview` | `.claude/skills/core/` | spec, specification, interview, requirements, clarify |
| `bug-debug` | `.claude/skills/core/` | bug, error, exception, debug, troubleshoot, problem |
| `context7` | `.claude/skills/core/` | docs, documentation, library, API reference |

### Frontend Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `react-frontend` | `.claude/skills/frontend/` | react, frontend, component, hooks, typescript, jsx, tsx |
| `ui-ux-pro-max` | `.claude/skills/frontend/` | ui, ux, design, style, color, typography, landing, dashboard |

### Backend Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `electron-main` | `.claude/skills/backend/` | electron, main process, ipc, database, sqlite, native module |

### Data Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `rag-vectordb` | `.claude/skills/data/` | rag, vector, retrieval, knowledge, embedding, lancedb |

### AI Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `ai-integration` | `.claude/skills/ai/` | ai, llm, gemini, ollama, openai, api, chat, generate |

### DevOps Skills

| Skill | Location | Trigger Keywords |
|-------|----------|------------------|
| `mcp-tools` | `.claude/skills/devops/` | mcp, tool, protocol, server, browser |
| `platform-build` | `.claude/skills/devops/` | package, build, electron-builder, installer, dmg, exe |

---

## Hooks System

### Hook Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Start                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ session-start.ps1 → rules-loader.ps1                 │    │
│  │ (Load project context and mandatory rules)           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    User Prompt Submit                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ skill-forced-eval.ps1                                │    │
│  │ (Force evaluate and activate relevant skills)        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Pre Tool Use                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ pre-tool-use.ps1 → plan-reread.ps1                   │    │
│  │ (Remind to check planning files before changes)      │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Stop                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ completion-check.ps1 → stop.ps1                      │    │
│  │ (Verify task completion and documentation)           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Hook Files

| Hook | Trigger | Purpose |
|------|---------|---------|
| `session-start.ps1` | SessionStart | Initialize session context |
| `rules-loader.ps1` | SessionStart | Force load project rules (CLAUDE.md, AGENTS.md, rules/*.md) |
| `skill-forced-eval.ps1` | UserPromptSubmit | Evaluate and activate relevant skills |
| `pre-tool-use.ps1` | PreToolUse | Pre-execution checks |
| `plan-reread.ps1` | PreToolUse (Write/Edit/Bash) | Remind to check planning files |
| `completion-check.ps1` | Stop | Verify task completion checklist |
| `stop.ps1` | Stop | Session cleanup |

---

## Rules System

### Rule Files

| File | Purpose |
|------|---------|
| `.claude/rules/architecture-rules.md` | Code architecture patterns and conventions |
| `.claude/rules/ui-ux-rules.md` | UI/UX design standards and checklist |

### Rule Loading

Rules are automatically loaded at session start by `rules-loader.ps1`. The AI is instructed to:

1. **Read** all rule files
2. **Follow** all conventions defined
3. **Reference** rules when making implementation decisions

---

## Planning System (Manus-Style)

### Planning Files

Located at `planning/` or `.claude/planning/`:

| File | Purpose |
|------|---------|
| `task_plan.md` | Current task phases and status |
| `progress.md` | Detailed progress tracking |
| `findings.md` | Research findings and discoveries |

### Planning Workflow

```
1. /bootstrap → Creates planning templates
2. Update task_plan.md with task details
3. Work through phases (Discovery → Planning → Implementation → Testing → Delivery)
4. Update progress.md as work progresses
5. Document findings in findings.md
6. /commit → Complete with documentation update
```

---

## Directory Structure

```
project/
├── .claude/
│   ├── commands/
│   │   ├── bootstrap.md       # Project initialization
│   │   ├── commit.md          # Task completion
│   │   ├── start.md           # Show project status
│   │   ├── progress.md        # View progress
│   │   ├── next.md            # Get suggestions
│   │   └── update-status.md   # Update docs
│   ├── skills/
│   │   ├── core/
│   │   │   ├── planning-with-files/
│   │   │   ├── spec-interview/
│   │   │   ├── bug-debug/
│   │   │   └── context7/
│   │   ├── frontend/
│   │   │   ├── react-frontend/
│   │   │   └── ui-ux-pro-max/
│   │   ├── backend/
│   │   │   └── electron-main/
│   │   ├── data/
│   │   │   └── rag-vectordb/
│   │   ├── ai/
│   │   │   └── ai-integration/
│   │   └── devops/
│   │       ├── mcp-tools/
│   │       └── platform-build/
│   ├── hooks/
│   │   ├── session-start.ps1
│   │   ├── rules-loader.ps1
│   │   ├── skill-forced-eval.ps1
│   │   ├── pre-tool-use.ps1
│   │   ├── plan-reread.ps1
│   │   ├── completion-check.ps1
│   │   └── stop.ps1
│   ├── rules/
│   │   ├── architecture-rules.md
│   │   └── ui-ux-rules.md
│   ├── agents/
│   │   ├── code-reviewer.md
│   │   ├── feature-developer.md
│   │   └── project-manager.md
│   └── settings.json
├── .opencode/
│   └── AGENTS.md              # This file
├── docs/
│   └── ARCHITECTURE.md        # Project architecture
├── planning/
│   ├── task_plan.md
│   ├── progress.md
│   └── findings.md
└── CLAUDE.md                   # Project configuration
```

---

## Agent System

### Available Agents

| Agent | Purpose | Permissions |
|-------|---------|-------------|
| `code-reviewer` | Code review and best practices | Read-only |
| `feature-developer` | Feature implementation | Full |
| `project-manager` | Progress tracking and status updates | Read + docs edit |

### Agent Workflow

```
Start Task
    │
    ▼
1. Read Project Docs
   - docs/ARCHITECTURE.md
   - planning/task_plan.md
   - .opencode/AGENTS.md
    │
    ▼
2. Use Available Skills
   - Based on task type
   - Skill auto-activation via hooks
    │
    ▼
3. LSP-Assisted Development
   - Type checking
   - Definition lookup
   - Reference finding
    │
    ▼
4. Complete Task
   - Run /commit
   - Update documentation
   - Notify project-manager
```

---

## Configuration

### settings.json

The `.claude/settings.json` file configures:

- **Hooks**: Automation scripts for different events
- **MCP Servers**: External tool integrations (e.g., context7)

### Key Settings

```json
{
  "hooks": {
    "SessionStart": ["session-start.ps1", "rules-loader.ps1"],
    "UserPromptSubmit": ["skill-forced-eval.ps1"],
    "PreToolUse": ["pre-tool-use.ps1", "plan-reread.ps1"],
    "Stop": ["completion-check.ps1", "stop.ps1"]
  },
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  }
}
```

---

## Usage for New Projects

### Option 1: Copy Configuration

1. Copy `.claude/` directory to new project
2. Copy `planning/` directory (or create fresh)
3. Create `docs/ARCHITECTURE.md` from template
4. Create `CLAUDE.md` with project-specific rules

### Option 2: Use /bootstrap Command

1. Run `/bootstrap` in new project
2. Follow the spec-interview prompts
3. Templates are automatically created

---

## Best Practices

### Before Starting Any Task

1. ✅ Run `/start` to see project status
2. ✅ Check `planning/task_plan.md` for current phase
3. ✅ Read relevant skill documentation

### During Development

1. ✅ Update `progress.md` as you work
2. ✅ Document findings in `findings.md`
3. ✅ Use `lsp_diagnostics` before completing tasks

### After Completing Task

1. ✅ Run `/commit` to finalize
2. ✅ Verify all checklists pass
3. ✅ Update documentation

---

## References

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs)
- [OpenCode Documentation](https://opencode.ai/docs)
- [Planning-with-Files Pattern](https://github.com/anthropic/claude-code-samples)
