// Retro Dashboard — MoonBit + Rabbita
// This only works with the JavaScript backend.

// --- Model ---

struct Model {
  clock : String
  metrics : MetricsState
} derive(Show)

enum MetricsState {
  Loading
  Loaded(@prometheus.ClaudeMetrics)
  Error(String)
} derive(Show)

// --- Msg ---

enum Msg {
  Tick
  PollMetrics
  GotMetrics(@prometheus.ClaudeMetrics)
  MetricsError(String)
}

// --- Update ---

fn update(dispatch : @rabbita.Dispatch[Msg], msg : Msg, model : Model) -> (@rabbita.Cmd, Model) {
  match msg {
    Tick => (
      @rabbita.delay(dispatch(Tick), 1000),
      { ..model, clock: get_time_string() },
    )
    PollMetrics => {
      let cmd = @http.get(
        "http://127.0.0.1:8721/claude-metrics",
        expect=Json(
          fn(result) {
            match result {
              Ok(m) => dispatch(GotMetrics(m))
              Err(e) => dispatch(MetricsError(e))
            }
          },
          @prometheus.decode_metrics,
        ),
      )
      let next_poll = @rabbita.delay(dispatch(PollMetrics), 10_000)
      (@rabbita.batch([cmd, next_poll]), model)
    }
    GotMetrics(m) => (@rabbita.none, { ..model, metrics: Loaded(m) })
    MetricsError(e) => (@rabbita.none, { ..model, metrics: Error(e) })
  }
}

// --- View ---

fn view(_dispatch : @rabbita.Dispatch[Msg], model : Model) -> @html.Html {
  @html.div([
    view_header(model.clock),
    view_claude(model.metrics),
    view_footer(),
  ])
}

fn view_header(clock : String) -> @html.Html {
  @html.div(
    class="header",
    [
      @html.h1(class="glow", "CLAUDE"),
      @html.span(class="clock glow", clock),
    ],
  )
}

fn view_footer() -> @html.Html {
  @html.div(
    class="footer",
    [
      @html.span("POLL: 10s"),
      @html.span(class="footer-right", get_time_string()),
    ],
  )
}

fn view_claude(state : MetricsState) -> @html.Html {
  match state {
    Loading => @html.div(class="loading glow", "LOADING...")
    Error(e) => @html.div(class="loading error glow", "ERROR: \{e}")
    Loaded(m) => view_claude_loaded(m)
  }
}

fn view_claude_loaded(m : @prometheus.ClaudeMetrics) -> @html.Html {
  @html.div(
    class="claude-monitor",
    [
      // Cost panel
      @html.div(
        class="cost-panel",
        [
          @html.div([
            @html.div(class="cost-total glow", "$\{@format.fixed(m.cost_total, 2)}"),
            @html.div(class="cost-label", "TOTAL COST (ALL TIME)"),
          ]),
          @html.div(
            style=["text-align: right"],
            [
              @html.div(class="cost-period glow", "$\{@format.fixed(m.cost_period, 2)}"),
              @html.div(class="cost-label", "LAST 24H"),
            ],
          ),
        ],
      ),
      // Token panel
      view_token_panel(m),
      // Activity panel
      view_activity_panel(m),
      // Session panel
      @html.div(
        class="session-panel",
        [
          @html.span(class="model-badge", "OPUS 4.6"),
          @html.span(
            style=["color: var(--green-dim); font-size: 16px"],
            "\{m.pull_requests.to_int()} PRs CREATED",
          ),
        ],
      ),
    ],
  )
}

fn view_token_panel(m : @prometheus.ClaudeMetrics) -> @html.Html {
  let total = m.tokens_input + m.tokens_output + m.tokens_cache_read + m.tokens_cache_creation
  @html.div(
    class="token-panel",
    [
      @html.h2("TOKENS"),
      token_row("INPUT", @format.token_count(m.tokens_input)),
      token_row("OUTPUT", @format.token_count(m.tokens_output)),
      token_row("CACHE READ", @format.token_count(m.tokens_cache_read)),
      token_row("CACHE WRITE", @format.token_count(m.tokens_cache_creation)),
      if total > 0.0 {
        view_token_bar(m, total)
      } else {
        @html.nothing
      },
    ],
  )
}

fn token_row(label : String, value : String) -> @html.Html {
  @html.div(
    class="token-row",
    [
      @html.span(class="token-label", label),
      @html.span(class="token-value", value),
    ],
  )
}

fn view_token_bar(m : @prometheus.ClaudeMetrics, total : Double) -> @html.Html {
  let pct = fn(v : Double) -> String { @format.fixed(v / total * 100.0, 1) + "%" }
  @html.div(
    class="token-bar-container",
    [
      @html.div(class="token-bar-segment input", style=["width: \{pct(m.tokens_input)}"], ""),
      @html.div(class="token-bar-segment output", style=["width: \{pct(m.tokens_output)}"], ""),
      @html.div(class="token-bar-segment cache-read", style=["width: \{pct(m.tokens_cache_read)}"], ""),
      @html.div(class="token-bar-segment cache-creation", style=["width: \{pct(m.tokens_cache_creation)}"], ""),
    ],
  )
}

fn view_activity_panel(m : @prometheus.ClaudeMetrics) -> @html.Html {
  @html.div(
    class="activity-panel",
    [
      @html.h2("ACTIVITY"),
      @html.div(
        class="counter-grid",
        [
          counter_item(m.sessions.to_int().to_string(), "SESSIONS"),
          counter_item(m.edits.to_int().to_string(), "EDITS"),
          counter_item(@format.token_count(m.lines_of_code), "LINES"),
          counter_item(m.commits.to_int().to_string(), "COMMITS"),
        ],
      ),
    ],
  )
}

fn counter_item(value : String, label : String) -> @html.Html {
  @html.div(
    class="counter-item",
    [
      @html.div(class="counter-value glow", value),
      @html.div(class="counter-label", label),
    ],
  )
}

// --- JS FFI ---

extern "js" fn get_time_string() -> String =
  #|() => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// --- Main ---

fn main {
  let (dispatch, cell) = @rabbita.cell_with_dispatch(
    model={ clock: get_time_string(), metrics: Loading },
    update=update,
    view=view,
  )
  let app = @rabbita.new(cell)
  app.with_init(
    @rabbita.batch([
      @rabbita.delay(dispatch(Tick), 1000),
      dispatch(PollMetrics),
    ]),
  )
  app.mount("app")
}
