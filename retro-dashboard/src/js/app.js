import { GitHubClient, normalizeStatus, timeAgo } from './github.js';
import { happyMacSvg, sadMacSvg } from './icons.js';
import { fetchMetrics, formatUptime, formatBytes, calcNetSpeed } from './metrics.js';
import { fetchClaudeCodeMetrics } from './prometheus.js';

const CONFIG_KEY = 'retro-dashboard-config';
const POLL_INTERVAL = 60_000;
const METRICS_INTERVAL = 2_000;
const CLAUDE_INTERVAL = 10_000;

let config = loadConfig();
let client = null;
let pollTimer = null;
let metricsTimer = null;
let claudeTimer = null;
let currentTab = 'ci';

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null;
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  config = cfg;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// --- Clock ---
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// --- Config screen ---
function showConfigScreen() {
  stopAllTimers();
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="config-screen">
      <h1 class="glow">RETRO DASHBOARD</h1>
      <p>GitHub Personal Access Token and repositories to monitor.</p>
      <form id="config-form" style="width:100%;max-width:500px;">
        <div style="margin-bottom:12px;">
          <label>TOKEN (optional for public repos)</label><br>
          <input id="cfg-token" type="password" value="${config?.token || ''}"
            style="width:100%;background:var(--bg);border:1px solid var(--green-dim);color:var(--green);font-family:inherit;font-size:18px;padding:6px;">
        </div>
        <div style="margin-bottom:12px;">
          <label>REPOS (owner/repo, one per line)</label><br>
          <textarea id="cfg-repos" rows="6"
            style="width:100%;background:var(--bg);border:1px solid var(--green-dim);color:var(--green);font-family:inherit;font-size:18px;padding:6px;resize:none;"
          >${config?.repos?.map(r => `${r.owner}/${r.repo}`).join('\n') || 'kzmshx/home-lab'}</textarea>
        </div>
        <button type="submit"
          style="background:var(--green-dim);color:var(--bg);border:none;font-family:inherit;font-size:20px;padding:8px 24px;cursor:pointer;">
          START MONITORING
        </button>
      </form>
    </div>
  `;

  document.getElementById('config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const token = document.getElementById('cfg-token').value.trim();
    const repoLines = document.getElementById('cfg-repos').value.trim().split('\n').filter(Boolean);
    const repos = repoLines.map(line => {
      const [owner, repo] = line.trim().split('/');
      return { owner, repo };
    }).filter(r => r.owner && r.repo);

    if (repos.length === 0) return;
    saveConfig({ token, repos });
    startDashboard();
  });
}

// --- Timer management ---
function stopAllTimers() {
  clearInterval(pollTimer);
  clearInterval(metricsTimer);
  clearInterval(claudeTimer);
  pollTimer = null;
  metricsTimer = null;
  claudeTimer = null;
}

// --- Tab header ---
function renderHeader() {
  return `
    <div class="header">
      <div style="display:flex;gap:24px;align-items:center;">
        <span class="tab glow ${currentTab === 'ci' ? '' : 'tab-inactive'}" id="tab-ci" style="cursor:pointer;">CI</span>
        <span class="tab glow ${currentTab === 'activity' ? '' : 'tab-inactive'}" id="tab-activity" style="cursor:pointer;">SYSTEM</span>
        <span class="tab glow ${currentTab === 'claude' ? '' : 'tab-inactive'}" id="tab-claude" style="cursor:pointer;">CLAUDE</span>
      </div>
      <div>
        <span id="clock" class="clock glow"></span>
        <span id="settings-btn" style="margin-left:16px;cursor:pointer;color:var(--green-dim);" title="Settings">[CFG]</span>
      </div>
    </div>
  `;
}

function bindHeaderEvents() {
  document.getElementById('tab-ci').addEventListener('click', () => switchTab('ci'));
  document.getElementById('tab-activity').addEventListener('click', () => switchTab('activity'));
  document.getElementById('tab-claude').addEventListener('click', () => switchTab('claude'));
  document.getElementById('settings-btn').addEventListener('click', () => showConfigScreen());
}

function switchTab(tab) {
  if (tab === currentTab) return;
  stopAllTimers();
  currentTab = tab;
  if (tab === 'ci') startCIView();
  else if (tab === 'activity') startActivityView();
  else startClaudeView();
}

// --- Dashboard ---
function startDashboard() {
  client = new GitHubClient(config.token);
  startCIView();
}

// ==================
// CI Monitor View
// ==================
function startCIView() {
  currentTab = 'ci';
  const app = document.getElementById('app');
  app.innerHTML = renderHeader() + `
    <div class="main">
      <div class="status-panel" id="status-panel">
        <div class="mac-icon" id="mac-icon"></div>
        <div class="summary glow" id="summary">LOADING...</div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="workflow-list" id="workflow-list">
        <div class="loading glow">FETCHING...</div>
      </div>
    </div>
    <div class="footer">
      <span>POLL: ${POLL_INTERVAL / 1000}s</span>
      <span id="last-updated"></span>
    </div>
  `;
  bindHeaderEvents();
  setInterval(updateClock, 1000);
  updateClock();
  pollWorkflows();
  pollTimer = setInterval(pollWorkflows, POLL_INTERVAL);
}

async function pollWorkflows() {
  try {
    const runs = await client.fetchAllWorkflows(config.repos);
    renderWorkflows(runs);
  } catch (err) {
    console.error('Poll failed:', err);
    const el = document.getElementById('workflow-list');
    if (el) el.innerHTML = `<div class="loading error glow">ERROR: ${err.message}</div>`;
  }
}

function renderWorkflows(runs) {
  const latest = new Map();
  for (const run of runs) {
    const key = `${run.repo}/${run.name}`;
    const existing = latest.get(key);
    if (!existing || new Date(run.updatedAt) > new Date(existing.updatedAt)) {
      latest.set(key, run);
    }
  }

  const workflows = [...latest.values()].sort((a, b) =>
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const statuses = workflows.map(w => normalizeStatus(w));
  const successCount = statuses.filter(s => s === 'success').length;
  const failureCount = statuses.filter(s => s === 'failure').length;
  const runningCount = statuses.filter(s => s === 'running').length;
  const total = workflows.length;
  const allGreen = failureCount === 0 && total > 0;

  const iconEl = document.getElementById('mac-icon');
  if (iconEl) iconEl.innerHTML = allGreen ? happyMacSvg() : sadMacSvg();

  const summaryEl = document.getElementById('summary');
  if (summaryEl) {
    if (total === 0) {
      summaryEl.textContent = 'NO WORKFLOWS';
    } else if (allGreen) {
      summaryEl.textContent = 'ALL SYSTEMS GO';
      summaryEl.style.color = 'var(--green)';
    } else {
      summaryEl.textContent = `${failureCount} FAILURE${failureCount > 1 ? 'S' : ''}`;
      summaryEl.style.color = 'var(--red)';
    }
  }

  const statsEl = document.getElementById('stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-row"><span class="stat-label">PASS</span><span>${successCount}</span></div>
      <div class="stat-row"><span class="stat-label">FAIL</span><span class="error">${failureCount}</span></div>
      <div class="stat-row"><span class="stat-label">RUN</span><span style="color:var(--amber)">${runningCount}</span></div>
      <div class="stat-row"><span class="stat-label">TOTAL</span><span>${total}</span></div>
    `;
  }

  const listEl = document.getElementById('workflow-list');
  if (!listEl) return;

  if (workflows.length === 0) {
    listEl.innerHTML = '<div class="loading">NO WORKFLOW RUNS FOUND</div>';
    return;
  }

  listEl.innerHTML = `<h2>RECENT WORKFLOWS</h2>` + workflows.map(w => {
    const status = normalizeStatus(w);
    return `
      <div class="workflow">
        <div class="workflow-status ${status}"></div>
        <span class="workflow-name">${w.name}</span>
        <span class="workflow-repo">${w.repo}</span>
        <span class="workflow-time">${timeAgo(w.updatedAt)}</span>
      </div>
    `;
  }).join('');

  const updatedEl = document.getElementById('last-updated');
  if (updatedEl) {
    updatedEl.textContent = `UPDATED: ${new Date().toLocaleTimeString('ja-JP')}`;
  }
}

// ==================
// Activity Monitor View
// ==================
function startActivityView() {
  currentTab = 'activity';
  const app = document.getElementById('app');
  app.innerHTML = renderHeader() + `
    <div class="activity" id="activity">
      <div class="gauge-panel" id="cpu-panel">
        <h2>CPU</h2>
        <div class="gauge-value glow" id="cpu-value">--</div>
        <div class="gauge-detail" id="cpu-detail"></div>
        <div class="core-bars" id="core-bars"></div>
      </div>
      <div class="gauge-panel" id="mem-panel">
        <h2>MEMORY</h2>
        <div class="gauge-value glow" id="mem-value">--</div>
        <div class="gauge-detail" id="mem-detail"></div>
        <div class="usage-bar"><div class="usage-bar-fill" id="mem-bar"></div></div>
      </div>
      <div class="gauge-panel" id="disk-panel">
        <h2>DISK</h2>
        <div class="gauge-value glow" id="disk-value">--</div>
        <div class="gauge-detail" id="disk-detail"></div>
        <div class="usage-bar"><div class="usage-bar-fill" id="disk-bar"></div></div>
      </div>
      <div class="gauge-panel" id="net-panel">
        <h2>NETWORK</h2>
        <div class="gauge-detail" id="net-speed" style="font-size:22px;color:var(--green);margin-bottom:4px;"></div>
        <div class="gauge-detail" id="net-total"></div>
        <div class="gauge-detail" id="uptime" style="margin-top:12px;"></div>
      </div>
      <div class="process-panel" id="process-panel">
        <h2>TOP PROCESSES</h2>
        <div class="process-header">
          <span>PID</span><span>NAME</span><span class="proc-cpu">CPU%</span><span class="proc-mem">MEM%</span>
        </div>
        <div id="process-list"></div>
      </div>
    </div>
    <div class="footer">
      <span>POLL: ${METRICS_INTERVAL / 1000}s</span>
      <span id="last-updated"></span>
    </div>
  `;
  bindHeaderEvents();
  setInterval(updateClock, 1000);
  updateClock();
  pollMetrics();
  metricsTimer = setInterval(pollMetrics, METRICS_INTERVAL);
}

async function pollMetrics() {
  try {
    const m = await fetchMetrics();
    renderMetrics(m);
  } catch (err) {
    console.error('Metrics poll failed:', err);
    const el = document.getElementById('cpu-value');
    if (el) el.textContent = 'OFFLINE';
    if (el) el.style.color = 'var(--red)';
  }
}

function barClass(percent) {
  if (percent >= 90) return 'danger';
  if (percent >= 70) return 'warning';
  return '';
}

function coreBarClass(percent) {
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'hot';
  return '';
}

function renderMetrics(m) {
  // CPU
  const cpuVal = document.getElementById('cpu-value');
  if (cpuVal) cpuVal.textContent = `${m.cpu.percent_total.toFixed(1)}%`;

  const cpuDetail = document.getElementById('cpu-detail');
  if (cpuDetail) cpuDetail.textContent = `${m.cpu.cores} CORES | ${m.cpu.freq_mhz ? Math.round(m.cpu.freq_mhz) + ' MHz' : ''}`;

  const coreBars = document.getElementById('core-bars');
  if (coreBars) {
    coreBars.innerHTML = m.cpu.percent_per_core.map(p =>
      `<div class="core-bar ${coreBarClass(p)}" style="height:${Math.max(2, p)}%"></div>`
    ).join('');
  }

  // Memory
  const memVal = document.getElementById('mem-value');
  if (memVal) memVal.textContent = `${m.memory.percent.toFixed(1)}%`;

  const memDetail = document.getElementById('mem-detail');
  if (memDetail) memDetail.textContent = `${m.memory.used_gb} / ${m.memory.total_gb} GB`;

  const memBar = document.getElementById('mem-bar');
  if (memBar) {
    memBar.style.width = `${m.memory.percent}%`;
    memBar.className = `usage-bar-fill ${barClass(m.memory.percent)}`;
  }

  // Disk
  const diskVal = document.getElementById('disk-value');
  if (diskVal) diskVal.textContent = `${m.disk.percent.toFixed(1)}%`;

  const diskDetail = document.getElementById('disk-detail');
  if (diskDetail) diskDetail.textContent = `${m.disk.used_gb} / ${m.disk.total_gb} GB`;

  const diskBar = document.getElementById('disk-bar');
  if (diskBar) {
    diskBar.style.width = `${m.disk.percent}%`;
    diskBar.className = `usage-bar-fill ${barClass(m.disk.percent)}`;
  }

  // Network
  const speed = calcNetSpeed(m);
  const netSpeed = document.getElementById('net-speed');
  if (netSpeed) netSpeed.innerHTML = `UP ${formatBytes(speed.sent)}/s<br>DOWN ${formatBytes(speed.recv)}/s`;

  const netTotal = document.getElementById('net-total');
  if (netTotal) netTotal.textContent = `TOTAL: UP ${formatBytes(m.network.bytes_sent)} / DOWN ${formatBytes(m.network.bytes_recv)}`;

  const uptime = document.getElementById('uptime');
  if (uptime) uptime.textContent = `UPTIME: ${formatUptime(m.uptime_sec)}`;

  // Processes
  const procList = document.getElementById('process-list');
  if (procList) {
    procList.innerHTML = m.top_processes.map(p => `
      <div class="process-row">
        <span>${p.pid}</span>
        <span class="proc-name">${p.name}</span>
        <span class="proc-cpu">${p.cpu_percent.toFixed(1)}</span>
        <span class="proc-mem">${(p.memory_percent || 0).toFixed(1)}</span>
      </div>
    `).join('');
  }

  // Last updated
  const updatedEl = document.getElementById('last-updated');
  if (updatedEl) {
    updatedEl.textContent = `UPDATED: ${new Date().toLocaleTimeString('ja-JP')}`;
  }
}

// ==================
// Claude Code View
// ==================
function startClaudeView() {
  currentTab = 'claude';
  const app = document.getElementById('app');
  app.innerHTML = renderHeader() + `
    <div class="claude-monitor" id="claude-monitor">
      <div class="cost-panel">
        <div>
          <div class="cost-total glow" id="cost-total">$--</div>
          <div class="cost-label">TOTAL COST (ALL TIME)</div>
        </div>
        <div style="text-align:right;">
          <div class="cost-period glow" id="cost-period">$--</div>
          <div class="cost-label">LAST 24H</div>
        </div>
      </div>
      <div class="token-panel">
        <h2>TOKENS</h2>
        <div class="token-row"><span class="token-label">INPUT</span><span class="token-value" id="tok-input">--</span></div>
        <div class="token-row"><span class="token-label">OUTPUT</span><span class="token-value" id="tok-output">--</span></div>
        <div class="token-row"><span class="token-label">CACHE READ</span><span class="token-value" id="tok-cache-read">--</span></div>
        <div class="token-row"><span class="token-label">CACHE WRITE</span><span class="token-value" id="tok-cache-write">--</span></div>
        <div class="token-bar-container" id="token-bar"></div>
      </div>
      <div class="activity-panel">
        <h2>ACTIVITY</h2>
        <div class="counter-grid">
          <div class="counter-item">
            <div class="counter-value glow" id="cnt-sessions">--</div>
            <div class="counter-label">SESSIONS</div>
          </div>
          <div class="counter-item">
            <div class="counter-value glow" id="cnt-edits">--</div>
            <div class="counter-label">EDITS</div>
          </div>
          <div class="counter-item">
            <div class="counter-value glow" id="cnt-loc">--</div>
            <div class="counter-label">LINES</div>
          </div>
          <div class="counter-item">
            <div class="counter-value glow" id="cnt-commits">--</div>
            <div class="counter-label">COMMITS</div>
          </div>
        </div>
      </div>
      <div class="session-panel">
        <span class="model-badge" id="model-badge">--</span>
        <span id="session-info" style="color:var(--green-dim);font-size:16px;">--</span>
      </div>
    </div>
    <div class="footer">
      <span>POLL: ${CLAUDE_INTERVAL / 1000}s</span>
      <span id="last-updated"></span>
    </div>
  `;
  bindHeaderEvents();
  setInterval(updateClock, 1000);
  updateClock();
  pollClaude();
  claudeTimer = setInterval(pollClaude, CLAUDE_INTERVAL);
}

function formatTokenCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

async function pollClaude() {
  try {
    const m = await fetchClaudeCodeMetrics('24h');
    renderClaude(m);
  } catch (err) {
    console.error('Claude metrics poll failed:', err);
    const el = document.getElementById('cost-total');
    if (el) { el.textContent = 'OFFLINE'; el.style.color = 'var(--red)'; }
  }
}

function renderClaude(m) {
  const costTotal = document.getElementById('cost-total');
  if (costTotal) costTotal.textContent = `$${m.cost.total.toFixed(2)}`;

  const costPeriod = document.getElementById('cost-period');
  if (costPeriod) costPeriod.textContent = `$${m.cost.period.toFixed(2)}`;

  const tokInput = document.getElementById('tok-input');
  if (tokInput) tokInput.textContent = formatTokenCount(m.tokens.input);

  const tokOutput = document.getElementById('tok-output');
  if (tokOutput) tokOutput.textContent = formatTokenCount(m.tokens.output);

  const tokCacheRead = document.getElementById('tok-cache-read');
  if (tokCacheRead) tokCacheRead.textContent = formatTokenCount(m.tokens.cacheRead);

  const tokCacheWrite = document.getElementById('tok-cache-write');
  if (tokCacheWrite) tokCacheWrite.textContent = formatTokenCount(m.tokens.cacheCreation);

  // Token bar
  const tokenBar = document.getElementById('token-bar');
  if (tokenBar) {
    const total = m.tokens.input + m.tokens.output + m.tokens.cacheRead + m.tokens.cacheCreation;
    if (total > 0) {
      const pct = (v) => `${(v / total * 100).toFixed(1)}%`;
      tokenBar.innerHTML = `
        <div class="token-bar-segment input" style="width:${pct(m.tokens.input)}" title="Input"></div>
        <div class="token-bar-segment output" style="width:${pct(m.tokens.output)}" title="Output"></div>
        <div class="token-bar-segment cache-read" style="width:${pct(m.tokens.cacheRead)}" title="Cache Read"></div>
        <div class="token-bar-segment cache-creation" style="width:${pct(m.tokens.cacheCreation)}" title="Cache Creation"></div>
      `;
    }
  }

  // Counters
  const cntSessions = document.getElementById('cnt-sessions');
  if (cntSessions) cntSessions.textContent = Math.round(m.sessions);

  const cntEdits = document.getElementById('cnt-edits');
  if (cntEdits) cntEdits.textContent = Math.round(m.edits);

  const cntLoc = document.getElementById('cnt-loc');
  if (cntLoc) cntLoc.textContent = formatTokenCount(m.linesOfCode);

  const cntCommits = document.getElementById('cnt-commits');
  if (cntCommits) cntCommits.textContent = Math.round(m.commits);

  // Session info
  const modelBadge = document.getElementById('model-badge');
  if (modelBadge) modelBadge.textContent = 'OPUS 4.6';

  const sessionInfo = document.getElementById('session-info');
  if (sessionInfo) sessionInfo.textContent = `${Math.round(m.pullRequests)} PRs CREATED`;

  // Last updated
  const updatedEl = document.getElementById('last-updated');
  if (updatedEl) updatedEl.textContent = `UPDATED: ${new Date().toLocaleTimeString('ja-JP')}`;
}

// --- Init ---
if (config?.repos?.length) {
  startDashboard();
} else {
  showConfigScreen();
}
