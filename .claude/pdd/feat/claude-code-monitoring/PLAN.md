# PLAN: feat/claude-code-monitoring

## Goal

Claude Code の利用状況を OTEL + Prometheus + Loki + Grafana で可視化する環境を構築する。

メトリクス（コスト、トークン、セッション数）とイベント（ツール利用、ユーザープロンプト）を収集・分析可能にする。

## Approach

- Docker Compose で OTEL Collector, Prometheus, Loki, Grafana を起動
- Claude Code の OTEL テレメトリを有効化（settings.local.json）
- Grafana ダッシュボードでメトリクスとイベントを可視化

## Tasks

- [x] Docker Compose 構成を作成（OTEL Collector + Prometheus + Loki + Grafana）
- [x] OTEL Collector 設定（metrics → Prometheus, logs → Loki）
- [x] Grafana データソース provisioning（Prometheus + Loki）
- [x] Claude Code テレメトリ有効化（atoms, mago-claude-config, bytebase-claude-config）
- [x] 動作確認（メトリクス・イベントが収集されていることを確認）
- [x] Grafana ダッシュボード作成（Claude Code Overview）
- [ ] ダッシュボードの動作確認・調整
- [ ] CLAUDE.md にモニタリング環境の起動手順を追記
- [ ] 初回コミット・PR
