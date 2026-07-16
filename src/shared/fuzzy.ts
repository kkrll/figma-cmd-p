export interface FuzzyResult {
  score: number;
  /** Indices into the original text of the matched characters. */
  positions: number[];
}

const SEPARATORS = new Set([' ', '/', '-', '_', '.', ':', '(', '[']);

const CONSECUTIVE_BONUS = 4;
const START_BONUS = 8;
const BOUNDARY_BONUS = 6;
const MAX_GAP_PENALTY = 3;

/**
 * Case-insensitive subsequence match. Returns null when `query` is not a
 * subsequence of `text`; otherwise a score (higher is better) with bonuses
 * for consecutive characters and word-boundary hits, and mild penalties for
 * gaps and late starts.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, positions: [] };
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length > t.length) return null;

  // Greedy matching from a fixed start can miss better alignments, so try
  // every occurrence of the first query character and keep the best score.
  let best: FuzzyResult | null = null;
  const first = q[0] as string;
  for (let start = t.indexOf(first); start !== -1; start = t.indexOf(first, start + 1)) {
    const result = matchFrom(q, t, start);
    if (result && (!best || result.score > best.score)) best = result;
    if (t.length - start < q.length) break;
  }
  return best;
}

function matchFrom(q: string, t: string, start: number): FuzzyResult | null {
  const positions: number[] = [];
  let score = 0;
  let searchFrom = start;
  let prev = -2;

  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi] as string, searchFrom);
    if (idx === -1) return null;
    positions.push(idx);
    score += 1;
    if (idx === prev + 1) score += CONSECUTIVE_BONUS;
    if (idx === 0) score += START_BONUS;
    else if (SEPARATORS.has(t[idx - 1] as string)) score += BOUNDARY_BONUS;
    score -= Math.min(idx - searchFrom, MAX_GAP_PENALTY);
    prev = idx;
    searchFrom = idx + 1;
  }

  // Prefer matches that begin earlier and leave less unmatched text.
  score -= start / 10;
  score -= (t.length - q.length) / 100;
  return { score, positions };
}
