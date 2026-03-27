# home-lab

個人のインフラ実験場。Observability、自分データの可視化、IoT、3Dプリントなどを扱う。

## Quick Start

```bash
docker compose up -d
```

## Directory Structure

```
home-lab/
├── claude-code-monitoring/  # OTEL Collector + Prometheus + Loki + Grafana
├── .claude/
│   ├── rules/           # Claude Code ルール
│   └── settings.json    # Claude Code 設定
└── CLAUDE.md
```

## Coding Guidelines

- Docker Compose で構成を管理する
- 設定ファイルには適切なコメントを残す
- シークレットは `.env` に分離し、Git にコミットしない
