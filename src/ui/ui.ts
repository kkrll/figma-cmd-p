import { fetchIndex, fetchProjects } from './api.ts';
import {
  buildCandidates,
  isCurrentFile,
  rankResults,
  type Candidate,
  type RankedResult,
} from '../shared/search.ts';
import {
  DEFAULT_SETTINGS,
  type CrossFileIndex,
  type MsgToMain,
  type MsgToUI,
  type PageInfo,
  type ProjectInfo,
  type RecentEntry,
  type Settings,
} from '../shared/types.ts';

interface DisplayEntry {
  isCurrent: boolean;
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  label: string;
  /** Length of the `fileName / ` prefix within `label`, 0 for current-file entries. */
  filePrefixLen: number;
  positions: number[];
}

// ---- State ----------------------------------------------------------------

let currentFileKey = '';
let currentFileName = '';
let currentPages: PageInfo[] = [];
let currentPageIds = new Set<string>();
let candidates: Candidate[] = [];
let recents: RecentEntry[] = [];
let index: CrossFileIndex | null = null;
let settings: Settings = { ...DEFAULT_SETTINGS };

let entries: DisplayEntry[] = [];
let selected = 0;
let refreshing = false;

// ---- DOM ------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const searchView = $('search-view');
const settingsView = $('settings-view');
const queryInput = $<HTMLInputElement>('query');
const resultsList = $('results');
const indexStatus = $('index-status');
const tokenInput = $<HTMLInputElement>('token');
const teamIdsInput = $<HTMLInputElement>('team-ids');
const linkStyleSelect = $<HTMLSelectElement>('link-style');
const refreshStatus = $('refresh-status');
const projectsList = $('projects-list');

function post(msg: MsgToMain): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

// ---- Rendering ------------------------------------------------------------

function toDisplay(r: RankedResult): DisplayEntry {
  return {
    isCurrent: r.isCurrent,
    fileKey: r.fileKey,
    fileName: r.fileName,
    pageId: r.pageId,
    pageName: r.pageName,
    label: r.searchText,
    filePrefixLen: r.isCurrent ? 0 : r.fileName.length + 3,
    positions: r.positions,
  };
}

function recentToDisplay(e: RecentEntry): DisplayEntry | null {
  const isCurrent = isCurrentFile(e.fileKey, e.fileName, currentFileKey, currentFileName);
  if (isCurrent && !currentPageIds.has(e.pageId)) return null; // page was deleted
  if (!isCurrent && !e.fileKey) return null; // can't deep-link without a key
  return {
    isCurrent,
    fileKey: e.fileKey,
    fileName: e.fileName,
    pageId: e.pageId,
    pageName: e.pageName,
    label: isCurrent ? e.pageName : `${e.fileName} / ${e.pageName}`,
    filePrefixLen: isCurrent ? 0 : e.fileName.length + 3,
    positions: [],
  };
}

function computeEntries(): void {
  const query = queryInput.value.trim();
  entries = query
    ? rankResults(candidates, query).map(toDisplay)
    : recents.map(recentToDisplay).filter((e): e is DisplayEntry => e !== null);
  selected = 0;
}

function renderLabel(entry: DisplayEntry): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'label';
  const matched = new Set(entry.positions);
  let i = 0;
  while (i < entry.label.length) {
    const inFilePart = i < entry.filePrefixLen;
    const isMatch = matched.has(i);
    let j = i + 1;
    while (j < entry.label.length && matched.has(j) === isMatch && (j < entry.filePrefixLen) === inFilePart) {
      j++;
    }
    const text = entry.label.slice(i, j);
    let node: HTMLElement | Text = document.createTextNode(text);
    if (isMatch) {
      const b = document.createElement('b');
      b.textContent = text;
      node = b;
    }
    if (inFilePart) {
      const wrap = document.createElement('span');
      wrap.className = 'file-part';
      wrap.appendChild(node);
      node = wrap;
    }
    span.appendChild(node);
    i = j;
  }
  return span;
}

function renderResults(): void {
  resultsList.textContent = '';
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.style.cursor = 'default';
    li.textContent = queryInput.value.trim()
      ? 'No matching pages'
      : 'No recent jumps yet — start typing to search pages';
    resultsList.appendChild(li);
    return;
  }
  entries.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === selected) li.className = 'selected';
    li.appendChild(renderLabel(entry));
    if (!queryInput.value.trim() && !entry.isCurrent) {
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = 'recent';
      li.appendChild(meta);
    }
    li.addEventListener('click', () => activate(entry));
    li.addEventListener('mousemove', () => {
      if (selected !== i) {
        selected = i;
        renderResults();
      }
    });
    resultsList.appendChild(li);
  });
  resultsList.children[selected]?.scrollIntoView({ block: 'nearest' });
}

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function renderIndexStatus(): void {
  if (!index) {
    indexStatus.textContent = 'No cross-file index — set up in settings (⌘,)';
    return;
  }
  const pages = index.files.reduce((n, f) => n + f.pages.length, 0);
  indexStatus.textContent = `Index: ${index.files.length} files, ${pages} pages · ${timeAgo(index.fetchedAt)}`;
  indexStatus.classList.toggle('stale', Date.now() - index.fetchedAt > STALE_AFTER_MS);
}

function refresh(): void {
  computeEntries();
  renderResults();
}

// ---- Actions --------------------------------------------------------------

function activate(entry: DisplayEntry): void {
  if (entry.isCurrent) {
    post({ type: 'jump-local', pageId: entry.pageId, pageName: entry.pageName });
  } else {
    post({
      type: 'open-external',
      fileKey: entry.fileKey,
      fileName: entry.fileName,
      pageId: entry.pageId,
      pageName: entry.pageName,
    });
  }
}

const SEARCH_SIZE = { width: 520, height: 460 };
const SETTINGS_SIZE = { width: 520, height: 640 };

function showSettings(): void {
  post({ type: 'resize', ...SETTINGS_SIZE });
  searchView.hidden = true;
  settingsView.hidden = false;
  tokenInput.value = settings.token;
  teamIdsInput.value = settings.teamIds;
  linkStyleSelect.value = settings.linkStyle;
  renderProjects();
  tokenInput.focus();
}

function showSearch(): void {
  post({ type: 'resize', ...SEARCH_SIZE });
  settingsView.hidden = true;
  searchView.hidden = false;
  queryInput.focus();
  queryInput.select();
  renderIndexStatus();
  refresh();
}

function readSettingsForm(): Settings {
  return {
    ...settings,
    token: tokenInput.value.trim(),
    teamIds: teamIdsInput.value.trim(),
    linkStyle: linkStyleSelect.value === 'web' ? 'web' : 'desktop',
  };
}

function saveSettings(): void {
  settings = readSettingsForm();
  post({ type: 'save-settings', settings });
}

function parseTeamIds(): string[] {
  return settings.teamIds
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function validateAuth(): boolean {
  if (!settings.token || parseTeamIds().length === 0) {
    refreshStatus.textContent = 'Enter a token and at least one team ID first';
    refreshStatus.classList.add('error');
    return false;
  }
  return true;
}

function showRefreshError(err: unknown): void {
  refreshStatus.textContent = err instanceof Error ? err.message : String(err);
  refreshStatus.classList.add('error');
}

function renderProjects(): void {
  projectsList.textContent = '';
  if (settings.knownProjects.length === 0) {
    const span = document.createElement('span');
    span.className = 'hint';
    span.textContent = 'Load projects to choose which ones get indexed.';
    projectsList.appendChild(span);
    return;
  }
  const excluded = new Set(settings.excludedProjectIds);
  for (const project of settings.knownProjects) {
    const row = document.createElement('div');
    row.className = 'project-row';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !excluded.has(project.id);
    checkbox.addEventListener('change', () => {
      const set = new Set(settings.excludedProjectIds);
      if (checkbox.checked) set.delete(project.id);
      else set.add(project.id);
      settings.excludedProjectIds = [...set];
      post({ type: 'save-settings', settings });
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(project.name));
    row.appendChild(label);

    const reindexBtn = document.createElement('button');
    reindexBtn.className = 'reindex';
    reindexBtn.textContent = '↻';
    reindexBtn.title = `Re-index only "${project.name}"`;
    reindexBtn.addEventListener('click', () => {
      if (refreshing) return;
      saveSettings();
      if (validateAuth()) void runIndexFetch([project], 'merge');
    });
    row.appendChild(reindexBtn);

    projectsList.appendChild(row);
  }
}

async function loadProjects(): Promise<boolean> {
  saveSettings();
  if (!validateAuth()) return false;
  refreshStatus.classList.remove('error');
  refreshStatus.textContent = 'Loading projects…';
  try {
    const projects = await fetchProjects(settings.token, parseTeamIds());
    settings.knownProjects = projects;
    const ids = new Set(projects.map((p) => p.id));
    settings.excludedProjectIds = settings.excludedProjectIds.filter((id) => ids.has(id));
    post({ type: 'save-settings', settings });
    renderProjects();
    refreshStatus.textContent = `Found ${projects.length} projects — untick any to skip, then refresh`;
    return true;
  } catch (err) {
    showRefreshError(err);
    return false;
  }
}

/**
 * Fetches the given projects and updates the index. `replace` swaps the whole
 * index (a full refresh, dropping unticked projects); `merge` re-indexes just
 * the given projects and keeps everything else as-is.
 */
async function runIndexFetch(projects: ProjectInfo[], mode: 'replace' | 'merge'): Promise<void> {
  refreshing = true;
  refreshStatus.classList.remove('error');
  refreshStatus.textContent = 'Listing files…';
  try {
    const { files, failures } = await fetchIndex(settings.token, projects, (p) => {
      if (p.phase === 'files') refreshStatus.textContent = `Listing files… (project ${p.done + 1}/${p.total})`;
      else refreshStatus.textContent = `Reading page names… ${p.done}/${p.total} files`;
    });

    let merged = files;
    if (mode === 'merge' && index) {
      const refreshedProjects = new Set(projects.map((p) => p.id));
      const newKeys = new Set(files.map((f) => f.key));
      merged = index.files
        .filter((f) => !(f.projectId && refreshedProjects.has(f.projectId)) && !newKeys.has(f.key))
        .concat(files);
    }
    index = { fetchedAt: Date.now(), files: merged };
    post({ type: 'save-index', index });
    candidates = buildCandidates(currentPages, currentFileKey, currentFileName, index);

    const pages = files.reduce((n, f) => n + f.pages.length, 0);
    let status = `Done — indexed ${files.length} files, ${pages} pages`;
    if (mode === 'merge') status += ` · index total: ${merged.length} files`;
    if (failures.length > 0) {
      const names = failures.map((f) => f.name);
      status += ` · ${failures.length} failed: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;
      console.warn('Files that failed to index:', failures);
    }
    refreshStatus.textContent = status;
  } catch (err) {
    showRefreshError(err);
  } finally {
    refreshing = false;
  }
}

async function refreshIndex(): Promise<void> {
  if (refreshing) return;
  saveSettings();
  if (!validateAuth()) return;
  if (settings.knownProjects.length === 0 && !(await loadProjects())) return;
  const selected = settings.knownProjects.filter((p) => !settings.excludedProjectIds.includes(p.id));
  if (selected.length === 0) {
    refreshStatus.textContent = 'All projects are unticked — nothing to index';
    refreshStatus.classList.add('error');
    return;
  }
  await runIndexFetch(selected, 'replace');
}

// ---- Events ---------------------------------------------------------------

queryInput.addEventListener('input', refresh);

document.addEventListener('keydown', (e) => {
  const inSettings = !settingsView.hidden;

  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    e.preventDefault();
    inSettings ? showSearch() : showSettings();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (inSettings) showSearch();
    else post({ type: 'close' });
    return;
  }
  if (inSettings) return;

  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
    e.preventDefault();
    if (entries.length) {
      selected = (selected + 1) % entries.length;
      renderResults();
    }
  } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
    e.preventDefault();
    if (entries.length) {
      selected = (selected - 1 + entries.length) % entries.length;
      renderResults();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const entry = entries[selected];
    if (entry) activate(entry);
  }
});

$('settings-btn').addEventListener('click', showSettings);
$('back-btn').addEventListener('click', showSearch);
$('save-btn').addEventListener('click', () => {
  saveSettings();
  refreshStatus.classList.remove('error');
  refreshStatus.textContent = 'Saved';
});
$('refresh-btn').addEventListener('click', () => {
  void refreshIndex();
});
$('load-projects-btn').addEventListener('click', () => {
  if (!refreshing) void loadProjects();
});

window.onmessage = (event: MessageEvent) => {
  const msg = event.data?.pluginMessage as MsgToUI | undefined;
  if (!msg) return;
  if (msg.type === 'init') {
    currentFileKey = msg.currentFileKey;
    currentFileName = msg.currentFileName;
    currentPages = msg.currentPages;
    currentPageIds = new Set(currentPages.map((p) => p.id));
    recents = msg.recents;
    index = msg.index;
    settings = { ...DEFAULT_SETTINGS, ...msg.settings };
    candidates = buildCandidates(currentPages, currentFileKey, currentFileName, index);
    renderIndexStatus();
    refresh();
    queryInput.focus();
  }
};

queryInput.focus();
post({ type: 'ui-ready' });
