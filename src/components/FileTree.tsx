import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { buildTree, type TreeNode, type WorkspaceFile } from '../lib/workspace';
import { FileIcon } from './FileIcon';

export function FileTree({ files, activePath, filter, onOpen, collapseKey }: {
  files: WorkspaceFile[]; activePath: string | null; filter: string; onOpen: (path: string) => void; collapseKey: number;
}) {
  const [expanded, setExpanded] = useState(new Set(['src', 'src/components']));
  const tree = useMemo(() => buildTree(files.filter(file => file.path.toLowerCase().includes(filter.toLowerCase()))), [files, filter]);
  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split('/');
    setExpanded(old => {
      const next = new Set(old);
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
      return next;
    });
  }, [activePath, files]);
  useEffect(() => { if (collapseKey) setExpanded(new Set()); }, [collapseKey]);
  function render(nodes: TreeNode[], depth = 0) {
    return nodes.map(node => {
      const open = !!filter || expanded.has(node.path);
      return <div key={node.path}>
        <button className={`tree-row ${activePath === node.path ? 'selected' : ''}`} style={{ paddingLeft: 12 + depth * 15 }}
          title={node.path} aria-expanded={node.children ? open : undefined} aria-current={activePath === node.path ? 'page' : undefined}
          onClick={() => node.children ? setExpanded(old => {
            const next = new Set(old); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next;
          }) : onOpen(node.path)}>
          {node.children ? <>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}{open ? <FolderOpen size={16} className="folder-icon" /> : <Folder size={16} className="folder-icon" />}</> : <><span className="tree-indent" /><FileIcon path={node.path} /></>}
          <span className="ellipsis">{node.name}</span>
        </button>
        {node.children && open && render(node.children, depth + 1)}
      </div>;
    });
  }
  return <div className="file-tree" aria-label="项目文件树">{tree.length ? render(tree) : <p className="panel-empty">没有匹配的文件</p>}</div>;
}
