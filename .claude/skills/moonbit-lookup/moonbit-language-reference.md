---
date: 2026-03-30
summary: MoonBit プログラミング言語の包括的なリファレンス。型システム、パターンマッチング、エラーハンドリング、FFI、モジュールシステム、derive マクロ、最近の言語変更等を網羅。
tags: [tech/dev/lang, meta/research]
---

# MoonBit Language Reference

MoonBit は WebAssembly、JavaScript、C、LLVM をターゲットとする静的型付けの関数型/命令型ハイブリッド言語。moonbitlang/moonbit-docs (GitHub) および docs.moonbitlang.com の公式ドキュメントに基づく。

情報源: moonbitlang/moonbit-docs リポジトリ (main ブランチ、next/ ディレクトリ)、moonbitlang.com/blog

## Variable Binding

```moonbit
let x = 10          // immutable binding
let mut y = 20      // mutable binding
y = 30               // OK: mutable

const MAX = 100      // top-level constant (uppercase required)
```

- `let` は不変バインディング、`let mut` は可変バインディング
- `const` はトップレベルのみ。値は変更不可
- トップレベルの `let` は明示的な型注釈が必要（リテラルを除く）。`mut` にはできない（代わりに `Ref` を使用）

## Type System

### Primitive Types

| Type | Description | Literal |
|:--|:--|:--|
| `Unit` | void 相当 | `()` |
| `Bool` | 真偽値 | `true`, `false` |
| `Int` | 32-bit signed | `42` |
| `Int64` | 64-bit signed | `1000L` |
| `UInt` | 32-bit unsigned | `14U` |
| `UInt64` | 64-bit unsigned | `14UL` |
| `Int16` | 16-bit signed | `(42 : Int16)` |
| `UInt16` | 16-bit unsigned | `(14 : UInt16)` |
| `Float` | 32-bit float | `(3.14 : Float)` |
| `Double` | 64-bit float | `3.14` |
| `BigInt` | 任意精度整数 | `10000N` |
| `Char` | Unicode code point | `'A'` |
| `String` | UTF-16 code unit sequence | `"hello"` |
| `Byte` | 1 byte | `b'A'` |
| `Bytes` | immutable byte sequence | `b"hello"` |

数値リテラルは `_` で区切り可能: `1_000_000`。2 進数 `0b1010`, 8 進数 `0o17`, 16 進数 `0xFF` に対応。

### Struct

```moonbit
struct User {
  name : String
  mut age : Int     // mutable field
} derive(Show, Eq)

// Construction
let u = { name: "Alice", age: 30 }
let u2 = User::{ name: "Bob", age: 25 }

// Shorthand (variable name matches field name)
let name = "Charlie"
let age = 28
let u3 = { name, age }

// Struct update syntax
let u4 = { ..u, age: 31 }

// Field access
println(u.name)
u.age = 31  // OK: field is mut
```

#### Visibility

```moonbit
pub(all) struct FullyPublic { x: Int }    // construct + read + mutate from outside
pub struct ReadOnly { x: Int }            // read only from outside (default)
struct Abstract { x: Int }                // name visible, internals hidden (default)
priv struct Private { x: Int }            // completely invisible
```

`pub` struct のフィールドに `priv` を付けると外部から完全に隠蔽。

#### Custom Constructor

```moonbit
struct Positive {
  value : Int
  ctor(value~ : Int) -> Positive raise Error
}

fn Positive::new(value~ : Int) -> Positive raise Error {
  if value <= 0 { raise Failure("must be positive") }
  { value, }
}

// Usage: Positive(value=5) calls the constructor
```

### Enum

```moonbit
enum Color {
  Red
  Green
  Blue
}

// With payloads
enum Shape {
  Circle(Double)
  Rectangle(Double, Double)
}

// With labelled arguments
enum Expr {
  Lit(value~ : Int)
  Add(left~ : Expr, right~ : Expr)
}

// With mutable fields
enum TreeNode {
  Leaf
  Node(mut value~ : Int, left~ : TreeNode, right~ : TreeNode)
}

// Constant enum with custom integer values (useful for C FFI)
enum SpecialNumbers {
  Zero = 0
  One        // = 1 (auto-increment)
  Ten = 10
  FourtyTwo = 42
}
```

### Tuple Struct

```moonbit
struct Wrapper(Int)

let w = Wrapper(42)
let Wrapper(x) = w   // pattern match
println(w.0)          // index access
```

### Type Alias

```moonbit
type StringList = Array[String]
// StringList is just a macro; no new type is created
// Cannot define methods or implement traits for it
```

### Generics

```moonbit
enum List[T] {
  Nil
  Cons(T, List[T])
}

fn[T : Show] map[U : Show](list : List[T], f : (T) -> U) -> List[U] {
  match list {
    Nil => Nil
    Cons(head, tail) => Cons(f(head), map(tail, f))
  }
}
```

型パラメータは `[]` 内に記述。関数では `fn[T : Trait]` でトレイト制約を付ける。

### Option and Result

```moonbit
let x : Int? = Some(42)       // T? is shorthand for Option[T]
let y : Int? = None

let r : Result[Int, String] = Ok(42)
let e : Result[Int, String] = Err("failed")
```

## Pattern Matching

### match Expression

```moonbit
fn describe(shape : Shape) -> String {
  match shape {
    Circle(r) => "Circle with radius \{r}"
    Rectangle(w, h) => "Rectangle \{w}x\{h}"
  }
}
```

コンパイラが網羅性チェックを行う。条件が不足する場合は警告が出る。

### Supported Patterns

```moonbit
// Literal patterns
match x { 0 => ...; 1 => ...; _ => ... }

// Struct patterns (.. ignores remaining fields)
match user { { name: "Alice", .. } => ... }

// Enum patterns
match opt { Some(v) => v; None => 0 }

// Tuple patterns
match (a, b) { (0, _) => ...; (_, 0) => ... }

// Or patterns
match x { 1 | 2 | 3 => "small"; _ => "big" }

// As patterns
match list { Cons(_, _) as nonempty => ...  }

// Nested patterns
match expr {
  Add(left=Lit(value=a), right=Lit(value=b)) => a + b
  _ => ...
}
```

### Array Pattern

```moonbit
match arr {
  [] => "empty"
  [x] => "single: \{x}"
  [x, y] => "pair"
  [first, ..rest, last] => "first=\{first}, last=\{last}"
  [first, ..] => "at least one"
}

// Works on Array, FixedArray, ArrayView, Bytes, BytesView, String, StringView
```

### Bitstring Pattern

```moonbit
// Parse binary protocols
match (bytes : BytesView) {
  [version : u8be, flags : u8be, length : u16be, ..payload] =>
    process(version, flags, length, payload)
  _ => fail("invalid header")
}
```

`u`/`i` + bit width + `be`/`le` でエンディアンと符号を指定。

### Range Pattern

```moonbit
match ch {
  'a'..='z' => "lowercase"
  'A'..='Z' => "uppercase"
  '0'..<':' => "digit"   // ..< is exclusive upper bound
  _ => "other"
}
```

### Map Pattern

```moonbit
match map {
  { "key1": value, "key2"?: opt_value, .. } => ...
  // "key1": value  -> key must exist
  // "key2"?: value -> matches Option (key may not exist)
  // .. is required (map patterns are always open)
}
```

`op_get(Self, K) -> Option[V]` メソッドを持つ任意の型でマップパターンが使用可能。

### Json Pattern

```moonbit
match (json : Json) {
  { "name": String(name), "age": Number(age) } => ...
  [Number(first), ..] => ...
  _ => ...
}
```

### Guard Condition

```moonbit
match (x, y) {
  (a, b) if a > b => "first is larger"
  (a, b) if a == b => "equal"
  _ => "second is larger"
}
```

### is Expression

```moonbit
if x is Some(v) && v > 0 {
  println(v)  // v is bound here
}

guard x is Some(v)
// v is available in subsequent code
```

### lexmatch (Regex Pattern Matching)

```moonbit
lexmatch text {
  (before, "\\d+" as digits, after) => ...
  _ => "no match"
}

// Boolean check
if lexmatch? text { (_, "[a-z]+", _) } { ... }
```

## Error Handling

### Error Types

```moonbit
// Define concrete error types
suberror DivError { DivByZero }

// With payload (new syntax)
suberror ParseError {
  InvalidChar(Char)
  UnexpectedEOF
}
```

旧構文 `suberror A B` は非推奨。`suberror A { A(B) }` を使用する。

組み込みエラー型 `Failure` があり、`fail("message")` で利用可能。

### Throwing Errors

```moonbit
fn div(a : Int, b : Int) -> Int raise DivError {
  if b == 0 { raise DivByZero }
  a / b
}

// Generic error type (Error is the catch-all)
fn risky() -> Int raise {    // raise without type = raise Error
  raise Failure("oops")
}
```

### Handling Errors

```moonbit
// Direct call rethrows automatically
fn caller() -> Int raise DivError {
  div(10, 0)   // rethrows DivError
}

// try...catch
fn safe_div(a : Int, b : Int) -> Int {
  try {
    div(a, b)
  } catch {
    DivByZero => 0
  } noraise {
    result => result   // executed when no error
  }
}

// Simplified (for single expression)
fn safe_div2(a : Int, b : Int) -> Int {
  div(a, b) catch { DivByZero => 0 }
}

// Transform to Result with try?
let result : Result[Int, DivError] = try? div(10, 0)

// Panic on error
let value = div(10, 2)!!   // panics if error
```

### Error Polymorphism

```moonbit
fn[T, U] map_with_err[E : Error](
  arr : Array[T], f : (T) -> U raise? E
) -> Array[U] raise? E {
  // raise? means "may or may not raise"
  // The actual error behavior depends on f
  ...
}
```

### noraise Annotation

```moonbit
fn safe_function() -> Int noraise {
  42  // compiler verifies this cannot raise
}
```

## String Interpolation and Formatting

```moonbit
let name = "World"
let greeting = "Hello, \{name}!"           // string interpolation
let calc = "1 + 1 = \{1 + 1}"             // expressions allowed
// Interpolated expression cannot contain newline, {} or "

// Multi-line strings
let raw = #|This is raw
           #|multi-line text

let interpolated = $|Hello, \{name}!
                   $|Today is a good day.

// Show trait for custom types
println(greeting)  // uses Show::to_string implicitly
```

`#|` は生テキスト、`$|` はエスケープ + 補間を行う。同じブロック内で混在させない。

## Collections

### Array

```moonbit
let arr : Array[Int] = [1, 2, 3]
arr.push(4)                      // mutable, growable
let elem = arr[0]                // index access
arr[1] = 20                     // index set

// Iteration
for x in arr { println(x) }
arr.each(fn(x) { println(x) })
let doubled = arr.map(fn(x) { x * 2 })

// ArrayView (immutable slice)
let view = arr[1:3]
```

### FixedArray

```moonbit
let fixed : FixedArray[Int] = FixedArray::make(5, 0)  // size=5, init=0
let fixed2 = FixedArray::makei(5, fn(i) { i * 2 })    // per-index init
// Fixed size, cannot grow
```

`FixedArray::make(n, obj)` は全セルが同一オブジェクトを参照する点に注意（参照型の場合は `makei` を使う）。

### Map

```moonbit
let map : Map[String, Int] = { "one": 1, "two": 2, "three": 3 }
let v = map["one"]  // Option[Int]
```

`Map` はハッシュマップで挿入順を保持する。キーは `Hash + Eq` を実装する必要がある。

### Iter

```moonbit
let iter = [1, 2, 3].iter()
// Iter[T] is an external iterator with next() -> T?

iter.each(fn(x) { println(x) })

// Lazy operations (no intermediate allocation)
let result = [1, 2, 3, 4, 5]
  .iter()
  .filter(fn(x) { x % 2 == 0 })
  .map(fn(x) { x * 10 })
  .collect()  // [20, 40]

// Iter2 for key-value pairs
for k, v in map { println("\{k}: \{v}") }
```

`Iter` はシングルパス。一度消費すると再走査不可。`.iter()` メソッドを持つ型は `for .. in` で走査可能。

## Functions and Closures

### Top-Level Functions

```moonbit
fn add(x : Int, y : Int) -> Int {
  x + y
}
```

引数と戻り値には明示的な型注釈が必要。

### Local Functions and Closures

```moonbit
fn main {
  let double = fn(x) { x * 2 }        // anonymous function
  let triple = fn(x : Int) -> Int { x * 3 }  // with annotations

  // Arrow function (concise, supports effect inference)
  let quadruple = x => { x * 4 }

  // Closures capture environment
  let offset = 10
  let add_offset = fn(x) { x + offset }

  // Mutually recursive local functions
  letrec is_even = fn(n) {
    if n == 0 { true } else { is_odd(n - 1) }
  } and is_odd = fn(n) {
    if n == 0 { false } else { is_even(n - 1) }
  }
}
```

### Labelled and Optional Arguments

```moonbit
fn greet(name~ : String, greeting~ : String = "Hello") -> String {
  "\{greeting}, \{name}!"
}

// Call
greet(name="Alice")                  // uses default greeting
greet(name="Bob", greeting="Hi")
let name = "Charlie"
greet(name~)                         // shorthand: name~  = name=name

// Optional without default (receives Option)
fn search(query~ : String, limit? : Int) -> Array[String] {
  let actual_limit = limit.or(10)
  ...
}
search(query="test", limit=5)    // auto-wrapped to Some(5)
search(query="test")             // limit is None
```

### Partial Application

```moonbit
let add5 = add(5, _)    // _ for missing argument
add5(3)                  // => 8
```

### Pipelines

```moonbit
let result = [1, 2, 3]
  |> Array::map(_, fn(x) { x * 2 })
  |> Array::filter(_, fn(x) { x > 2 })

// x |> f(y) is equivalent to f(x, y) (data-first)
// x |> f(y, _) is equivalent to f(y, x)
```

### Cascade Operator

```moonbit
let buf = StringBuilder::new()
  ..write_string("Hello")
  ..write_char(' ')
  ..write_string("World")
// x..f() is equivalent to { x.f(); x }
```

## Control Flow

### if/else

```moonbit
let result = if x > 0 { "positive" } else { "non-positive" }
```

`if` は式であり値を返す。`else` 省略は `Unit` 型の場合のみ可。

### while Loop

```moonbit
while condition {
  if should_exit { break }
  if should_skip { continue }
} nobreak {
  // executed when condition becomes false (not on break)
  result_value
}
```

`nobreak` 句があると `while` は値を返す。`break value` で早期脱出 + 値返却。

### for Loop

```moonbit
// C-style for loop
for i = 0, sum = 0; i < 10; i = i + 1, sum = sum + i {
  println(i)
} nobreak {
  sum   // return value
}

// Bindings are immutable per iteration, updated simultaneously
// continue can update bindings: continue i + 1, sum + i
```

### for..in Loop

```moonbit
for x in [1, 2, 3] { println(x) }

// Two variables (Iter2)
for k, v in map { println("\{k}=\{v}") }

// With index
for i, x in arr.iter2() { println("\{i}: \{x}") }

// Range expressions
for i in 0..<10 { ... }       // 0 to 9
for i in 0..<=10 { ... }      // 0 to 10
for i in 10>..0 { ... }       // 9 to 0 (decreasing, exclusive start)
for i in 10>=..0 { ... }      // 10 to 0 (decreasing, inclusive start)
```

`.iter()` メソッドを持つ型は `for..in` で走査可能。

### Functional loop

```moonbit
fn fibonacci(n : Int) -> Int {
  loop n, 0, 1 {
    0, a, _ => a
    n, a, b => continue n - 1, b, a + b
  }
}
```

`loop` はパターンマッチと再帰を組み合わせた関数型ループ。`continue` で次の反復、`break` で値を返す。

### Guard Statement

```moonbit
guard condition else { return error_value }
// subsequent code runs only if condition is true

guard input is Some(value) else { return None }
// value is bound in subsequent code
```

### defer

```moonbit
fn process() -> Unit {
  let resource = acquire()
  defer release(resource)
  // release(resource) is called when leaving this scope
  // (including on error, return, break, continue)
  do_work(resource)
}
```

複数の `defer` は逆順に実行される。

### Labelled Break/Continue

```moonbit
outer~: for i in 0..<10 {
  for j in 0..<10 {
    if condition { break outer~ }
    if other { continue outer~ }
  }
}
```

## Methods and Traits

### Method Declaration

```moonbit
// Preferred: explicit namespace
fn MyType::method_name(self : MyType, arg : Int) -> String {
  ...
}

// Dot syntax call
let obj : MyType = ...
obj.method_name(42)
```

メソッドはそのパッケージ内でのみ定義可能（ローカルメソッドは例外: 外部型に対して `priv` メソッドを定義可能）。

### Trait Declaration

```moonbit
trait MyTrait {
  method1(Self, Int) -> String
  method2(Self) -> Bool
  method_with_default(Self) -> Int = _   // = _ marks default impl
}

// Super traits
trait Printable : Show + Eq {
  print(Self) -> Unit
}
```

### Implementing Traits

```moonbit
impl MyTrait for MyType with method1(self, n) {
  "value: \{n}"
}

impl MyTrait for MyType with method2(self) {
  true
}

// Default implementation (available to all implementors)
impl MyTrait with method_with_default(self) {
  42
}

// For types with all-default traits
impl MyTrait for MyType   // uses all defaults
```

型注釈は省略可能 (自動推論)。

### Trait Bounds in Generics

```moonbit
fn[T : Eq] contains(arr : Array[T], elem : T) -> Bool {
  for x in arr {
    if x == elem { return true }
  }
  false
}
```

### Trait Objects

```moonbit
trait Animal {
  speak(Self) -> String
}

fn make_sounds(animals : Array[&Animal]) -> Unit {
  for a in animals {
    println(a.speak())
  }
}

let animals : Array[&Animal] = [dog as &Animal, cat as &Animal]
// or with type inference: [dog, cat] when expected type is known
```

object-safe 条件: `Self` は第一引数のみ、`Self` は型中に 1 回のみ出現。

### Trait Visibility

| Declaration | Outside visibility |
|:--|:--|
| `priv trait` | invisible |
| `trait` (default) | abstract (name visible, methods hidden) |
| `pub trait` | readonly (methods callable, new impl prohibited) |
| `pub(open) trait` | fully public (new impl allowed) |

### Builtin Traits

```moonbit
trait Eq { op_equal(Self, Self) -> Bool }
trait Compare : Eq { compare(Self, Self) -> Int }
trait Hash { hash_combine(Self, Hasher) -> Unit; hash(Self) -> Int = _ }
trait Show { output(Self, Logger) -> Unit; to_string(Self) -> String = _ }
trait Default { default() -> Self }
```

### Operator Overloading

| Operator | Trait/Mechanism |
|:--|:--|
| `+` `-` `*` `/` `%` | `Add` `Sub` `Mul` `Div` `Mod` |
| `==` | `Eq` |
| `<<` `>>` | `Shl` `Shr` |
| `-` (unary) | `Neg` |
| `&` `\|` `^` | `BitAnd` `BitOr` `BitXOr` |
| `_[_]` `_[_]=_` `_[_:_]` | method + `#alias` |

## Derive Macros

```moonbit
struct Point {
  x : Double
  y : Double
} derive(Show, Eq, Compare, Hash, Default)
```

### Available Derives

| Derive | Description |
|:--|:--|
| `Show` | pretty-print (`output` and `to_string`) |
| `Eq` | equality comparison |
| `Compare` | ordering (fields compared in declaration order) |
| `Hash` | hash implementation (`HashMap`/`HashSet` で使用) |
| `Default` | default value (struct: all fields default; enum: 引数なしコンストラクタが 1 つ) |
| `Arbitrary` | random value generation |
| `FromJson` | JSON deserialization |
| `ToJson` | JSON serialization |

全 derive で、全フィールドがそのトレイトを実装している必要がある。

### FromJson / ToJson Configuration

```moonbit
struct Config {
  server_name : String
  port : Int
} derive(ToJson(rename_fields="camelCase"), FromJson(rename_fields="camelCase"))

// Enum styles
enum Message {
  Hello
  Data(Int)
} derive(ToJson(style="flat"), FromJson(style="flat"))
// Hello => "Hello", Data(42) => ["Data", 42]

// style="legacy": Hello => {"$tag":"Hello"}, Data(42) => {"$tag":"Data","0":42}
```

`rename_fields`, `rename_cases` で命名変換 (`camelCase`, `PascalCase`, `snake_case`, `SCREAMING_SNAKE_CASE`, `kebab-case` 等)。

`fields(...)`, `cases(...)` で個別フィールド/ケースの `rename` を指定可能。

## Module System

### Module (moon.mod.json)

```json
{
  "name": "username/project",
  "version": "0.1.0",
  "deps": {
    "moonbitlang/x": "0.4.6"
  },
  "source": "src",
  "preferred-target": "js",
  "supported-targets": "+js+wasm-gc"
}
```

主要フィールド:

- `name`: モジュール名 (`user/project` 形式)
- `version`: SemVer
- `deps`: 依存モジュール (`moon add`/`moon remove` で管理)
- `source`: ソースディレクトリ (デフォルト: `"."`)
- `preferred-target`: デフォルトバックエンド
- `supported-targets`: 対応バックエンドセット
- `warn-list`: 警告制御

### Package (moon.pkg - new DSL format)

```moonbit
import {
  "moonbitlang/core/json" @json,
  "username/project/utils",
} for "main"

import {
  "moonbitlang/core/test",
} for "test"

options(
  "is-main": true,
  link: {
    "js": {
      "exports": ["main"],
      "format": "esm",
    },
  },
  targets: {
    "browser_only.mbt": ["js"],
    "native_only.mbt": ["not", "js"],
  },
)

warnings = "-unused_value"
```

`moon.pkg` は DSL フォーマット。旧 `moon.pkg.json` も引き続きサポート。`moon fmt` で JSON から DSL に変換可能。

構文:

- `import { "path" @alias, ... }` - パッケージインポート
- `import { ... } for "test"` - テスト用インポート
- `import { ... } for "wbtest"` - ホワイトボックステスト用インポート
- `options(...)` - その他設定 (`is-main`, `link`, `targets`, `virtual`, `implement`, `overrides`, `pre-build`, `native-stub` 等)
- `warnings = "..."` - 警告設定
- `//` コメント対応

### Package (moon.pkg.json - legacy format)

```json
{
  "import": [
    "moonbitlang/core/json",
    { "path": "username/project/utils", "alias": "utils" }
  ],
  "test-import": ["moonbitlang/core/test"],
  "is-main": true,
  "link": {
    "js": {
      "exports": ["main"],
      "format": "esm"
    }
  },
  "warn-list": "-2"
}
```

### Visibility (Access Control)

| Declaration | Visibility |
|:--|:--|
| `fn foo()` | package-private (default) |
| `pub fn foo()` | public |
| `priv struct T` | completely invisible outside |
| `struct T` | abstract (name visible, internals hidden) |
| `pub struct T` | readonly (can read, cannot construct/mutate outside) |
| `pub(all) struct T` | fully public |

### Package References

```moonbit
// Default alias is the last segment of the path
@json.parse(...)      // for moonbitlang/core/json
@utils.helper(...)    // for username/project/utils
```

`prelude` パッケージはデフォルトで利用可能。`Int`, `String`, `Bool` 等のコンパイラビルトインは `@builtin.Int` ではなく直接使用。

### Internal Packages

`a/b/c/internal/x/y/z` 内のコードは `a/b/c` および `a/b/c/**` からのみアクセス可能。

### using (Re-export)

```moonbit
using @other_pkg.SomeType
pub using @other_pkg.PublicType  // re-export
```

## JS FFI

### Declare Foreign Function

```moonbit
// Import from JS global
fn cos(d : Double) -> Double = "Math" "cos"
// Equivalent to: Math.cos(d)

// Inline JS
extern "js" fn alert(msg : String) =
  #|(msg) => globalThis.alert(msg)
```

### Declare Foreign Type

```moonbit
#external
type JsValue   // opaque JS value
```

### Type Mappings (JS Backend)

| MoonBit | JavaScript |
|:--|:--|
| `Bool` | `boolean` |
| `Int`, `UInt`, `Float`, `Double` | `number` |
| `String` | `string` |
| constant `enum` | `number` |
| `#external type` | `any` |
| `FixedArray[Byte]`, `Bytes` | `Uint8Array` |
| `FixedArray[T]`, `Array[T]` | `T[]` |
| `FuncRef[T]` | `Function` |

### Export Functions

```moonbit
// In moon.pkg
options(
  link: {
    "js": {
      "exports": ["add", "fib:fibonacci"],  // rename: fib exported as fibonacci
      "format": "esm",
    },
  },
)
```

### Wasm FFI

```moonbit
// Import from host
fn cos(d : Double) -> Double = "math" "cos"

// Inline Wasm
extern "wasm" fn identity(d : Double) -> Double =
  #|(func (param f64) (result f64))
```

### C FFI

```moonbit
extern "C" fn put_char(ch : UInt) = "function_name"
```

C スタブファイルは `moon.pkg` の `native-stub` で指定。`moonbit.h` ヘッダ (`~/.moon/include`) で MoonBit 型定義を利用可能。

### FuncRef (Closed Functions)

```moonbit
// FuncRef[T] represents a function that captures no free variables
let f : FuncRef[(Int) -> Int] = fn(x) { x + 1 }  // must be closed
```

クロージャ（自由変数をキャプチャする関数）を FFI に渡す場合、バックエンドごとに異なる扱いとなる。

## Async Programming (Experimental)

```moonbit
async fn fetch_data(url : String) -> String raise {
  let response = @http.get(url)
  response.body()
}

async fn main {
  let data = fetch_data("https://example.com")
  println(data)
}

// Structured concurrency
async fn parallel_fetch() -> (String, String) raise {
  @async.with_task_group(async fn(group) {
    let result1 = Ref::new("")
    let result2 = Ref::new("")
    group.spawn_bg(async fn() { result1.val = fetch_data(url1) })
    group.spawn_bg(async fn() { result2.val = fetch_data(url2) })
    (result1.val, result2.val)
  })
}
```

- `async fn` で非同期関数を宣言
- 非同期関数は暗黙的に `raise` を持つ
- `moonbitlang/async` パッケージが必要
- 現時点では native バックエンドが最もサポートが充実。JS は基本的なサポート。Wasm は未対応

## Attributes

```moonbit
#deprecated("Use new_api instead")
fn old_api() -> Unit { ... }

#external
type JsRef

#internal(unsafe, "Unsafe operation")
fn unsafe_get[A](arr : Array[A]) -> A { ... }

#cfg(target="js")
fn js_only() -> Unit { ... }

#skip
test "disabled test" { ... }
```

## Tests

```moonbit
test "basic arithmetic" {
  assert_eq!(1 + 1, 2)
}

// Async test
async test "fetch" {
  let data = fetch_data("url")
  assert_true!(data.length() > 0)
}
```

## Recent Language Changes (2025-2026)

以下は 2025-2026 年に追加/変更された主要な機能:

### Async Programming

コルーチンベースの非同期プログラミングサポート。`async fn`, `async test`, `async fn main` を追加。構造化並行性 (`with_task_group`) を採用。native バックエンドで HTTP/ファイル IO/ソケット/プロセス生成をサポート。

### moon.pkg DSL Format

JSON ベースの `moon.pkg.json` に加え、簡潔な DSL フォーマット `moon.pkg` を導入。`moon fmt` で変換可能。

### Bitstring Pattern

`BytesView` 等でバイナリプロトコルのパース用パターンマッチを追加。`u8be`, `u16le` 等のビットフィールド指定。

### lexmatch

正規表現パターンマッチ構文。検索モードと最長一致モード。

### Spread Operator

配列リテラル内で `..iter` による要素展開。

### Tuple Struct

単一コンストラクタの enum に代わる軽量な型定義。

### suberror 構文変更

`suberror A B` (旧) から `suberror A { A(B) }` (新) へ。

### Error Polymorphism

`raise?` による高階関数のエラー多相性。

### LLVM Backend (Experimental)

5 番目のバックエンドとして LLVM を追加。

### Virtual Packages

インターフェースとしてのパッケージ定義。実装を差し替え可能。

### defer Expression

スコープ離脱時に確実にクリーンアップコードを実行。

### Structured Concurrency

`@async.with_task_group` による安全なタスク管理。孤立タスクが発生しない設計。

### noraise Annotation

関数がエラーを発生させないことをコンパイラに明示。

### #cfg Attribute

条件付きコンパイル用の設定属性。

### Supported Targets (Module/Package level)

`supported-targets` フィールドでバックエンド互換性を宣言。

### 0.8.0 Release

MoonBit 0.8.0 がリリース済み。Beta リリースも完了。1.0 ロードマップが公開されている。

## References

- GitHub: https://github.com/moonbitlang/moonbit-docs (next/ directory)
- Docs: https://docs.moonbitlang.com
- Package Registry: https://mooncakes.io
- Standard Library: https://github.com/moonbitlang/core
- Blog: https://www.moonbitlang.com/blog
- Tour: https://tour.moonbitlang.com
