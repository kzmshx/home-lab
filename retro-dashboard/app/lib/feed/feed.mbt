/// News feed item from Hacker News.

pub struct FeedItem {
  id : Int
  title : String
  url : String
  score : Int
  by : String
  time : Int
} derive(Show, Eq, FromJson, ToJson)

pub fn decode_feed(json : Json) -> Result[Array[FeedItem], String] {
  try {
    let items : Array[FeedItem] = @json.from_json(json)
    Ok(items)
  } catch {
    e => Err(e.to_string())
  }
}
