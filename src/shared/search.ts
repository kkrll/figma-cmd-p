import { fuzzyMatch } from './fuzzy.ts';
import type { CrossFileIndex, PageInfo } from './types.ts';

export interface Candidate {
  isCurrent: boolean;
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
  /** Text shown in the list and matched against: `pageName` for the current file, `fileName / pageName` otherwise. */
  searchText: string;
}

export interface RankedResult extends Candidate {
  score: number;
  positions: number[];
}

export function buildCandidates(
  currentPages: PageInfo[],
  currentFileKey: string,
  currentFileName: string,
  index: CrossFileIndex | null
): Candidate[] {
  const candidates: Candidate[] = currentPages.map((p) => ({
    isCurrent: true,
    fileKey: currentFileKey,
    fileName: currentFileName,
    pageId: p.id,
    pageName: p.name,
    searchText: p.name,
  }));

  for (const file of index?.files ?? []) {
    if (isCurrentFile(file.key, file.name, currentFileKey, currentFileName)) continue;
    for (const page of file.pages) {
      candidates.push({
        isCurrent: false,
        fileKey: file.key,
        fileName: file.name,
        pageId: page.id,
        pageName: page.name,
        searchText: `${file.name} / ${page.name}`,
      });
    }
  }
  return candidates;
}

/**
 * figma.fileKey is undefined for unpublished dev plugins, so fall back to
 * comparing file names when no key is available.
 */
export function isCurrentFile(
  fileKey: string,
  fileName: string,
  currentFileKey: string,
  currentFileName: string
): boolean {
  if (currentFileKey && fileKey) return fileKey === currentFileKey;
  return fileName === currentFileName;
}

export function rankResults(candidates: Candidate[], query: string, limit = 50): RankedResult[] {
  const matched: RankedResult[] = [];
  for (const c of candidates) {
    const m = fuzzyMatch(query, c.searchText);
    if (m) matched.push({ ...c, score: m.score, positions: m.positions });
  }
  matched.sort(
    (a, b) =>
      Number(b.isCurrent) - Number(a.isCurrent) ||
      b.score - a.score ||
      a.searchText.localeCompare(b.searchText)
  );
  return matched.slice(0, limit);
}
