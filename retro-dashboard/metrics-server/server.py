"""Retro Dashboard BFF — system metrics, Prometheus proxy, daily note parser, SSE."""

import json
import os
import re
import subprocess
import time
import threading
import urllib.request
import urllib.parse
from datetime import date
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

import psutil

VAULT_PATH = os.path.expanduser("~/Documents/Obsidian/atoms")
PROM_BASE = "http://localhost:9090/api/v1/query"


# --- Daily note parser ---

def get_daily_path(d=None):
    d = d or date.today()
    return os.path.join(VAULT_PATH, "daily", f"{d.isoformat()}.md")


def parse_daily(path):
    if not os.path.exists(path):
        return {"date": date.today().isoformat(), "sections": {}, "timeline": []}

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    sections = {}
    current_section = None
    current_lines = []
    in_frontmatter = False
    frontmatter_done = False

    for line in content.split("\n"):
        if line.strip() == "---" and not frontmatter_done:
            if in_frontmatter:
                frontmatter_done = True
            else:
                in_frontmatter = True
            continue
        if in_frontmatter and not frontmatter_done:
            continue

        if line.startswith("## "):
            if current_section:
                sections[current_section] = "\n".join(current_lines)
            current_section = line[3:].strip()
            current_lines = []
        elif current_section:
            current_lines.append(line)

    if current_section:
        sections[current_section] = "\n".join(current_lines)

    timeline = parse_timeline(sections.get("タイムライン", ""))

    d_str = date.today().isoformat()
    match = re.search(r"date:\s*(\S+)", content)
    if match:
        d_str = match.group(1)

    return {
        "date": d_str,
        "sections": list(sections.keys()),
        "timeline": timeline,
        "plan": sections.get("今日は何する日？", "").strip(),
        "reflection": sections.get("感想", "").strip(),
    }


def parse_timeline(text):
    entries = []
    current = None

    for line in text.split("\n"):
        m = re.match(r"^- (\d{1,2}:\d{2})\s+(.*)", line)
        if m:
            if current:
                entries.append(current)
            current = {"time": m.group(1), "text": m.group(2).strip()}
        elif current and line.startswith("    "):
            current["text"] += " " + line.strip()

    if current:
        entries.append(current)
    return entries


# --- Daily SSE (file watcher) ---

class DailyWatcher:
    def __init__(self):
        self.subscribers = []
        self.lock = threading.Lock()
        self.last_mtime = 0
        self.last_data = None
        self.running = True
        self.thread = threading.Thread(target=self._watch, daemon=True)
        self.thread.start()

    def _watch(self):
        while self.running:
            try:
                path = get_daily_path()
                if os.path.exists(path):
                    mtime = os.path.getmtime(path)
                    if mtime != self.last_mtime:
                        self.last_mtime = mtime
                        data = parse_daily(path)
                        self.last_data = data
                        self._notify(data)
            except Exception as e:
                print(f"Watcher error: {e}")
            time.sleep(2)

    def _notify(self, data):
        payload = f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        with self.lock:
            dead = []
            for wfile in self.subscribers:
                try:
                    wfile.write(payload.encode("utf-8"))
                    wfile.flush()
                except Exception:
                    dead.append(wfile)
            for w in dead:
                self.subscribers.remove(w)

    def subscribe(self, wfile):
        with self.lock:
            self.subscribers.append(wfile)
        if self.last_data:
            try:
                payload = f"data: {json.dumps(self.last_data, ensure_ascii=False)}\n\n"
                wfile.write(payload.encode("utf-8"))
                wfile.flush()
            except Exception:
                pass

    def unsubscribe(self, wfile):
        with self.lock:
            if wfile in self.subscribers:
                self.subscribers.remove(wfile)


daily_watcher = None


# --- AI Reaction (via claude -p) ---

class ReactionCache:
    def __init__(self):
        self.lock = threading.Lock()
        self.last_mtime = 0
        self.reactions = []
        self.generating = False

    def get_or_generate(self, daily_data):
        path = get_daily_path()
        if not os.path.exists(path):
            return []

        mtime = os.path.getmtime(path)
        with self.lock:
            if mtime == self.last_mtime and self.reactions:
                return self.reactions
            if self.generating:
                return self.reactions

        with self.lock:
            self.generating = True

        try:
            reactions = generate_reactions(daily_data)
            with self.lock:
                self.reactions = reactions
                self.last_mtime = mtime
                self.generating = False
            return reactions
        except Exception as e:
            print(f"Reaction generation failed: {e}")
            with self.lock:
                self.generating = False
            return self.reactions


def generate_reactions(daily_data):
    timeline = daily_data.get("timeline", [])
    if not timeline:
        return []

    timeline_text = "\n".join(
        f"- {e['time']} {e['text']}" for e in timeline
    )

    prompt = f"""以下は今日の日報タイムラインです。各エントリに対して、短い一言リアクション（10-20文字程度）を返してください。
共感、応援、ツッコミ、気づきなど、友人のような自然なトーンで。

JSON配列で返してください。各要素は {{"time": "HH:MM", "reaction": "リアクション"}} の形式です。
JSON以外の文字列は含めないでください。

タイムライン:
{timeline_text}"""

    try:
        result = subprocess.run(
            ["claude", "-p", prompt, "--output-format", "text"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print(f"claude -p failed: {result.stderr[:200]}")
            return []

        text = result.stdout.strip()
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)

        return json.loads(text)
    except subprocess.TimeoutExpired:
        print("claude -p timed out")
        return []
    except (json.JSONDecodeError, Exception) as e:
        print(f"Failed to parse reaction: {e}")
        return []


reaction_cache = None


# --- Prometheus proxy ---

def prom_query(expr):
    url = f"{PROM_BASE}?query={urllib.parse.quote(expr)}"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read())
            if data.get("status") == "success":
                return data["data"]["result"]
    except Exception:
        pass
    return []


def scalar_value(results):
    if not results:
        return 0.0
    try:
        return float(results[0]["value"][1])
    except (KeyError, IndexError, ValueError):
        return 0.0


def get_claude_metrics():
    cost_total = prom_query("sum(claude_code_cost_usage_USD_total)")
    cost_period = prom_query("sum(increase(claude_code_cost_usage_USD_total[24h]))")
    tokens_by_type = prom_query("sum(claude_code_token_usage_tokens_total) by (type)")
    sessions = prom_query("sum(claude_code_session_count_total)")
    edits = prom_query("sum(claude_code_code_edit_tool_decision_total)")
    loc = prom_query("sum(claude_code_lines_of_code_count_total)")
    commits = prom_query("sum(claude_code_commit_count_total)")
    prs = prom_query("sum(claude_code_pull_request_count_total)")

    tokens = {}
    for item in tokens_by_type:
        t = item.get("metric", {}).get("type", "")
        try:
            tokens[t] = float(item["value"][1])
        except (KeyError, IndexError, ValueError):
            pass

    return {
        "cost_total": scalar_value(cost_total),
        "cost_period": scalar_value(cost_period),
        "tokens_input": tokens.get("input", 0.0),
        "tokens_output": tokens.get("output", 0.0),
        "tokens_cache_read": tokens.get("cacheRead", 0.0),
        "tokens_cache_creation": tokens.get("cacheCreation", 0.0),
        "sessions": scalar_value(sessions),
        "edits": scalar_value(edits),
        "lines_of_code": scalar_value(loc),
        "commits": scalar_value(commits),
        "pull_requests": scalar_value(prs),
    }


# --- System metrics ---

def get_metrics():
    cpu_percent_per_core = psutil.cpu_percent(interval=None, percpu=True)
    cpu_percent_total = psutil.cpu_percent(interval=None)
    cpu_freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()
    boot_time = psutil.boot_time()
    uptime_sec = int(time.time() - boot_time)

    top_procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent"]):
        try:
            info = proc.info
            if info["cpu_percent"] is not None and info["cpu_percent"] > 0:
                top_procs.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    top_procs.sort(key=lambda p: p["cpu_percent"], reverse=True)
    top_procs = top_procs[:10]

    return {
        "timestamp": int(time.time()),
        "cpu": {
            "percent_total": cpu_percent_total,
            "percent_per_core": cpu_percent_per_core,
            "freq_mhz": cpu_freq.current if cpu_freq else None,
            "cores": psutil.cpu_count(),
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 1),
            "used_gb": round(mem.used / (1024**3), 1),
            "percent": mem.percent,
            "swap_percent": swap.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 1),
            "used_gb": round(disk.used / (1024**3), 1),
            "percent": disk.percent,
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        },
        "uptime_sec": uptime_sec,
        "top_processes": top_procs,
    }


# --- HTTP handler ---

class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            self._json_response(get_metrics())
        elif self.path == "/claude-metrics":
            self._json_response(get_claude_metrics())
        elif self.path == "/daily":
            self._json_response(parse_daily(get_daily_path()))
        elif self.path == "/daily/reaction":
            daily_data = parse_daily(get_daily_path())
            reactions = reaction_cache.get_or_generate(daily_data)
            self._json_response(reactions)
        elif self.path == "/daily/stream":
            self._sse_response()
        else:
            self.send_response(404)
            self.end_headers()

    def _json_response(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _sse_response(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        daily_watcher.subscribe(self.wfile)
        try:
            while True:
                time.sleep(1)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            daily_watcher.unsubscribe(self.wfile)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.end_headers()

    def log_message(self, format, *args):
        pass


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


if __name__ == "__main__":
    psutil.cpu_percent(interval=None, percpu=True)
    daily_watcher = DailyWatcher()
    reaction_cache = ReactionCache()
    port = 8721
    server = ThreadingHTTPServer(("127.0.0.1", port), MetricsHandler)
    print(f"Retro Dashboard BFF listening on http://127.0.0.1:{port}")
    print(f"  /metrics        - system metrics")
    print(f"  /claude-metrics - Claude Code metrics (via Prometheus)")
    print(f"  /daily          - today's daily note (JSON)")
    print(f"  /daily/stream   - daily note SSE stream")
    server.serve_forever()
