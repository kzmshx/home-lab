const API_BASE = 'https://api.github.com';

export class GitHubClient {
  constructor(token) {
    this.token = token;
    this.headers = {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async fetchWorkflowRuns(owner, repo) {
    const url = `${API_BASE}/repos/${owner}/${repo}/actions/runs?per_page=10`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return data.workflow_runs.map(run => ({
      id: run.id,
      name: run.name,
      repo: `${owner}/${repo}`,
      status: run.status,
      conclusion: run.conclusion,
      branch: run.head_branch,
      updatedAt: run.updated_at,
      url: run.html_url,
    }));
  }

  async fetchAllWorkflows(repos) {
    const results = await Promise.allSettled(
      repos.map(r => this.fetchWorkflowRuns(r.owner, r.repo))
    );

    return results.flatMap((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      console.error(`Failed to fetch ${repos[i].owner}/${repos[i].repo}:`, result.reason);
      return [];
    });
  }
}

export function normalizeStatus(run) {
  if (run.status === 'in_progress' || run.status === 'queued') return 'running';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'failure') return 'failure';
  return 'pending';
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
