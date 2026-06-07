/**
 * Jarvis GitHub read-only awareness client.
 *
 * Uses the Replit GitHub connector (integration: github) via the
 * @replit/connectors-sdk proxy. The SDK handles identity, OAuth token refresh,
 * and auth headers automatically — never cache the client or its tokens.
 *
 * READ-ONLY: every call here is a GET. Jarvis NEVER writes to a remote repo.
 * All helpers fail soft (return null / throw a tagged error) so a transient
 * GitHub outage degrades to a dash in the UI, never a crash.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

export interface RepoAwareness {
  defaultBranch: string | null;
  description: string | null;
  url: string | null;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitAuthor: string | null;
  lastCommitAt: Date | null;
  openPrCount: number | null;
  lastWorkflowStatus: string | null;
  lastWorkflowConclusion: string | null;
}

/** Parse an "owner/repo" full name; tolerates a leading host or trailing .git. */
export function parseRepoFullName(
  fullName: string,
): { owner: string; repo: string } | null {
  const cleaned = fullName
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, "")
    .replace(/\.git$/i, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[parts.length - 2];
  const repo = parts[parts.length - 1];
  if (!owner || !repo) return null;
  return { owner, repo };
}

async function ghGet(path: string): Promise<unknown> {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("github", path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`github_${response.status}`);
  }
  return response.json();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Fetch read-only awareness for a single repository. Throws only if the core
 * repository lookup fails (repo missing / not accessible); the secondary
 * signals (PR count, workflow run) fail soft to null so partial data still
 * caches.
 */
export async function fetchRepoAwareness(
  owner: string,
  repo: string,
): Promise<RepoAwareness> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  // Core repo metadata — authoritative; failure here aborts the sync.
  const repoData = asRecord(await ghGet(base));
  const defaultBranch = asString(repoData?.default_branch);
  const description = asString(repoData?.description);
  const url = asString(repoData?.html_url);

  const result: RepoAwareness = {
    defaultBranch,
    description,
    url,
    lastCommitSha: null,
    lastCommitMessage: null,
    lastCommitAuthor: null,
    lastCommitAt: null,
    openPrCount: null,
    lastWorkflowStatus: null,
    lastWorkflowConclusion: null,
  };

  // Last commit (HEAD of default branch). Soft-fail.
  try {
    const branchQuery = defaultBranch
      ? `&sha=${encodeURIComponent(defaultBranch)}`
      : "";
    const commits = await ghGet(`${base}/commits?per_page=1${branchQuery}`);
    const first = Array.isArray(commits) ? asRecord(commits[0]) : null;
    if (first) {
      result.lastCommitSha = asString(first.sha);
      const commit = asRecord(first.commit);
      result.lastCommitMessage = asString(commit?.message);
      const author = asRecord(commit?.author);
      result.lastCommitAuthor = asString(author?.name);
      const dateStr = asString(author?.date);
      const parsed = dateStr ? new Date(dateStr) : null;
      result.lastCommitAt =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
  } catch {
    // leave commit fields null
  }

  // Open PR count (capped at one page = 100). Soft-fail.
  try {
    const pulls = await ghGet(`${base}/pulls?state=open&per_page=100`);
    result.openPrCount = Array.isArray(pulls) ? pulls.length : null;
  } catch {
    result.openPrCount = null;
  }

  // Latest Actions workflow run. Soft-fail.
  try {
    const runs = asRecord(await ghGet(`${base}/actions/runs?per_page=1`));
    const list = runs?.workflow_runs;
    const latest = Array.isArray(list) ? asRecord(list[0]) : null;
    if (latest) {
      result.lastWorkflowStatus = asString(latest.status);
      result.lastWorkflowConclusion = asString(latest.conclusion);
    }
  } catch {
    // leave workflow fields null
  }

  return result;
}
