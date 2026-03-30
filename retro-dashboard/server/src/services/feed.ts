const HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{}.json";

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "tech/dev/lang": ["programming", "language", "compiler", "rust", "typescript", "python", "moonbit", "wasm"],
  "tech/dev/ops": ["ci", "cd", "deploy", "kubernetes", "docker", "monitoring", "observability"],
  "tech/ai/llm": ["llm", "gpt", "claude", "ai", "model", "transformer"],
  "tech/ai/agent": ["agent", "autonomous", "agentic"],
  "tech/cloud/gcp": ["google cloud", "gcp", "bigquery", "vertex"],
  "tech/cloud/aws": ["aws", "amazon", "ecs", "lambda", "bedrock"],
  "tech/infra": ["infrastructure", "terraform", "networking"],
  "tech/data/db": ["database", "sql", "postgres", "mysql"],
  "tech/dev/oss": ["open source", "oss", "github", "contribution"],
};

interface HnItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
}

interface FeedItem {
  id: number;
  title: string;
  url: string;
  score: number;
  by: string;
  time: number;
}

let cachedItems: FeedItem[] = [];
let lastFetch = 0;
const TTL = 300_000; // 5 minutes in ms

export async function getOrFetchFeed(tags?: string[]): Promise<FeedItem[]> {
  const now = Date.now();
  if (now - lastFetch < TTL && cachedItems.length > 0) {
    return filterByTags(cachedItems, tags);
  }

  const items = await fetchHnTop(30);
  cachedItems = items;
  lastFetch = now;
  return filterByTags(items, tags);
}

function filterByTags(items: FeedItem[], tags?: string[]): FeedItem[] {
  if (!tags?.length) return items.slice(0, 15);

  const keywords = new Set<string>();
  for (const tag of tags) {
    for (const kw of TOPIC_KEYWORDS[tag] ?? []) {
      keywords.add(kw.toLowerCase());
    }
  }
  if (!keywords.size) return items.slice(0, 15);

  const scored = items.map((item) => {
    const title = (item.title ?? "").toLowerCase();
    const score = [...keywords].filter((kw) => title.includes(kw)).length;
    return { score, item };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 15).map((s) => s.item);
}

async function fetchHnTop(count: number): Promise<FeedItem[]> {
  let ids: number[];
  try {
    const resp = await fetch(HN_TOP_URL, { signal: AbortSignal.timeout(5000) });
    ids = ((await resp.json()) as number[]).slice(0, count);
  } catch {
    return [];
  }

  const items: FeedItem[] = [];
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const resp = await fetch(HN_ITEM_URL.replace("{}", String(id)), {
        signal: AbortSignal.timeout(3000),
      });
      return resp.json() as Promise<HnItem>;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.title) {
      const v = result.value;
      items.push({
        id: v.id,
        title: v.title!,
        url: v.url ?? "",
        score: v.score ?? 0,
        by: v.by ?? "",
        time: v.time ?? 0,
      });
    }
  }

  return items;
}
