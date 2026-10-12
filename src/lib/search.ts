import type { WorkspaceFile } from './workspace';
export type SearchResult = { path: string; line: number; column: number; text: string; length: number };
export type SearchOptions = { caseSensitive?: boolean; wholeWord?: boolean };
export function searchFiles(files: WorkspaceFile[], query: string, options: SearchOptions = {}, limit = 500) {
  const results: SearchResult[] = [];
  if (!query) return { results, truncated: false };
  // Match against original text: Unicode case conversion can change string length.
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(literal, options.caseSensitive ? 'gu' : 'giu');
  const wordCharacter = /[\p{L}\p{N}_$]/u;
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      for (const match of line.matchAll(expression)) {
        const column = match.index!;
        const before = column ? line.slice(Math.max(0, column - 2), column).match(/.$/u)?.[0] || '' : '';
        const afterCodePoint = line.codePointAt(column + match[0].length);
        const after = afterCodePoint === undefined ? '' : String.fromCodePoint(afterCodePoint);
        if (options.wholeWord && (wordCharacter.test(before) || wordCharacter.test(after))) continue;
        if (results.length === limit) return { results, truncated: true };
        results.push({ path: file.path, line: index + 1, column: column + 1, text: line, length: match[0].length });
      }
    }
  }
  return { results, truncated: false };
}
