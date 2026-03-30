/// Format a number with fixed decimal places
pub fn fixed(value : Double, decimals : Int) -> String {
  if decimals == 0 {
    return value.to_int().to_string()
  }
  let factor = pow10(decimals)
  let rounded = (value * factor + 0.5).to_int()
  let int_part = rounded / factor.to_int()
  let frac_part = rounded % factor.to_int()
  let frac_str = frac_part.to_string()
  let padding = decimals - frac_str.length()
  let mut pad = ""
  for i = 0; i < padding; i = i + 1 {
    pad = pad + "0"
  }
  "\{int_part}.\{pad}\{frac_str}"
}

fn pow10(n : Int) -> Double {
  let mut result = 1.0
  for i = 0; i < n; i = i + 1 {
    result = result * 10.0
  }
  result
}

/// Format a token count for display (e.g., 1.2M, 34.5K)
pub fn token_count(n : Double) -> String {
  if n >= 1_000_000.0 {
    fixed(n / 1_000_000.0, 1) + "M"
  } else if n >= 1_000.0 {
    fixed(n / 1_000.0, 1) + "K"
  } else {
    n.to_int().to_string()
  }
}
