const PROM_BASE = "http://localhost:9090/api/v1/query";

async function promQuery(expr: string): Promise<unknown[]> {
  const url = `${PROM_BASE}?query=${encodeURIComponent(expr)}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = (await resp.json()) as { status: string; data: { result: unknown[] } };
    if (data.status === "success") {
      return data.data.result;
    }
  } catch {
    // Prometheus unavailable
  }
  return [];
}

function scalarValue(results: unknown[]): number {
  if (!results.length) return 0;
  try {
    const first = results[0] as { value: [number, string] };
    return parseFloat(first.value[1]);
  } catch {
    return 0;
  }
}

export interface ClaudeMetrics {
  cost_total: number;
  cost_period: number;
  tokens_input: number;
  tokens_output: number;
  tokens_cache_read: number;
  tokens_cache_creation: number;
  sessions: number;
  edits: number;
  lines_of_code: number;
  commits: number;
  pull_requests: number;
}

export async function getClaudeMetrics(): Promise<ClaudeMetrics> {
  const [costTotal, costPeriod, tokensByType, sessions, edits, loc, commits, prs] =
    await Promise.all([
      promQuery("sum(claude_code_cost_usage_USD_total)"),
      promQuery("sum(increase(claude_code_cost_usage_USD_total[24h]))"),
      promQuery("sum(claude_code_token_usage_tokens_total) by (type)"),
      promQuery("sum(claude_code_session_count_total)"),
      promQuery("sum(claude_code_code_edit_tool_decision_total)"),
      promQuery("sum(claude_code_lines_of_code_count_total)"),
      promQuery("sum(claude_code_commit_count_total)"),
      promQuery("sum(claude_code_pull_request_count_total)"),
    ]);

  const tokens: Record<string, number> = {};
  for (const item of tokensByType) {
    const r = item as { metric: { type: string }; value: [number, string] };
    try {
      tokens[r.metric.type] = parseFloat(r.value[1]);
    } catch {
      // skip
    }
  }

  return {
    cost_total: scalarValue(costTotal),
    cost_period: scalarValue(costPeriod),
    tokens_input: tokens["input"] ?? 0,
    tokens_output: tokens["output"] ?? 0,
    tokens_cache_read: tokens["cacheRead"] ?? 0,
    tokens_cache_creation: tokens["cacheCreation"] ?? 0,
    sessions: scalarValue(sessions),
    edits: scalarValue(edits),
    lines_of_code: scalarValue(loc),
    commits: scalarValue(commits),
    pull_requests: scalarValue(prs),
  };
}
