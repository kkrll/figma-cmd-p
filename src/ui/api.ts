import type { FileIndexEntry, PageInfo, ProjectInfo } from '../shared/types.ts';

const BASE = 'https://api.figma.com';
const MAX_ATTEMPTS = 5;
const PAGE_FETCH_CONCURRENCY = 2;
/** Spacing between request starts — file endpoints are expensive against Figma's rate budget. */
const MIN_INTERVAL_MS = 500;
const DEFAULT_RETRY_AFTER_S = 15;

export interface RefreshProgress {
  phase: 'files' | 'pages';
  done: number;
  total: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

// Rate limiting is shared across all concurrent workers: `nextSlot` paces
// request starts, and a 429 sets `pausedUntil` so every worker backs off
// together instead of independently retrying into the same limit.
let nextSlot = 0;
let pausedUntil = 0;

async function acquireSlot(): Promise<void> {
  while (true) {
    const now = Date.now();
    const slot = Math.max(now, nextSlot, pausedUntil);
    nextSlot = slot + MIN_INTERVAL_MS; // claim synchronously — no await between read and write
    if (slot > now) await sleep(slot - now);
    // Re-loop only if a 429 landed while we slept and pushed the pause past our slot.
    if (Date.now() >= pausedUntil) return;
  }
}

async function api<T>(path: string, token: string): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await acquireSlot();
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Figma-Token': token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || DEFAULT_RETRY_AFTER_S;
      pausedUntil = Math.max(pausedUntil, Date.now() + retryAfter * 1000);
      continue;
    }
    if (res.status === 403 || res.status === 401) {
      throw new ApiError(res.status, 'Invalid or expired token (check its scopes include file and project reads)');
    }
    if (!res.ok) {
      throw new ApiError(res.status, `Figma API ${res.status} for ${path}`);
    }
    return (await res.json()) as T;
  }
  throw new Error(`Rate limited (${path}) — try again in a few minutes`);
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
interface DocumentNode {
  children: { id: string; name: string; type: string }[];
}
interface FileResponse {
  document: DocumentNode;
}
interface NodesResponse {
  nodes: Record<string, { document: DocumentNode } | null>;
}

function toPages(doc: DocumentNode): PageInfo[] {
  return doc.children.filter((c) => c.type === 'CANVAS').map((c) => ({ id: c.id, name: c.name }));
}

async function fetchFilePages(token: string, fileKey: string): Promise<PageInfo[]> {
  const key = encodeURIComponent(fileKey);
  // The nodes endpoint scoped to the document root only materializes the page
  // list, so it stays cheap even on files too large for the whole-file
  // endpoint. That endpoint remains as a fallback for any file where the
  // document root isn't addressable as 0:0.
  try {
    const res = await api<NodesResponse>(`/v1/files/${key}/nodes?ids=0:0&depth=1`, token);
    const root = res.nodes['0:0'];
    if (root) return toPages(root.document);
  } catch (_) {
    // Fall through to the whole-file endpoint.
  }
  const res = await api<FileResponse>(`/v1/files/${key}?depth=1`, token);
  return toPages(res.document);
}

export interface IndexResult {
  files: FileIndexEntry[];
  /** Files that could not be indexed, so the caller can surface them. */
  failures: { name: string; reason: string; unsupported?: boolean }[];
}

/** Lists all projects across the given teams — one cheap request per team. */
export async function fetchProjects(token: string, teamIds: string[]): Promise<ProjectInfo[]> {
  const projects: ProjectInfo[] = [];
  for (const teamId of teamIds) {
    const res = await api<TeamProjectsResponse>(
      `/v1/teams/${encodeURIComponent(teamId)}/projects`,
      token
    );
    for (const p of res.projects) projects.push({ id: p.id, name: p.name });
  }
  return projects;
}

/**
 * Indexes the given projects: files -> page names. Runs in the UI iframe
 * because the plugin sandbox has no network access.
 */
export async function fetchIndex(
  token: string,
  projects: ProjectInfo[],
  onProgress: (p: RefreshProgress) => void
): Promise<IndexResult> {
  const files: { key: string; name: string; projectId: string }[] = [];
  const seenKeys = new Set<string>();

  for (let j = 0; j < projects.length; j++) {
    onProgress({ phase: 'files', done: j, total: projects.length });
    const project = projects[j] as ProjectInfo;
    const res = await api<ProjectFilesResponse>(
      `/v1/projects/${encodeURIComponent(project.id)}/files`,
      token
    );
    for (const f of res.files) {
      if (!seenKeys.has(f.key)) {
        seenKeys.add(f.key);
        files.push({ key: f.key, name: f.name, projectId: project.id });
      }
    }
  }

  let pagesDone = 0;
  const failures: IndexResult['failures'] = [];
  const entries = await mapLimit(files, PAGE_FETCH_CONCURRENCY, async (file) => {
    let pages: PageInfo[] = [];
    try {
      pages = await fetchFilePages(token, file.key);
    } catch (err) {
      // A single unreadable file shouldn't kill the refresh, but the caller
      // needs to know it was skipped. A 400 from both endpoints means the
      // file type isn't served by the REST files API at all (Slides, Buzz).
      if (err instanceof ApiError && err.status === 400) {
        failures.push({
          name: file.name,
          reason: 'unsupported file type (Slides/Buzz files are not readable via the REST API)',
          unsupported: true,
        });
      } else {
        failures.push({ name: file.name, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    onProgress({ phase: 'pages', done: ++pagesDone, total: files.length });
    const entry: FileIndexEntry = { key: file.key, name: file.name, projectId: file.projectId, pages };
    return entry;
  });

  return { files: entries.filter((e) => e.pages.length > 0), failures };
}
