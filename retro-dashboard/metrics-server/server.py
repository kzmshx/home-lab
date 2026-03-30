"""Lightweight system metrics + Prometheus proxy API server for retro-dashboard."""

import json
import time
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler

import psutil

PROM_BASE = "http://localhost:9090/api/v1/query"


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


class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/metrics":
            data = get_metrics()
        elif self.path == "/claude-metrics":
            data = get_claude_metrics()
        else:
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    psutil.cpu_percent(interval=None, percpu=True)
    port = 8721
    server = HTTPServer(("127.0.0.1", port), MetricsHandler)
    print(f"Metrics server listening on http://127.0.0.1:{port}")
    print(f"  /metrics        - system metrics")
    print(f"  /claude-metrics - Claude Code metrics (via Prometheus)")
    server.serve_forever()
