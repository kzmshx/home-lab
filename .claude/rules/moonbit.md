# MoonBit 開発ルール

retro-dashboard は MoonBit + Rabbita (TEA) で構築する。

## 言語基本

- ターゲット: `js`（`"preferred-target": "js"` in moon.mod.json）
- パッケージ形式: moon.pkg（DSL 形式。JSON 形式の moon.pkg.json ではない）
- モジュール設定: moon.mod.json

## ファイル命名規約

| サフィックス | 用途 |
|:--|:--|
| `*.mbt` | 実装コード |
| `*_test.mbt` | Black-box テスト（公開メンバーのみ） |
| `*_wbtest.mbt` | White-box テスト（非公開メンバーも可） |

## コーディングスタイル

- 不変優先: `let` をデフォルト、`let mut` は必要時のみ
- パターンマッチ: `match` を積極的に使う。`if-else` チェーンより優先
- エラーハンドリング: `raise` / `try` / `catch`。`Result` は API 境界で使用
- 文字列補間: `"\{expr}"` 形式
- derive: 型定義時に必要な derive を付ける（`Show`, `Eq`, `FromJson`, `ToJson` 等）

## Rabbita (TEA) アーキテクチャ

### Cell 選択基準

| 種類 | 使い分け |
|:--|:--|
| `simple_cell` | 副作用なし（純粋な UI） |
| `cell` | HTTP 呼び出し、タイマー等の副作用あり |
| `cell_with_dispatch` | 外部からメッセージを送る必要がある場合 |

### パターン

- Model: 不変データ。struct update syntax `{ ..model, field: value }` で更新
- Msg: enum で全メッセージを定義。網羅的パターンマッチで処理
- View: `@html` DSL で記述。ロジックは入れない
- Cmd: `@rabbita.none` / `@rabbita.batch` / `@rabbita.delay` / `@cmd.raw_effect` で副作用
- 子要素: `Array[Html]`, `String`, `Html`, `Map[String, Html]`（keyed）が渡せる

### タブ切り替えパターン

```moonbit
enum Tab { CI; System; Claude }
struct Model { tab : Tab; /* 各タブの Model */ }
enum Msg { SwitchTab(Tab); /* 各タブの Msg */ }
```

### HTTP リクエスト

```moonbit
@http.get(url, expect=Json(GotResponse, decode_fn))
@http.post(url, Json(body_string), expect=Text(GotResponse))
```

レスポンスは Msg 経由で update に届く（TEA の非同期パターン）。

## JS FFI

```moonbit
extern "js" fn get_timestamp() -> Double =
  #|() => Date.now()
```

- `extern "js" fn` で JS 関数をインライン定義
- MoonBit String ↔ JS string は直接マッピング
- `FixedArray[T]` ↔ JS `T[]`
- DOM 操作は `@dom` パッケージ経由

## テスト

### 基本

```moonbit
test "名前" {
  inspect(result, content="expected")
}
```

- `inspect` を `assert_eq` より優先（公式推奨）
- `moon test --update` でスナップショット自動更新
- パニックテスト: テスト名を `"panic ..."` で始める

### 実行

```bash
moon test --target js              # JS ターゲットでテスト
moon test -p <package>             # パッケージ指定
moon test -F "pattern*"            # 名前フィルタ
moon test --update                 # スナップショット更新
moon check                         # 型チェックのみ（高速）
```

### モック

専用フレームワークなし。トレイトベースの DI か関数パラメータ注入で対応。

```moonbit
trait MetricsClient {
  fetch(Self) -> Metrics!Error
}
```

## ビルド・開発

```bash
moon check                   # 型チェック
moon build --target js       # ビルド
moon test --target js        # テスト
moon fmt                     # フォーマット
npm run dev                  # Vite dev server (HMR)
npm run build                # プロダクションビルド
```

## リファレンス参照先

詳細な言語仕様・API は以下を参照:

- `atoms/artifacts/drafts/MoonBit Language Reference.md` — 言語リファレンス
- `atoms/artifacts/drafts/MoonBit テスティングパターン調査レポート.md` — テストパターン
- `atoms/artifacts/drafts/Rabbita Web Framework API Reference.md` — Rabbita API

## 知識が不足している場合

MoonBit は pre-1.0 で変化が速い。不明点があれば:

1. `moon help <command>` でツールチェインのヘルプを確認
2. `/moonbit-lookup` スキルで公式ドキュメント・GitHub ソースを検索
3. mooncakes.io でパッケージの API を確認
4. 推測でコードを書かない。確認してから書く
