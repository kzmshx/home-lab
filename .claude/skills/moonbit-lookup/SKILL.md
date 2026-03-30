---
name: moonbit-lookup
description: >
  MoonBit の言語仕様、Rabbita API、テストパターン、パッケージ情報を調べる。
  MoonBit のコードを書く前に不明点がある場合、コンパイルエラーの原因調査、
  API の使い方確認に使用する。
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, WebFetch, WebSearch, Agent, Bash(moon help *), Bash(moon version *)
argument-hint: "<検索クエリ: 例 'HTTP GET の書き方', 'Cell の合成方法', 'JS FFI の型マッピング'>"
---

MoonBit の言語仕様・ライブラリ API を調査する。

## 検索戦略

クエリに応じて以下の優先順で検索する。

### 1. ローカルリファレンス（最速）

まずローカルのリファレンスドキュメントを検索する:

```
.claude/skills/moonbit-lookup/moonbit-language-reference.md  — 言語仕様全般
.claude/skills/moonbit-lookup/moonbit-testing-patterns.md    — テスト
.claude/skills/moonbit-lookup/rabbita-api-reference.md       — Rabbita API
```

Grep で該当セクションを探す:

```bash
grep -n "<キーワード>" ".claude/skills/moonbit-lookup/moonbit-language-reference.md"
```

### 2. ツールチェインヘルプ

`moon` コマンドに関する質問:

```bash
moon help
moon help <subcommand>
```

### 3. 公式ドキュメント（Web）

ローカルで見つからない場合:

- 言語ドキュメント: `https://docs.moonbitlang.com/en/latest/`
- ブログ（新機能解説）: `https://www.moonbitlang.com/blog`
- Language Tour: `https://tour.moonbitlang.com/`

WebFetch で取得:

```
WebFetch: https://docs.moonbitlang.com/en/latest/language/<topic>.html
```

主要トピック: `fundamentals`, `methods`, `error-handling`, `ffi`, `packages`, `derive`, `tests`, `async-experimental`

### 4. GitHub ソースコード

ライブラリの実装詳細:

- moonbitlang/core（標準ライブラリ）: `https://github.com/moonbitlang/core`
- moonbit-community/rabbita（Web UI）: `https://github.com/moonbit-community/rabbita`
- moonbit-community/rabbita-template: `https://github.com/moonbit-community/rabbita-template`

WebFetch で特定ファイルを取得:

```
WebFetch: https://raw.githubusercontent.com/moonbit-community/rabbita/main/<path>
```

### 5. パッケージレジストリ

mooncakes.io でパッケージを検索:

```
WebSearch: site:mooncakes.io <package-name>
```

### 6. Web 検索（最終手段）

上記で解決しない場合:

```
WebSearch: moonbit <query> site:moonbitlang.com OR site:github.com/moonbitlang
```

## 出力フォーマット

調査結果は以下の形式で返す:

1. **回答**: 質問への直接的な回答（コード例付き）
2. **出典**: 情報のソース（ファイルパス or URL）
3. **注意点**: pre-1.0 に起因する不確実性があれば明記

## 重要な注意

- MoonBit は pre-1.0。ローカルリファレンスの情報が古い可能性がある
- コンパイルエラーが出た場合、まず `moon help` と公式ドキュメントを確認
- 推測でコードを書かず、確認してから書く
