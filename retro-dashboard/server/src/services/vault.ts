import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const VAULT_PATH = join(homedir(), "Documents", "Obsidian", "atoms");

export interface TimelineEntry {
  time: string;
  text: string;
}

export interface DailyNote {
  date: string;
  sections: string[];
  timeline: TimelineEntry[];
  plan: string;
  reflection: string;
}

export function getDailyPath(d?: Date): string {
  const date = d ?? new Date();
  const iso = date.toISOString().slice(0, 10);
  return join(VAULT_PATH, "daily", `${iso}.md`);
}

export async function getDailyMtime(path: string): Promise<number> {
  try {
    const s = await stat(path);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

export async function parseDaily(path: string): Promise<DailyNote> {
  const today = new Date().toISOString().slice(0, 10);

  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch {
    return { date: today, sections: [], timeline: [], plan: "", reflection: "" };
  }

  const lines = content.split("\n");
  const sections: Record<string, string[]> = {};
  let currentSection: string | null = null;
  let currentLines: string[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;

  for (const line of lines) {
    if (line.trim() === "---" && !frontmatterDone) {
      if (inFrontmatter) {
        frontmatterDone = true;
      } else {
        inFrontmatter = true;
      }
      continue;
    }
    if (inFrontmatter && !frontmatterDone) continue;

    if (line.startsWith("## ")) {
      if (currentSection) {
        sections[currentSection] = currentLines;
      }
      currentSection = line.slice(3).trim();
      currentLines = [];
    } else if (currentSection) {
      currentLines.push(line);
    }
  }
  if (currentSection) {
    sections[currentSection] = currentLines;
  }

  const timelineText = (sections["タイムライン"] ?? []).join("\n");
  const timeline = parseTimeline(timelineText);

  let dateStr = today;
  const dateMatch = content.match(/date:\s*(\S+)/);
  if (dateMatch) {
    dateStr = dateMatch[1]!;
  }

  return {
    date: dateStr,
    sections: Object.keys(sections),
    timeline,
    plan: (sections["今日は何する日？"] ?? []).join("\n").trim(),
    reflection: (sections["感想"] ?? []).join("\n").trim(),
  };
}

function parseTimeline(text: string): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let current: TimelineEntry | null = null;

  for (const line of text.split("\n")) {
    const m = line.match(/^- (\d{1,2}:\d{2})\s+(.*)/);
    if (m) {
      if (current) entries.push(current);
      current = { time: m[1]!, text: m[2]!.trim() };
    } else if (current && line.startsWith("    ")) {
      current.text += " " + line.trim();
    }
  }
  if (current) entries.push(current);
  return entries;
}

export async function getPastDailies(): Promise<
  Array<{
    months_ago: number;
    date: string;
    timeline: TimelineEntry[];
    plan: string;
  }>
> {
  const today = new Date();
  const offsets = [1, 3, 6, 12];
  const results: Array<{
    months_ago: number;
    date: string;
    timeline: TimelineEntry[];
    plan: string;
  }> = [];

  for (const months of offsets) {
    let year = today.getFullYear();
    let month = today.getMonth() + 1 - months;
    while (month <= 0) {
      month += 12;
      year -= 1;
    }
    const day = Math.min(today.getDate(), 28);
    const d = new Date(year, month - 1, day);
    const path = getDailyPath(d);

    try {
      await stat(path);
    } catch {
      continue;
    }

    const data = await parseDaily(path);
    if (data.timeline.length > 0) {
      results.push({
        months_ago: months,
        date: d.toISOString().slice(0, 10),
        timeline: data.timeline.slice(0, 3),
        plan: data.plan,
      });
    }
  }

  return results;
}

export async function getDailyTags(path: string): Promise<string[]> {
  try {
    const file = Bun.file(path);
    const content = await file.slice(0, 500).text();
    const match = content.match(/tags:\s*\[([^\]]+)\]/);
    if (!match) return [];
    return match[1]!.split(",").map((t) => t.trim().replace(/^['"]|['"]$/g, ""));
  } catch {
    return [];
  }
}
