/// Daily note data types.

pub struct TimelineEntry {
  time : String
  text : String
} derive(Show, Eq, FromJson, ToJson)

pub struct DailyNote {
  date : String
  sections : Array[String]
  timeline : Array[TimelineEntry]
  plan : String
  reflection : String
} derive(Show, Eq, FromJson, ToJson)

pub struct Reaction {
  time : String
  reaction : String
} derive(Show, Eq, FromJson, ToJson)

pub fn decode_daily(json : Json) -> Result[DailyNote, String] {
  try {
    let d : DailyNote = @json.from_json(json)
    Ok(d)
  } catch {
    e => Err(e.to_string())
  }
}

pub struct PastDaily {
  months_ago : Int
  date : String
  timeline : Array[TimelineEntry]
  plan : String
} derive(Show, Eq, FromJson, ToJson)

pub fn decode_past(json : Json) -> Result[Array[PastDaily], String] {
  try {
    let p : Array[PastDaily] = @json.from_json(json)
    Ok(p)
  } catch {
    e => Err(e.to_string())
  }
}

pub fn decode_reactions(json : Json) -> Result[Array[Reaction], String] {
  try {
    let r : Array[Reaction] = @json.from_json(json)
    Ok(r)
  } catch {
    e => Err(e.to_string())
  }
}
