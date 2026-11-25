import test from 'node:test';
import assert from 'node:assert/strict';
import { slugifyTitle, safeHref } from './helpers.js';
test('slugs are readable and URL-safe', () => {
  assert.equal(slugifyTitle('My AI & Backend Project!'), 'my-ai-backend-project');
  assert.equal(slugifyTitle(' Café 2026 '), 'cafe-2026');
});
test('unsafe links are rejected', () => {
  assert.equal(safeHref('javascript:alert(1)'), '');
  assert.equal(safeHref('//evil.com'), '');
  assert.equal(safeHref('/uploads/photo.webp'), '/uploads/photo.webp');
  assert.equal(safeHref('https://example.com/'), 'https://example.com/');
});
