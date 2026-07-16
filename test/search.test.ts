import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCandidates, isCurrentFile, rankResults } from '../src/shared/search.ts';
import type { CrossFileIndex } from '../src/shared/types.ts';

const index: CrossFileIndex = {
  fetchedAt: 0,
  files: [
    {
      key: 'other1',
      name: 'Design System',
      pages: [
        { id: '1:1', name: 'Buttons' },
        { id: '1:2', name: 'Colors' },
      ],
    },
    {
      key: 'cur',
      name: 'My App',
      pages: [{ id: '0:1', name: 'Cover' }],
    },
  ],
};

const currentPages = [
  { id: '0:1', name: 'Cover' },
  { id: '0:2', name: 'Checkout Flow' },
];

test('buildCandidates excludes the current file from the index', () => {
  const cands = buildCandidates(currentPages, 'cur', 'My App', index);
  assert.equal(cands.filter((c) => c.isCurrent).length, 2);
  assert.equal(cands.filter((c) => !c.isCurrent).length, 2);
  assert.ok(cands.every((c) => c.isCurrent || c.fileKey === 'other1'));
});

test('cross-file candidates search against "fileName / pageName"', () => {
  const cands = buildCandidates(currentPages, 'cur', 'My App', index);
  const cross = cands.find((c) => c.pageName === 'Buttons');
  assert.equal(cross?.searchText, 'Design System / Buttons');
});

test('current-file pages rank above cross-file results regardless of score', () => {
  const cands = buildCandidates(currentPages, 'cur', 'My App', index);
  // "co" matches "Colors" (cross, strong) and "Checkout Flow" / "Cover" (current).
  const results = rankResults(cands, 'co');
  assert.ok(results.length >= 3);
  const firstCross = results.findIndex((r) => !r.isCurrent);
  const lastCurrent = results.map((r) => r.isCurrent).lastIndexOf(true);
  assert.ok(firstCross === -1 || lastCurrent < firstCross);
});

test('rankResults filters non-matches and respects the limit', () => {
  const cands = buildCandidates(currentPages, 'cur', 'My App', index);
  assert.equal(rankResults(cands, 'zzz').length, 0);
  assert.equal(rankResults(cands, 'o', 2).length, 2);
});

test('isCurrentFile prefers key comparison, falls back to name', () => {
  assert.ok(isCurrentFile('k1', 'A', 'k1', 'B'));
  assert.ok(!isCurrentFile('k1', 'A', 'k2', 'A'));
  assert.ok(isCurrentFile('', 'A', '', 'A'));
  assert.ok(isCurrentFile('k1', 'A', '', 'A'));
});
