# home-lab

個人のインフラ実験場。Observability、自分データの可視化、IoT、3Dプリントなどを扱う。

## Directory Structure

```
home-lab/
├── claude-code-monitoring/  # OTEL Collector + Prometheus + Loki + Grafana
├── .claude/
│   ├── hooks/           # Claude Code hooks
│   ├── pdd/             # Plan-Driven Development
│   ├── rules/           # Claude Code ルール
│   └── settings.json    # Claude Code 設定
└── CLAUDE.md
```

## Claude Code Monitoring

Claude Code の利用状況を可視化する環境。

### 起動

```bash
cd claude-code-monitoring
docker compose up -d
```

### アクセス

| サービス | URL | 備考 |
| :- | :- | :- |
| Grafana | http://localhost:3001 | admin/admin |
| Prometheus | http://localhost:9090 | |
| Loki | http://localhost:3100 | |
| OTEL Collector | localhost:4317 (gRPC), localhost:4318 (HTTP) | |

### Claude Code 側の設定

各プロジェクトの `.claude/settings.local.json` に以下を追加:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_LOG_TOOL_DETAILS": "1",
    "OTEL_LOG_USER_PROMPTS": "1"
  }
}
```

## Coding Guidelines

- Docker Compose で構成を管理する
- 設定ファイルには適切なコメントを残す
- シークレットは `.env` に分離し、Git にコミットしない
