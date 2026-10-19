export type WorkspaceFile = { path: string; content: string };
export type Workspace = {
  name: string;
  files: WorkspaceFile[];
  mode: 'empty' | 'directory' | 'upload';
  skipped: number;
  directory?: DirectoryHandle;
};
export interface DirectoryHandle {
  name: string;
  kind: 'directory';
  values(): AsyncIterable<DirectoryHandle | ReadHandle>;
}
interface ReadHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
}
export type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options: { mode: 'read' }) => Promise<DirectoryHandle>;
};

export const LIMITS = { files: 2000, fileBytes: 2 * 1024 * 1024, totalBytes: 32 * 1024 * 1024 };
const ignoredDirectories = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', '.cache', '.venv']);
const binaryExtensions = /\.(png|jpe?g|gif|webp|ico|avif|woff2?|ttf|eot|mp[34]|mov|pdf|zip|gz|tar|lockb|exe|dmg|db|sqlite|wasm|bin)$/i;
export function isIgnoredPath(path: string) {
  return path.split('/').some((part) => ignoredDirectories.has(part)) || binaryExtensions.test(path);
}

type Candidate = { path: string; read: () => Promise<File> };
async function readCandidates(candidates: Candidate[], onProgress?: (count: number) => void) {
  const files: WorkspaceFile[] = [];
  let skipped = Math.max(0, candidates.length - LIMITS.files);
  let bytes = 0;
  // Read sequentially so the total size bound also limits memory during import.
  for (const candidate of candidates.slice(0, LIMITS.files)) {
    try {
      const file = await candidate.read();
      if (file.size > LIMITS.fileBytes || bytes + file.size > LIMITS.totalBytes) { skipped++; continue; }
      const content = await file.text();
      if (content.includes('\0')) { skipped++; continue; }
      bytes += file.size;
      files.push({ path: candidate.path, content });
      onProgress?.(files.length);
    } catch { skipped++; }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}

export async function readDirectory(directory: DirectoryHandle, onProgress?: (count: number) => void): Promise<Workspace> {
  const candidates: Candidate[] = [];
  let skipped = 0;
  async function walk(handle: DirectoryHandle, prefix = '') {
    for await (const entry of handle.values()) {
      const path = prefix + entry.name;
      if (isIgnoredPath(path)) { skipped++; continue; }
      if (entry.kind === 'directory') {
        try { await walk(entry, path + '/'); } catch { skipped++; }
      } else {
        candidates.push({ path, read: () => entry.getFile() });
      }
      // Bound traversal as well as file contents, including oversized repositories.
      if (candidates.length > LIMITS.files) return;
    }
  }
  await walk(directory);
  const result = await readCandidates(candidates, onProgress);
  return { name: directory.name, ...result, skipped: result.skipped + skipped, mode: 'directory', directory };
}

export async function readUpload(input: FileList | File[], onProgress?: (count: number) => void): Promise<Workspace> {
  const selected = Array.from(input);
  const name = selected[0]?.webkitRelativePath.split('/')[0] || '本地项目';
  const candidates: Candidate[] = [];
  let skipped = 0;
  for (const file of selected) {
    const fullPath = file.webkitRelativePath || file.name;
    const path = file.webkitRelativePath ? fullPath.slice(fullPath.indexOf('/') + 1) : fullPath;
    if (isIgnoredPath(path)) { skipped++; continue; }
    candidates.push({ path, read: async () => file });
  }
  const result = await readCandidates(candidates, onProgress);
  return { name, ...result, skipped: result.skipped + skipped, mode: 'upload' };
}

export type TreeNode = { name: string; path: string; children?: TreeNode[] };
export function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    let parent = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      let node = parent.children!.find((entry) => entry.path === path);
      if (!node) {
        node = { name: part, path, ...(index < parts.length - 1 ? { children: [] } : {}) };
        parent.children!.push(node);
      }
      parent = node;
    });
  }
  function sort(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name));
    nodes.forEach((node) => node.children && sort(node.children));
    return nodes;
  }
  return sort(root.children!);
}

export function languageFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'tsx' || extension === 'ts') return 'typescript';
  if (['jsx', 'js', 'mjs', 'cjs'].includes(extension || '')) return 'javascript';
  if (['json', 'jsonc'].includes(extension || '')) return 'json';
  if (['css', 'scss', 'less'].includes(extension || '')) return extension!;
  if (['html', 'htm', 'svg'].includes(extension || '')) return 'html';
  if (extension === 'md' || extension === 'mdx') return 'markdown';
  if (extension === 'yml' || extension === 'yaml') return 'yaml';
  if (extension === 'sh') return 'shell';
  return 'plaintext';
}
