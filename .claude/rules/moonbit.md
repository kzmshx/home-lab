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

## 実践で判明した注意点

### 構文

- `using @pkg { items }` — `@pkg` と `{` の間にドットを入れない（`@pkg.{...}` は構文エラー）
- ラベル引数: 定義は `param~`、呼び出しは `param=value`。`param~=value` は不正
- `f!(args)` は非推奨。`f(args)` に統一（エラーは `try`/`catch` で処理）

### Rabbita

- HTML 要素は子要素（positional argument）が必須。空の div は `@html.div("")` とする
- `@cmd.raw_effect` のコールバック内で `scheduler.add(cmd)` を使って Cmd を登録する必要がある。ただし `Scheduler` trait は `internal/runtime` パッケージにあり、**外部パッケージからは `scheduler.add()` を呼べない**（internal visibility 制約）
- 外部 API 呼び出しは `@http.get` + proxy サーバー経由が安全なパターン。`raw_effect` + JS FFI でコールバックを渡す方式は internal パッケージ制約により困難
- **`dispatch(msg)` は Cmd を返すだけで、副作用（inbox への push）は `Scheduler::add` で実行されるまで発生しない**。JS FFI コールバック内で `dispatch(msg) |> ignore` しても**メッセージは届かない**。SSE 等の外部イベントからメッセージを送るには `@http.get` ポーリングでフォールバックするか、Rabbita に SSE/Subscription の公開 API が追加されるのを待つ

### JS FFI

- MoonBit の struct を JS 側で `{ field: value }` として構築してコールバックに渡す方式は内部表現の不一致で失敗する
- FFI の引数・返り値はプリミティブ型（Double, String, Bool）に限定するのが安全
- 複雑なデータは JSON 文字列で渡して MoonBit 側で `FromJson` derive + `@json.from_json` でパースするか、proxy サーバーで集約して `@http.get` で取得する

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
