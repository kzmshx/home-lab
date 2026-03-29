const PROM_BASE = 'http://localhost:9090/api/v1';

async function query(expr) {
  const res = await fetch(`${PROM_BASE}/query?query=${encodeURIComponent(expr)}`);
  if (!res.ok) throw new Error(`Prometheus ${res.status}`);
  const data = await res.json();
  if (data.status !== 'success') throw new Error(`Prometheus query failed`);
  return data.data.result;
}

function scalarValue(results) {
  if (!results.length) return 0;
  return parseFloat(results[0].value[1]) || 0;
}

function labeledValues(results) {
  return results.map(r => ({
    labels: r.metric,
    value: parseFloat(r.value[1]) || 0,
  }));
}

export async function fetchClaudeCodeMetrics(range = '24h') {
  const [
    costTotal,
    costRate,
    tokensByType,
    sessions,
    edits,
    linesOfCode,
    commits,
    pullRequests,
  ] = await Promise.all([
    query(`sum(claude_code_cost_usage_USD_total)`),
    query(`sum(increase(claude_code_cost_usage_USD_total[${range}]))`),
    query(`sum(claude_code_token_usage_tokens_total) by (type)`),
    query(`sum(claude_code_session_count_total)`),
    query(`sum(claude_code_code_edit_tool_decision_total)`),
    query(`sum(claude_code_lines_of_code_count_total)`),
    query(`sum(claude_code_commit_count_total)`),
    query(`sum(claude_code_pull_request_count_total)`),
  ]);

  const tokens = {};
  for (const item of labeledValues(tokensByType)) {
    tokens[item.labels.type] = item.value;
  }

  return {
    cost: {
      total: scalarValue(costTotal),
      period: scalarValue(costRate),
    },
    tokens: {
      input: tokens.input || 0,
      output: tokens.output || 0,
      cacheRead: tokens.cacheRead || 0,
      cacheCreation: tokens.cacheCreation || 0,
    },
    sessions: scalarValue(sessions),
    edits: scalarValue(edits),
    linesOfCode: scalarValue(linesOfCode),
    commits: scalarValue(commits),
    pullRequests: scalarValue(pullRequests),
  };
}
