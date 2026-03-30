// Retro Dashboard — MoonBit + Rabbita
// This only works with the JavaScript backend.

// --- Model ---

enum Tab {
  Daily
  Claude
} derive(Show, Eq)

struct Model {
  clock : String
  tab : Tab
  daily : DailyState
  claude : ClaudeState
} derive(Show)

enum DailyState {
  DailyLoading
  DailyLoaded(@daily.DailyNote)
  DailyError(String)
} derive(Show)

enum ClaudeState {
  ClaudeLoading
  ClaudeLoaded(@prometheus.ClaudeMetrics)
  ClaudeError(String)
} derive(Show)

// --- Msg ---

enum Msg {
  Tick
  SwitchTab(Tab)
  // Daily
  PollDaily
  GotDaily(@daily.DailyNote)
  DailyErr(String)
  // Claude
  PollClaude
  GotClaude(@prometheus.ClaudeMetrics)
  ClaudeErr(String)
}

// --- Update ---

fn update(dispatch : @rabbita.Dispatch[Msg], msg : Msg, model : Model) -> (@rabbita.Cmd, Model) {
  match msg {
    Tick => (
      @rabbita.delay(dispatch(Tick), 1000),
      { ..model, clock: get_time_string() },
    )
    SwitchTab(tab) => (@rabbita.none, { ..model, tab, })

    // Daily
    PollDaily => {
      let cmd = @http.get(
        "http://127.0.0.1:8721/daily",
        expect=Json(
          fn(result) {
            match result {
              Ok(d) => dispatch(GotDaily(d))
              Err(e) => dispatch(DailyErr(e))
            }
          },
          @daily.decode_daily,
        ),
      )
      let next = @rabbita.delay(dispatch(PollDaily), 10_000)
      (@rabbita.batch([cmd, next]), model)
    }
    GotDaily(d) => (@rabbita.none, { ..model, daily: DailyLoaded(d) })
    DailyErr(e) => (@rabbita.none, { ..model, daily: DailyError(e) })

    // Claude
    PollClaude => {
      let cmd = @http.get(
        "http://127.0.0.1:8721/claude-metrics",
        expect=Json(
          fn(result) {
            match result {
              Ok(m) => dispatch(GotClaude(m))
              Err(e) => dispatch(ClaudeErr(e))
            }
          },
          @prometheus.decode_metrics,
        ),
      )
      let next = @rabbita.delay(dispatch(PollClaude), 10_000)
      (@rabbita.batch([cmd, next]), model)
    }
    GotClaude(m) => (@rabbita.none, { ..model, claude: ClaudeLoaded(m) })
    ClaudeErr(e) => (@rabbita.none, { ..model, claude: ClaudeError(e) })
  }
}

// --- View ---

fn view(dispatch : @rabbita.Dispatch[Msg], model : Model) -> @html.Html {
  @html.div([
    view_header(dispatch, model),
    match model.tab {
      Daily => view_daily(model.daily)
      Claude => view_claude(model.claude)
    },
    view_footer(),
  ])
}

fn view_header(dispatch : @rabbita.Dispatch[Msg], model : Model) -> @html.Html {
  @html.div(
    class="header",
    [
      @html.div(
        style=["display: flex; gap: 24px; align-items: center"],
        [
          tab_link(dispatch, "DAILY", Daily, model.tab),
          tab_link(dispatch, "CLAUDE", Claude, model.tab),
        ],
      ),
      @html.span(class="clock glow", model.clock),
    ],
  )
}

fn tab_link(dispatch : @rabbita.Dispatch[Msg], label : String, tab : Tab, current : Tab) -> @html.Html {
  let cls = if tab == current { "tab glow" } else { "tab tab-inactive" }
  @html.div(
    class=cls,
    style=["cursor: pointer; display: inline"],
    on_click=dispatch(SwitchTab(tab)),
    label,
  )
}

fn view_footer() -> @html.Html {
  @html.div(
    class="footer",
    [
      @html.span("RETRO DASHBOARD"),
      @html.span(get_time_string()),
    ],
  )
}

// --- Daily view ---

fn view_daily(state : DailyState) -> @html.Html {
  match state {
    DailyLoading => @html.div(class="loading glow", "LOADING...")
    DailyError(e) => @html.div(class="loading error glow", "ERROR: \{e}")
    DailyLoaded(note) => view_daily_loaded(note)
  }
}

fn view_daily_loaded(note : @daily.DailyNote) -> @html.Html {
  @html.div(
    class="daily-view",
    [
      // Date header
      @html.div(
        class="daily-date",
        [
          @html.span(class="glow", note.date),
          if note.plan.length() > 0 {
            let first_line = note.plan.split("\n").next().unwrap_or("")
            @html.span(class="daily-plan", " | \{first_line}")
          } else {
            @html.nothing
          },
        ],
      ),
      // Timeline
      @html.div(
        class="timeline",
        note.timeline.map(view_timeline_entry),
      ),
    ],
  )
}

fn view_timeline_entry(entry : @daily.TimelineEntry) -> @html.Html {
  @html.div(
    class="timeline-entry",
    [
      @html.span(class="timeline-time glow", entry.time),
      @html.span(class="timeline-text", entry.text),
    ],
  )
}

// --- Claude view ---

fn view_claude(state : ClaudeState) -> @html.Html {
  match state {
    ClaudeLoading => @html.div(class="loading glow", "LOADING...")
    ClaudeError(e) => @html.div(class="loading error glow", "ERROR: \{e}")
    ClaudeLoaded(m) => view_claude_loaded(m)
  }
}

fn view_claude_loaded(m : @prometheus.ClaudeMetrics) -> @html.Html {
  @html.div(
    class="claude-monitor",
    [
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
      view_token_panel(m),
      view_activity_panel(m),
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
    [@html.span(class="token-label", label), @html.span(class="token-value", value)],
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
    [@html.div(class="counter-value glow", value), @html.div(class="counter-label", label)],
  )
}

// --- JS FFI ---

extern "js" fn get_time_string() -> String =
  #|() => new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// --- Main ---

fn main {
  let (dispatch, cell) = @rabbita.cell_with_dispatch(
    model={
      clock: get_time_string(),
      tab: Daily,
      daily: DailyLoading,
      claude: ClaudeLoading,
    },
    update=update,
    view=view,
  )
  let app = @rabbita.new(cell)
  app.with_init(
    @rabbita.batch([
      @rabbita.delay(dispatch(Tick), 1000),
      dispatch(PollDaily),
      dispatch(PollClaude),
    ]),
  )
  app.mount("app")
}
