import type { FileIndexEntry, PageInfo } from '../shared/types.ts';

const BASE = 'https://api.figma.com';
const MAX_ATTEMPTS = 3;
const PAGE_FETCH_CONCURRENCY = 3;

export interface RefreshProgress {
  phase: 'projects' | 'files' | 'pages';
  done: number;
  total: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const REQUEST_TIMEOUT_MS = 60_000;

async function api<T>(path: string, token: string): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Figma-Token': token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || 5;
      await sleep(retryAfter * 1000);
      continue;
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error('Invalid or expired token (check its scopes include file and project reads)');
    }
    if (!res.ok) {
      throw new Error(`Figma API ${res.status} for ${path}`);
    }
    return (await res.json()) as T;
  }
  throw new Error(`Rate limited by the Figma API (${path}) — try again in a minute`);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface TeamProjectsResponse {
  projects: { id: string; name: string }[];
}
interface ProjectFilesResponse {
  files: { key: string; name: string }[];
}
interface FileResponse {
  document: { children: { id: string; name: string; type: string }[] };
}

export interface IndexResult {
  files: FileIndexEntry[];
  /** Files that could not be indexed, so the caller can surface them. */
  failures: { name: string; reason: string }[];
}

/**
 * Builds the cross-file index: teams -> projects -> files -> page names.
 * Runs in the UI iframe because the plugin sandbox has no network access.
 */
export async function fetchIndex(
  token: string,
  teamIds: string[],
  onProgress: (p: RefreshProgress) => void
): Promise<IndexResult> {
  const files: { key: string; name: string }[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < teamIds.length; i++) {
    onProgress({ phase: 'projects', done: i, total: teamIds.length });
    const { projects } = await api<TeamProjectsResponse>(
      `/v1/teams/${encodeURIComponent(teamIds[i] as string)}/projects`,
      token
    );
    for (let j = 0; j < projects.length; j++) {
      onProgress({ phase: 'files', done: j, total: projects.length });
      const project = projects[j] as { id: string; name: string };
      const res = await api<ProjectFilesResponse>(
        `/v1/projects/${encodeURIComponent(project.id)}/files`,
        token
      );
      for (const f of res.files) {
        if (!seenKeys.has(f.key)) {
          seenKeys.add(f.key);
          files.push(f);
        }
      }
    }
  }

  let pagesDone = 0;
  const failures: IndexResult['failures'] = [];
  const entries = await mapLimit(files, PAGE_FETCH_CONCURRENCY, async (file) => {
    let pages: PageInfo[] = [];
    try {
      const doc = await api<FileResponse>(`/v1/files/${encodeURIComponent(file.key)}?depth=1`, token);
      pages = doc.document.children
        .filter((c) => c.type === 'CANVAS')
        .map((c) => ({ id: c.id, name: c.name }));
    } catch (err) {
      // A single unreadable file (deleted, no access, too large) shouldn't
      // kill the refresh, but the caller needs to know it was skipped.
      failures.push({ name: file.name, reason: err instanceof Error ? err.message : String(err) });
    }
    onProgress({ phase: 'pages', done: ++pagesDone, total: files.length });
    const entry: FileIndexEntry = { key: file.key, name: file.name, pages };
    return entry;
  });

  return { files: entries.filter((e) => e.pages.length > 0), failures };
}
