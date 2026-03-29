const METRICS_URL = 'http://127.0.0.1:8721/metrics';

let prevNet = null;

export async function fetchMetrics() {
  const res = await fetch(METRICS_URL);
  if (!res.ok) throw new Error(`Metrics server ${res.status}`);
  return res.json();
}

export function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function calcNetSpeed(metrics) {
  const now = { sent: metrics.network.bytes_sent, recv: metrics.network.bytes_recv, time: Date.now() };
  let speed = { sent: 0, recv: 0 };
  if (prevNet) {
    const elapsed = (now.time - prevNet.time) / 1000;
    if (elapsed > 0) {
      speed.sent = (now.sent - prevNet.sent) / elapsed;
      speed.recv = (now.recv - prevNet.recv) / elapsed;
    }
  }
  prevNet = now;
  return speed;
}
