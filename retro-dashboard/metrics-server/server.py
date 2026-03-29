"""Lightweight system metrics API server for retro-dashboard."""

import json
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import psutil

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
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(get_metrics()).encode())

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
    print(f"Metrics server listening on http://127.0.0.1:{port}/metrics")
    server.serve_forever()
