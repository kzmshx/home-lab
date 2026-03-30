import type { DailyNote } from "./vault";
import { getDailyPath, getDailyMtime } from "./vault";

interface Reaction {
  time: string;
  reaction: string;
}

let lastMtime = 0;
let cachedReactions: Reaction[] = [];
let generating = false;

export async function getOrGenerateReactions(
  dailyData: DailyNote
): Promise<Reaction[]> {
  const path = getDailyPath();
  const mtime = await getDailyMtime(path);

  if (mtime === 0) return [];
  if (mtime === lastMtime && cachedReactions.length > 0) return cachedReactions;
  if (generating) return cachedReactions;

  generating = true;
  try {
    const reactions = await generateReactions(dailyData);
    cachedReactions = reactions;
    lastMtime = mtime;
    return reactions;
  } catch (e) {
    console.error("Reaction generation failed:", e);
    return cachedReactions;
  } finally {
    generating = false;
  }
}

async function generateReactions(dailyData: DailyNote): Promise<Reaction[]> {
  const { timeline } = dailyData;
  if (!timeline.length) return [];

  const timelineText = timeline.map((e) => `- ${e.time} ${e.text}`).join("\n");

  const prompt = `以下は今日の日報タイムラインです。各エントリに対して、短い一言リアクション（10-20文字程度）を返してください。
共感、応援、ツッコミ、気づきなど、友人のような自然なトーンで。

JSON配列で返してください。各要素は {"time": "HH:MM", "reaction": "リアクション"} の形式です。
JSON以外の文字列は含めないでください。

タイムライン:
${timelineText}`;

  const proc = Bun.spawn(["claude", "-p", prompt, "--output-format", "text"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`claude -p failed: ${stderr.slice(0, 200)}`);
    return [];
  }

  let text = await new Response(proc.stdout).text();
  text = text.trim();

  // Strip code block wrapper
  if (text.startsWith("```")) {
    text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(text);
}
