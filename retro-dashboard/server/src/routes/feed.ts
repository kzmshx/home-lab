import { Hono } from "hono";
import { getOrFetchFeed } from "../services/feed";
import { getDailyPath, getDailyTags } from "../services/vault";

export const feedRoutes = new Hono();

feedRoutes.get("/", async (c) => {
  const tags = await getDailyTags(getDailyPath());
  const items = await getOrFetchFeed(tags);
  return c.json(items);
});
