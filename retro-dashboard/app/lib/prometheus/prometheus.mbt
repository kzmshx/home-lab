/// Prometheus API client
/// Uses a local proxy endpoint that aggregates all queries into one JSON response.

pub struct ClaudeMetrics {
  cost_total : Double
  cost_period : Double
  tokens_input : Double
  tokens_output : Double
  tokens_cache_read : Double
  tokens_cache_creation : Double
  sessions : Double
  edits : Double
  lines_of_code : Double
  commits : Double
  pull_requests : Double
} derive(Show, Eq, FromJson, ToJson)

/// Decode ClaudeMetrics from JSON.
/// Signature matches Rabbita's Http.Expecting.Json decoder: (Json) -> Result[T, String]
pub fn decode_metrics(json : Json) -> Result[ClaudeMetrics, String] {
  try {
    let m : ClaudeMetrics = @json.from_json(json)
    Ok(m)
  } catch {
    e => Err(e.to_string())
  }
}
