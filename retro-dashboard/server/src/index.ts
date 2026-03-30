import { Hono } from "hono";
import { cors } from "hono/cors";
import { dailyRoutes } from "./routes/daily";
import { claudeRoutes } from "./routes/claude";
import { feedRoutes } from "./routes/feed";

const app = new Hono();

app.use("*", cors());

app.route("/daily", dailyRoutes);
app.route("/claude-metrics", claudeRoutes);
app.route("/feed", feedRoutes);

const port = 8721;
console.log(`Retro Dashboard BFF listening on http://127.0.0.1:${port}`);
console.log("  /daily          - today's daily note");
console.log("  /daily/reaction - AI reaction");
console.log("  /daily/past     - past daily notes");
console.log("  /daily/stream   - SSE stream");
console.log("  /claude-metrics - Claude Code metrics");
console.log("  /feed           - news feed");

export default {
  port,
  fetch: app.fetch,
};
