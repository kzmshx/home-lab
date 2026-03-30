import { Hono } from "hono";
import { getClaudeMetrics } from "../services/prometheus";

export const claudeRoutes = new Hono();

claudeRoutes.get("/", async (c) => {
  const metrics = await getClaudeMetrics();
  return c.json(metrics);
});
