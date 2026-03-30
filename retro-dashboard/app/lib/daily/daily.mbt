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

pub fn decode_daily(json : Json) -> Result[DailyNote, String] {
  try {
    let d : DailyNote = @json.from_json(json)
    Ok(d)
  } catch {
    e => Err(e.to_string())
  }
}
