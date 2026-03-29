# Master Plan

## 進行中

| Branch | Description | Status |
| :- | :- | :- |

## 候補

会話やリサーチで出てきたアイデア。優先度は未定。実行する場合はブランチを切って「進行中」に移動する。

### Observability / 分析

| テーマ | 概要 |
| :- | :- |
| プロンプト分析 | Loki のプロンプト・ツール利用データを使ったセッションフロー再構成、スキル効率比較、コストパターン分析 |
| Grafana ダッシュボード同期 | ファイル ⇔ Grafana DB の同期運用を整理。API エクスポートの自動化等 |

### 自分データ

| テーマ | 概要 |
| :- | :- |
| Obsidian データ可視化 | Vault のメタデータ（タグ推移、記述量、トピック分布）を Grafana に載せる |
| HealthKit データ | iPhone ヘルスデータ（体重、心拍、睡眠）を Grafana で時系列可視化 |

### IoT / 物理デバイス

| テーマ | 概要 |
| :- | :- |
| 自宅環境センシング | CO2・温湿度センサー → Prometheus → Grafana。環境条件と集中力の相関分析 |
| 3Dプリント (CadQuery) | BambuLab A1 Mini + CadQuery (Python) でセンサー筐体やデスク周りのパーツを設計 |

### インフラ

| テーマ | 概要 |
| :- | :- |
| GCP デプロイ | モニタリングスタックを GCP にホスティング。Terraform で管理 |

## 完了

| Branch | Description |
| :- | :- |
| `feat/claude-code-monitoring` | Claude Code モニタリング環境 (OTEL + Prometheus + Loki + Grafana) |

## 保留
