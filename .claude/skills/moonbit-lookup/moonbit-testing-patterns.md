---
date: 2026-03-30
summary: MoonBit のテスト機構を網羅的に調査。test ブロック、inspect/snapshot テスト、black-box/white-box テスト、カバレッジ、QuickCheck、async テスト、Rabbita での統合テストパターンまで。
tags: [tech/dev/lang, meta/research]
---

# MoonBit テスティングパターン調査レポート

## テストブロックの基本構文

MoonBit はテスト機構を言語レベルで組み込んでおり、外部パッケージのインポートが不要。`test` ブロック内にテストコードを記述する。

```moonbit
test {
  assert_eq(1 + 1, 2)
}

test "名前付きテスト" {
  assert_eq(2 + 2, 4)
}
```

テストブロックは `Unit!Error` を返す。`moon test` 実行時にテストランナーが呼び出す。

## アサーション関数

### 組み込みアサーション

| 関数 | 用途 |
|:--|:--|
| `assert_eq(a, b)` | 値の等価性を検証 |
| `assert_not_eq(a, b)` | 値の非等価性を検証 |
| `assert_true(cond)` | 真であることを検証 |
| `assert_false(cond)` | 偽であることを検証 |

```moonbit
test {
  assert_eq(1, 1)
  assert_not_eq(1, 2)
  assert_true([1, 2, 3] == [1, 2, 3])
  assert_false(1 == 2)
}
```

### @test モジュールの関数

| 関数 | 用途 |
|:--|:--|
| `@test.same_object(a, b)` | 参照の同一性（`physical_equal`）を検証 |
| `@test.not_same_object(a, b)` | 参照の非同一性を検証 |
| `@test.fail(msg)` | テストを強制的に失敗させる |

```moonbit
test "same_object" {
  let s = "Hello"
  @test.same_object(s, s)
}

test "not_same_object" {
  let a = "1"
  let b = "2"
  @test.not_same_object(a, b)
}
```

### 推奨事項

moonbitlang/core の CONTRIBUTING.md には以下の記載がある。

> We encourage you to use `inspect` over `assert` in tests, as `inspect` provides more information about the values being tested and can be updated easily.

ループ内など snapshot テストが機能しにくい場面では `assert_*` を使う。

## パニックテスト

テスト名が `"panic"` で始まるテストは、パニックが発生した場合にのみパスする。

```moonbit
test "panic array_swap" {
  [1, 2, 3].swap(1, 5)
}

test "panic array_op_get" {
  [1, 2, 3][5] |> ignore
}

test "panic array_set_out_of_bounds" {
  let arr = [1, 2, 3]
  arr[3] = 4
}
```

境界値チェックやエラーハンドリングのテストに使用する。moonbitlang/core では `panic_test.mbt` という専用ファイルにまとめる慣習がある。

## スナップショットテスト

MoonBit は 3 種類のスナップショットテストを提供する。すべて `moon test --update` で自動挿入・更新可能。

### Show スナップショット（`inspect`）

`Show` トレイトを実装した型の出力をスナップショットとして記録する。最も基本的な形式。

```moonbit
test "fibonacci" {
  inspect(fib(5), content="5")
  inspect(fib(6), content="8")
}
```

初回は `content` を省略して書き、`moon test --update`（または `moon test -u`）で自動挿入する。

```moonbit
test {
  inspect(fib(5))
  inspect([1, 2, 3, 4].map(fib))
}
```

実行後に自動更新された結果:

```moonbit
test {
  inspect(fib(5), content="5")
  inspect([1, 2, 3, 4].map(fib), content="[1, 1, 2, 3]")
}
```

複数行の出力は `#|` 記法で記録される:

```moonbit
test {
  inspect(matrix('*', 3), content=
    #|***
    #|***
    #|***
    #|
  )
}
```

### JSON スナップショット（`json_inspect`）

複雑な構造体では `ToJson` トレイトを使った JSON 形式のスナップショットの方が可読性が高い。

```moonbit
enum Rec {
  End
  Really_long_name(Rec)
} derive(Show, ToJson)

test "json snapshot" {
  let r = Really_long_name(Really_long_name(Really_long_name(End)))
  json_inspect(r, content=[
    "Really_long_name",
    ["Really_long_name", ["Really_long_name", "End"]]
  ])
}
```

### フルスナップショット（`@test.T::write` / `@test.T::writeln`）

任意のデータを `__snapshot__` ディレクトリ内のファイルに記録する。テストブロックが `@test.Test` パラメータを受け取る形式。

```moonbit
test "record anything" (t : @test.Test) {
  t.write("Hello, world!")
  t.writeln(" And hello, MoonBit!")
  t.snapshot(filename="record_anything.txt")
}
```

- `t.write(obj)`: バッファに書き込む（`&Show` を実装した型）
- `t.writeln(obj)`: バッファに書き込み + 改行
- `t.snapshot(filename="...")`: バッファの内容を `__snapshot__/<filename>` に出力

`snapshot()` は例外を発生させるため、テストの最後に呼び出す。

moonbitlang/core の実例（`test/__snapshot__/test_output`）:

```
Current timestamp: 2024-01-01
Processing items: [1, 2, 3, 4, 5]
Result: SUCCESS
```

## テストファイルの命名規約と構成

### ファイル名サフィックス

| サフィックス | テスト種別 | アクセス範囲 |
|:--|:--|:--|
| `_test.mbt` | Black-box テスト | パッケージの公開メンバーのみ |
| `_wbtest.mbt` | White-box テスト | パッケージの全メンバー（非公開含む） |

### Black-box テスト（`_test.mbt`）

外部ユーザーの視点をシミュレートする。ビルドシステムは含まれるパッケージを自動的に依存として扱い、公開メンバーのみアクセス可能。

### White-box テスト（`_wbtest.mbt`）

ビルドシステムが `*.mbt` と `*_wbtest.mbt` を一緒にコンパイルするため、非公開メンバーにもアクセスできる。

### moon.pkg の設定

```
import {
  "moonbitlang/core/builtin",
}

import {
  "moonbitlang/core/char",
} for "test"
```

`for "test"` はテスト時のみインポートする依存を宣言する。JSON 形式の `moon.pkg.json` では `test-import` と `wbtest-import` フィールドで指定する。

### moonbitlang/core の命名慣習

moonbitlang/core リポジトリでの実際のファイル構成例:

```
array/
  array_test.mbt          # Black-box テスト
  panic_test.mbt          # パニックテスト（Black-box）
builtin/
  array_test.mbt          # Black-box テスト
  array_wbtest.mbt        # White-box テスト
  assert_test.mbt         # アサーションのテスト
  panic_test.mbt          # パニックテスト
bigint/
  bigint_test.mbt         # Black-box テスト
  bigint_wbtest.mbt       # White-box テスト
  bigint_js_wbtest.mbt    # JS ターゲット固有の White-box テスト
  bigint_nonjs_wbtest.mbt # 非 JS ターゲット固有の White-box テスト
  panic_test.mbt          # パニックテスト
```

## moon test コマンド

### 基本コマンド

```
moon test
```

### 主要フラグ

| フラグ                     | 説明                                                        |
| :---------------------- | :-------------------------------------------------------- |
| `-p, --package <PKG>`   | 特定のパッケージのテストのみ実行                                          |
| `-f, --file <FILE>`     | 特定のファイルのテストのみ実行（`-p` 必須）                                  |
| `-i, --index <INDEX>`   | 特定のテストブロックのみ実行（例: `0-2`）                                  |
| `-F, --filter <FILTER>` | テスト名のグロブパターンでフィルタ（`*`, `?`）                               |
| `-u, --update`          | スナップショットの自動更新                                             |
| `--target <TARGET>`     | 出力ターゲット（`wasm`, `wasm-gc`, `js`, `native`, `llvm`, `all`） |
| `-g, --debug`           | デバッグ情報を含める                                                |
| `--release`             | 最適化を有効にしてコンパイル                                            |
| `--no-parallelize`      | テストを順次実行                                                  |
| `-j, --jobs <JOBS>`     | 並列ジョブ数を指定                                                 |
| `--outline`             | テスト構造を表示するのみ（実行しない）                                       |
| `--include-skipped`     | スキップされたテストを含める                                            |
| `--frozen`              | 依存関係の同期をスキップ                                              |
| `-d, --deny-warn`       | 警告をエラーに変換                                                 |

### フィルタリング例

```
moon test -p username/hello/A -f hello.mbt -i 0
```

上記は `username/hello/A` パッケージの `hello.mbt` 内の 0 番目のテストブロックを実行する。

```
moon test -F "fibonacci*"
```

テスト名が `fibonacci` で始まるテストのみ実行する。

### ターゲット別実行

```
moon test --target js
moon test --target native
moon test --target all
```

## テストカバレッジ

### カバレッジの取得

```
moon coverage analyze
moon coverage analyze -p <PACKAGE>
```

テストにインストルメンテーションを付与して実行し、カバレッジレポートを生成する。

### レポートの生成

```
moon coverage report
```

`-f` フラグで出力形式を制御する:

- テキストサマリー
- OCaml Bisect 形式（デフォルト）
- Coveralls JSON 形式
- Cobertura XML 形式
- HTML ページ

### カバレッジアーティファクトのクリーンアップ

```
moon coverage clean
```

## ドキュメントテスト

MoonBit はドキュメント内のコードブロックもテスト可能。

```moonbit
///|
/// Increments an integer by 1
/// ```mbt test
/// inspect(incr(41), content="42")
/// ```
pub fn incr(x : Int) -> Int {
  x + 1
}
```

| コードブロック種別 | 動作 |
|:--|:--|
| ` ```mbt test ` | テストとして実行 |
| ` ```mbt check ` | LSP による検証のみ |
| ` ```moonbit ` | 表示のみ |

Markdown ファイル内のテストコードは `moon test --md` で Black-box テストとして実行できる。

## ベンチマーク

`@bench.Test` パラメータを受け取るテストブロックでベンチマークを記述する。

```moonbit
test "fib benchmark" (b : @bench.Test) {
  b.bench(fn() { fib(20) })
}
```

副作用のない計算では `b.keep()` でコンパイラ最適化による除去を防ぐ:

```moonbit
test "sum benchmark" (b : @bench.Test) {
  let result = b.bench(fn() {
    let mut sum = 0
    for i = 0; i < 1000; i = i + 1 {
      sum = sum + i
    }
    sum
  })
  b.keep(result)
}
```

実行コマンド:

```
moon bench
```

出力例:

```
time (mean +/- s)       range (min ... max)
21.67 us +/- 0.54 us    21.28 us ... 23.14 us    in 10 x 4619 runs
```

## プロパティベーステスト（QuickCheck）

moonbitlang/quickcheck を使用したプロパティベーステスト。Haskell の QuickCheck から着想を得ている。

### セットアップ

```
moon add moonbitlang/quickcheck
moon install
```

moon.pkg.json:

```json
{
  "import": [{ "path": "moonbitlang/quickcheck", "alias": "qc" }]
}
```

### 基本的な使い方

```moonbit
fn prop_reverse_identity(arr : Array[Int]) -> Bool {
  arr.rev().rev() == arr
}

test {
  @qc.quick_check_fn(prop_reverse_identity)
}
```

出力: `+++ [100/0/100] Ok, passed!`（通過/破棄/合計）

### バグの発見

```moonbit
fn prop_removed_not_present(iarr : (Int, Array[Int])) -> Bool {
  let (x, arr) = iarr
  !remove(arr, x).contains(x)
}

test {
  @qc.quick_check_fn(prop_removed_not_present, expect=Fail)
}
```

出力:

```
*** [8/0/100] Failed! Falsified.
(0, [0, 0])
```

最小反例が自動的に発見される（shrink 機能）。

### Arbitrary トレイトと derive

```moonbit
enum Nat {
  Zero
  Succ(Nat)
} derive(Arbitrary, Show)
```

`Arbitrary` を derive すると自動でランダムデータ生成が可能になる。

### 設定オプション

```moonbit
@qc.quick_check_fn(
  prop_function,
  max_shrinks?=1000,
  max_success?=100,
  max_size?=50,
  discard_ratio?=10,
  expect?=Success,
  abort?=false
)
```

### ジェネレータ API

```moonbit
let gen_bool : @qc.Gen[Bool] =
  @qc.one_of([@qc.pure(true), @qc.pure(false)])

let gen_freq : @qc.Gen[Bool] = @qc.frequency([
  (4, @qc.pure(true)),
  (1, @qc.pure(false)),
])
```

## 非同期テスト

`async test` ブロックで非同期コードをテストする。`await` キーワードは不要で、コンパイラが自動推論する。

```moonbit
async test {
  let (response, _) = @http.get("https://www.moonbitlang.cn")
  inspect(response.code, content="200")
}
```

制約事項:

- 現時点では `--target native` で動作（Linux, macOS）
- `--target js` のサポートは開発中

## モック/スタブのパターン

MoonBit には専用のモックフレームワークは現時点で存在しない。代わりに以下のパターンを使用する。

### トレイトを使った依存の注入

Rust と同様のアプローチで、トレイトを定義して実装を差し替える。

```moonbit
trait HttpClient {
  get(Self, String) -> String
}

struct RealClient {}

fn RealClient::get(self : RealClient, url : String) -> String {
  // 実際の HTTP 呼び出し
  ...
}

struct MockClient {
  response : String
}

fn MockClient::get(self : MockClient, _url : String) -> String {
  self.response
}
```

### 関数パラメータによる注入

テスト対象の関数が依存関数をパラメータとして受け取る設計にする。

```moonbit
fn fetch_and_process(
  fetcher : (String) -> String,
  url : String
) -> String {
  let data = fetcher(url)
  process(data)
}

test "fetch_and_process" {
  let mock_fetcher = fn(_url : String) -> String { "mock data" }
  inspect(fetch_and_process(mock_fetcher, "http://example.com"), content="processed mock data")
}
```

## 条件付きコンパイルとテスト

ターゲット固有のテストには `#cfg` ディレクティブを使用する。

```moonbit
#cfg(target="js")
test {
  // JS ターゲット固有のテスト
}
```

moon.pkg の `options.targets` でファイル単位のターゲット制御も可能:

```
options(
  targets: {
    "panic_test.mbt": [ "not", "native", "llvm" ],
  },
)
```

## Rabbita（Web UI フレームワーク）のテストパターン

Rabbita は TEA（The Elm Architecture）ベースの Web UI フレームワーク。テストファイルは `doc/` 以下に `using_test.mbt` として配置されている。

```moonbit
using @rabbita {type Dispatch, type Html, type Cell}
using @html {div, h1, p, button}

test {
  ignore(app)
}
```

Rabbita のテストは JS ターゲットでの条件付きコンパイルを使用する:

```moonbit
#cfg(target="js")
test {
  // Cell を生成して mount する統合テスト
}
```

Rabbita 自体には専用のテストフレームワークやユーティリティは含まれておらず、MoonBit 標準のテスト機構をそのまま使用する。Web UI の統合テストとしては、Cell（TEA の Model-View-Update を束ねる単位）をインスタンス化して mount する形式。

## テスト実行のワークフロー

moonbitlang/core の CONTRIBUTING.md に記載された推奨ワークフロー:

```
moon check
moon test
moon fmt
moon bundle
moon info
```

## まとめ

| 機能 | MoonBit の対応状況 |
|:--|:--|
| ユニットテスト | `test` ブロック（言語組み込み） |
| アサーション | `assert_eq`, `assert_true`, `assert_false`, `assert_not_eq` |
| スナップショットテスト | `inspect`, `json_inspect`, `@test.T::snapshot` |
| パニックテスト | テスト名 `"panic ..."` で自動判定 |
| プロパティベーステスト | `moonbitlang/quickcheck` |
| 非同期テスト | `async test` ブロック（native のみ） |
| ベンチマーク | `@bench.Test` + `moon bench` |
| カバレッジ | `moon coverage analyze` / `moon coverage report` |
| ドキュメントテスト | ` ```mbt test ` + `moon test --md` |
| Black-box テスト | `_test.mbt` |
| White-box テスト | `_wbtest.mbt` |
| モック/スタブ | 専用フレームワークなし、トレイト/関数注入で対応 |
| Web UI テスト | Rabbita は標準テスト機構を使用、Cell の mount で統合テスト |

## 参照

- [MoonBit Language Tour - test](https://tour.moonbitlang.com/basics/test/index.html)
- [Writing Tests - MoonBit Docs](https://docs.moonbitlang.com/en/latest/language/tests.html)
- [Writing tests with joy: MoonBit expect testing](https://www.moonbitlang.com/blog/expect-testing)
- [Introducing Async Programming in MoonBit](https://www.moonbitlang.com/blog/moonbit-async)
- [moonbitlang/core CONTRIBUTING.md](https://github.com/moonbitlang/core/blob/main/CONTRIBUTING.md)
- [moonbitlang/quickcheck](https://github.com/moonbitlang/quickcheck)
- [moonbit-community/rabbita](https://github.com/moonbit-community/rabbita)
- [Moon Commands](https://moonbitlang.github.io/moon/commands.html)
- [Useful Features of MoonBit's moon CLI](https://zenn.dev/mizchi/articles/moonbit-useful-tips?locale=en)
- [MoonBit Docs - Coverage](https://docs.moonbitlang.com/en/latest/toolchain/moon/coverage.html)
