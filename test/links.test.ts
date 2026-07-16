import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPageUrl } from '../src/shared/links.ts';

test('desktop link uses the figma:// protocol', () => {
  assert.equal(
    buildPageUrl('AbC123', '12:34', 'desktop'),
    'figma://file/AbC123?node-id=12%3A34'
  );
});

test('web link uses www.figma.com', () => {
  assert.equal(
    buildPageUrl('AbC123', '12:34', 'web'),
    'https://www.figma.com/design/AbC123?node-id=12%3A34'
  );
});

test('encodes unsafe characters in key and node id', () => {
  const url = buildPageUrl('a/b', '1:2&x=1', 'web');
  assert.ok(!url.includes('a/b'));
  assert.ok(!url.includes('&x'));
});
