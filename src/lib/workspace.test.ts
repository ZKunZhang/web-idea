import { describe, expect, it } from 'vitest';
import { buildTree, isIgnoredPath, LIMITS, readDirectory, readUpload, type DirectoryHandle } from './workspace';
const textFile = (name: string, content: string, relativePath = '') => {
  const file = new File([content], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
};
const directory = (name: string, entries: (DirectoryHandle | { name: string; kind: 'file'; getFile: () => Promise<File> })[]): DirectoryHandle => ({
  name, kind: 'directory', async *values() { for (const entry of entries) yield entry; },
});
const handle = (name: string, content: string) => ({ name, kind: 'file' as const, getFile: async () => textFile(name, content) });
describe('workspace reading', () => {
  it('reads selected directory recursively and skips dependencies and binary content', async () => {
    const root = directory('project', [directory('src', [handle('App.tsx', 'export default () => null;'), handle('unknown', '\0binary')]), directory('node_modules', [handle('lib.js', 'not read')]), handle('logo.png', 'binary')]);
    expect(await readDirectory(root)).toMatchObject({ name: 'project', mode: 'directory', skipped: 3, files: [{ path: 'src/App.tsx', content: 'export default () => null;' }] });
  });
  it('preserves workspace-relative paths for imported folders', async () => {
    const result = await readUpload([textFile('App.tsx', 'a', 'project/src/App.tsx'), textFile('App.tsx', 'b', 'project/tests/App.tsx')]);
    expect(result.files.map(file => file.path)).toEqual(['src/App.tsx', 'tests/App.tsx']);
    expect(result.mode).toBe('upload');
  });
  it('skips oversized and unreadable files without discarding readable files', async () => {
    const root = directory('project', [handle('huge.ts', 'a'.repeat(LIMITS.fileBytes + 1)), { name: 'denied.ts', kind: 'file', getFile: async () => { throw new Error('denied'); } }, handle('ok.ts', 'hello')]);
    expect(await readDirectory(root)).toMatchObject({ skipped: 2, files: [{ path: 'ok.ts', content: 'hello' }] });
  });
  it('sorts directories first and keeps duplicate file names in separate branches', () => {
    expect(buildTree([{ path: 'z.ts', content: '' }, { path: 'src/App.tsx', content: '' }, { path: 'tests/App.tsx', content: '' }]).map(node => node.path)).toEqual(['src', 'tests', 'z.ts']);
    expect(isIgnoredPath('src/building.ts')).toBe(false);
    expect(isIgnoredPath('.git/config')).toBe(true);
  });
});
