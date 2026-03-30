# PLAN: feat/retro-dashboard-personal

## Goal

retro-dashboard を「インフラモニタリング」から「パーソナルインフォメーションラジエーター」に拡張する。Obsidian の日報・ナレッジベースと接続し、5インチ CRT 風画面（1280x720）に日常の情報を流す。

## 背景

- Wokyis M5（Mac mini 用レトロドック、5インチディスプレイ内蔵）の購入検討が発端
- vanilla JS プロトタイプ → MoonBit + Rabbita への移行済み（CLAUDE タブ）
- CI/SYSTEM タブはプロトタイプにあるが MoonBit 未移植

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ Browser (1280x720)                          │
│ MoonBit + Rabbita (TEA)                     │
│ ┌─────┬────────┬───────┬──────────┐         │
│ │DAILY│ CLAUDE │  CI   │  FEED    │         │
│ └─────┴────────┴───────┴──────────┘         │
│         ▲ HTTP GET / SSE                    │
└─────────┼───────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────┐
│ server (Hono + Bun)                         │
│                                             │
│ /daily          ← Obsidian Vault 読み取り   │
│ /daily/stream   ← SSE (タイムライン更新監視) │
│ /daily/reaction ← AI リアクション生成       │
│ /daily/past     ← N ヶ月前の日報            │
│ /claude-metrics ← Prometheus proxy          │
│ /feed           ← ニュースフィード          │
└─────────────────────────────────────────────┘
     │          │           │
     ▼          ▼           ▼
  Obsidian   Prometheus   外部API
  Vault                   (HN/GitHub/Zenn)
```

### SSE (Server-Sent Events)

- タイムライン更新: ファイル監視 (`watchdog` or `inotify`) で日報変更を検知 → SSE で差分を配信
- ニュースフィード: 定期ポーリング → SSE で新着を配信
- Rabbita 側: `@cmd.raw_effect` + JS の `EventSource` で SSE を受信（proxy パターンでは不可、JS FFI が必要）

### SSE と Rabbita の接続

`@cmd.raw_effect` の `scheduler.add` が外部パッケージから使えない問題がある。解決策:

1. **JS FFI でグローバルコールバックを登録**: `window.__dispatch = (msg) => { ... }` を mount 時に登録し、EventSource の onmessage から呼ぶ
2. **ポーリングフォールバック**: SSE が使えない場合は `@http.get` + `@rabbita.delay` で定期取得

## タブ構成

### DAILY（新規・最優先）

- 今日の日報をパース → タイムライン表示（時刻 + テキスト）
- SSE でリアルタイム更新
- AI リアクション（一言コメント、関連 atom へのリンク）
- 「N ヶ月前の今日」表示

### FEED（新規）

- 日報・atom のタグからトピックを抽出
- HN / GitHub Trending / Zenn をフィルタ
- SSE で新着配信
- VT323 フォントでゆっくりスクロール

### CLAUDE（移植済み）

- Prometheus proxy 経由で Claude Code メトリクス表示

### CI（プロトタイプ済み、MoonBit 未移植）

- GitHub Actions ワークフロー監視
- Happy Mac / Sad Mac アイコン

## Tasks

### 完了

- [x] metrics-server: `/daily` エンドポイント（日報パース、タイムライン抽出、JSON 返却）
- [x] metrics-server: `/daily/stream` SSE エンドポイント（ファイル監視 + 差分配信）
- [x] metrics-server: ThreadingHTTPServer 化（SSE がメインスレッドをブロックする問題の修正）
- [x] MoonBit: SSE 受信の JS FFI ラッパー → **断念**（dispatch が Cmd を返すだけで inbox に届かない）
- [x] MoonBit: DAILY タブ — タイムライン表示（基本 UI）+ 10秒ポーリング
- [x] MoonBit: タブ切り替え機構（DAILY / CLAUDE）
- [x] metrics-server: `/daily/reaction` AI リアクション生成（`claude -p` + mtime キャッシュ）
- [x] MoonBit: DAILY タブ — AI リアクション表示（amber 色）
- [x] MoonBit: DAILY タブ — 「N ヶ月前の今日」表示（LOOKING BACK）
- [x] リファレンスドキュメントを `.claude/skills/moonbit-lookup/` に移動
- [x] vanilla JS プロトタイプ、未使用コードの削除

- [x] metrics-server: `/feed` ニュースフィード集約エンドポイント（HN API + タグベースフィルタ + 5分キャッシュ）
- [x] MoonBit: FEED タブ — ニュース表示（5分ポーリング）
- [x] フィードタイトルをクリック可能なリンクに
- [x] DotGothic16 フォント導入（日本語ドットフォント）
- [x] レスポンシブレイアウト化（固定 1280x720 → 100vh）

### Phase 2a: サーバーリファクタ（Python → Hono/TypeScript + Bun）

- [x] `retro-dashboard/server/` に Bun + Hono プロジェクト初期化
- [x] サービス層の移植
  - [x] `services/vault.ts` — Obsidian 日報パーサー（frontmatter スキップ、セクション分割、タイムライン抽出）
  - [x] `services/prometheus.ts` — Prometheus proxy（Claude Code メトリクス 8 クエリ集約）
  - [x] `services/reaction.ts` — AI リアクション生成（`Bun.spawn` で `claude -p`、mtime キャッシュ）
  - [x] `services/feed.ts` — HN API フェッチ + タグベースフィルタ + TTL キャッシュ
- [x] ルートの移植
  - [x] `routes/daily.ts` — `/daily`, `/daily/reaction`, `/daily/past`, `/daily/stream`（SSE）
  - [x] `routes/claude.ts` — `/claude-metrics`
  - [x] `routes/feed.ts` — `/feed`
- [x] SSE を Hono ネイティブ (`streamSSE`) で再実装
- [x] 動作確認（curl で各エンドポイントのレスポンスを確認）
- [x] `retro-dashboard/metrics-server/` 削除

### Phase 2b: UI リデザイン（VT100 → 初代 Macintosh）

- [ ] 白背景 + 黒テキスト + 1-bit グラフィクス
- [ ] Chicago 風ビットマップフォント
- [ ] ウィンドウクローム + メニューバー
- [ ] Susan Kare 風ピクセルアートアイコン

### Phase 3: 残機能

- [ ] MoonBit: CI タブ移植

### 対象外

- SYSTEM タブ（不要と判断）
