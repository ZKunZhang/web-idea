import { describe, expect, it } from 'vitest';
import { searchFiles } from './search';
describe('project search', () => {
  it('uses literal text, exact CRLF positions and distinct relative paths', () => {
    const result = searchFiles([
      { path: 'a/Card.tsx', content: 'first\r\n  <Card />\r\n' },
      { path: 'b/Card.tsx', content: '<Card />' },
    ], '<Card />');
    expect(result.results.map(({ path, line, column }) => ({ path, line, column }))).toEqual([
      { path: 'a/Card.tsx', line: 2, column: 3 }, { path: 'b/Card.tsx', line: 1, column: 1 },
    ]);
  });
  it('supports case and whole-word options including identifiers', () => {
    const files = [{ path: 'a.ts', content: 'Card card Cards _Card Card$ Card' }];
    expect(searchFiles(files, 'Card').results).toHaveLength(6);
    expect(searchFiles(files, 'Card', { caseSensitive: true, wholeWord: true }).results).toHaveLength(2);
    expect(searchFiles(files, 'Card', { wholeWord: true }).results).toHaveLength(3);
  });
  it('preserves source columns after Unicode case-folding characters', () => {
    expect(searchFiles([{ path: 'unicode.ts', content: 'İ const Button = 1' }], 'Button').results[0].column).toBe(9);
  });
  it('caps results and handles empty and special-character queries', () => {
    const files = [{ path: 'a.ts', content: '.* .* .*' }];
    expect(searchFiles(files, '.*', {}, 2)).toMatchObject({ truncated: true, results: [{ column: 1 }, { column: 4 }] });
    expect(searchFiles(files, '')).toEqual({ results: [], truncated: false });
  });
});
