# PDD (Plan-Driven Development)

Use the `.claude/pdd/` directory for task management.

## Upstream Write Operations

**Never execute write operations to external systems without explicit user approval.** This includes:

- PR comments and review replies (`gh api ... -X POST`)
- Issue creation (`gh issue create`)
- PR creation (`gh pr create`)
- Git push (`git push`)

Always present the content/action to the user first and wait for approval before executing.

## Directory Structure

```
.claude/
├── pdd/
│   ├── PLAN.md                          # Master plan (branch list and status)
│   └── {branch-name}/
│       ├── PLAN.md                      # Branch plan (problem/goal, solution, tasks)
│       └── NOTES_{YYYYMMDD_HHMMSS}.md  # Session discoveries and decisions
└── rules/
```

## Branch Naming

Format: `{type}/{title}`

- `type`: `feat`, `fix`, `refactor`, `chore`, `docs`
- `title`: Short kebab-case description

Examples:

- `feat/claude-code-monitoring`
- `chore/grafana-dashboard`
- `fix/otel-collector-config`

## Language

All PDD files are written in Japanese.

---

## Master PLAN.md

`.claude/pdd/PLAN.md` tracks the status of all branches.

- **In Progress / Completed**: Branches with PRs created or merged.
- **Not Started**: Branches with a PLAN created but implementation not yet begun.
- **On Hold**: Branches deferred after investigation.

## Branch PLAN.md

Each branch directory contains a PLAN.md describing the task.

```markdown
# PLAN: {branch-name}

## Goal

What this branch achieves.

## Approach

How to achieve the goal.

## Tasks

- [ ] Task 1
- [ ] Task 2
- [ ] ...
```

### Section rules

- **Goal**, **Tasks** are required.
- **Approach** is optional for small tasks.
- **Tasks** is always the last section.
- Tasks use `- [ ]` / `- [x]` checkbox format.

---

## NOTES

Session-specific discoveries and decisions.

**File naming**: `NOTES_{YYYYMMDD_HHMMSS}.md`

**NOTES にタスクを書かない。** Next Steps やチェックボックスは PLAN.md の Tasks セクションに追記する。

## Commit Messages

Follow **Conventional Commits** (one-line):

```
<type>(<scope>): <description>
```

- `type`: `feat`, `fix`, `refactor`, `chore`, `docs`
- `scope`: Optional (e.g., `monitoring`, `grafana`)
- Imperative mood, lowercase, no period

Examples:

```
feat(monitoring): add OTEL Collector + Prometheus + Loki + Grafana stack
chore(grafana): add Claude Code overview dashboard
docs: update CLAUDE.md with directory structure
```
