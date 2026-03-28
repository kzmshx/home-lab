---
name: hl-commit
description: >
  Commit changes to the home-lab repository.
  Use this skill when the user asks to commit, says "コミット",
  or has finished making changes and wants to save them.
disable-model-invocation: false
allowed-tools: Bash(git diff *), Bash(git log *), Bash(git status *), Bash(git add *), Bash(git commit *), Read, Glob, Grep
argument-hint: "[file paths or scope description]"
---

Commit changes to the home-lab repository.

## Step 1: Understand the current state

Run these in parallel:

1. `git status` -- changed and untracked files
2. `git diff` -- unstaged changes
3. `git diff --cached` -- staged changes
4. `git log --oneline -5` -- recent commit style

## Step 2: Check for sensitive content

Before committing, scan changed files for credentials or secrets:

```bash
git diff HEAD | grep -iE '(password|secret|token|api.?key|credential)' || true
```

If any matches look like real credentials (not placeholders), warn the user and do NOT commit.

## Step 3: Group and commit

1. Group changes into logical commits
2. Stage specific files with `git add <files>` (never `git add .` or `git add -A`)
3. Commit with a message following the format below
4. Run `git status` after all commits to verify clean state

### Commit message format

```
type(scope): description
```

- **type**: `feat`, `fix`, `chore`, `refactor`, `docs`
- **scope**: optional -- `monitoring`, `grafana`, `claude`
- **description**: imperative mood, lowercase, no period
- **One-line only**: no multi-line messages, no `Co-Authored-By` trailers

Always pass the message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description
EOF
)"
```

### Examples

```
feat(monitoring): add OTEL Collector + Prometheus + Loki + Grafana stack
chore(grafana): add Claude Code overview dashboard
chore(claude): update permissions to modern syntax
docs: update CLAUDE.md with monitoring setup instructions
```

## Grouping heuristics

- Same directory + same purpose = one commit
- PDD files (PLAN.md, NOTES) are their own commit
- Config changes (.claude/) and application code (claude-code-monitoring/) are separate commits
- When in doubt, fewer commits is better

## Guidelines

- **Never amend**: Always create new commits, never amend existing ones.
- **Never push**: Do not push unless the user explicitly asks.
- **Specific staging**: Always stage specific files by name.
- **No secrets**: Never commit credentials, passwords, tokens, or API keys.
