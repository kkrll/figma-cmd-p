import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fuzzyMatch } from '../src/shared/fuzzy.ts';

test('empty query matches everything with zero score', () => {
  assert.deepEqual(fuzzyMatch('', 'anything'), { score: 0, positions: [] });
});

test('matches a subsequence', () => {
  const r = fuzzyMatch('hme', 'Home');
  assert.ok(r);
  assert.deepEqual(r.positions, [0, 2, 3]);
});

test('rejects a non-subsequence', () => {
  assert.equal(fuzzyMatch('xyz', 'Home'), null);
  assert.equal(fuzzyMatch('homee', 'Home'), null);
});

test('is case-insensitive', () => {
  assert.ok(fuzzyMatch('HOME', 'home'));
  assert.ok(fuzzyMatch('home', 'HOME'));
});

test('query longer than text never matches', () => {
  assert.equal(fuzzyMatch('longer than', 'short'), null);
});

test('consecutive characters beat scattered ones', () => {
  const consecutive = fuzzyMatch('abc', 'abcdef');
  const scattered = fuzzyMatch('abc', 'a1b2c3');
  assert.ok(consecutive && scattered);
  assert.ok(consecutive.score > scattered.score);
});

test('word-boundary matches beat mid-word matches', () => {
  const boundary = fuzzyMatch('np', 'New Page');
  const midWord = fuzzyMatch('np', 'input');
  assert.ok(boundary && midWord);
  assert.ok(boundary.score > midWord.score);
});

test('start-of-text match beats a later match', () => {
  const early = fuzzyMatch('home', 'Homepage');
  const late = fuzzyMatch('home', 'Take me home');
  assert.ok(early && late);
  assert.ok(early.score > late.score);
});

test('finds a better alignment than pure greedy', () => {
  // Greedy from the first 'p' in "Prototype" would strand the query;
  // trying later start positions still finds "Page".
  const r = fuzzyMatch('page', 'Prototype Page');
  assert.ok(r);
  assert.deepEqual(r.positions, [10, 11, 12, 13]);
});

test('positions index into the original text', () => {
  const r = fuzzyMatch('dsys', 'Design System');
  assert.ok(r);
  for (const [i, pos] of r.positions.entries()) {
    assert.equal('Design System'[pos]!.toLowerCase(), 'dsys'[i]);
  }
});
