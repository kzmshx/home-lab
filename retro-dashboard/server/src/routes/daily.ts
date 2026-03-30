import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  getDailyPath,
  getDailyMtime,
  parseDaily,
  getPastDailies,
} from "../services/vault";
import { getOrGenerateReactions } from "../services/reaction";

export const dailyRoutes = new Hono();

dailyRoutes.get("/", async (c) => {
  const data = await parseDaily(getDailyPath());
  return c.json(data);
});

dailyRoutes.get("/reaction", async (c) => {
  const dailyData = await parseDaily(getDailyPath());
  const reactions = await getOrGenerateReactions(dailyData);
  return c.json(reactions);
});

dailyRoutes.get("/past", async (c) => {
  const data = await getPastDailies();
  return c.json(data);
});

dailyRoutes.get("/stream", (c) => {
  let lastMtime = 0;

  return streamSSE(c, async (stream) => {
    while (true) {
      try {
        const path = getDailyPath();
        const mtime = await getDailyMtime(path);

        if (mtime > 0 && mtime !== lastMtime) {
          lastMtime = mtime;
          const data = await parseDaily(path);
          await stream.writeSSE({ data: JSON.stringify(data) });
        }
      } catch (e) {
        console.error("SSE watcher error:", e);
      }

      await stream.sleep(2000);
    }
  });
});
