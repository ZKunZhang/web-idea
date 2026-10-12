import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { highlightLines, type CodeSegment } from '../lib/highlight';
import type { WorkspaceFile } from '../lib/workspace';
import { searchFiles } from '../lib/search';
export type ViewerHandle = { find: () => void };
export type Target = { path: string; line: number; column: number; length?: number; request: number };
const LINE_HEIGHT = 23;
const TOP_PADDING = 22;

export default function CodeViewer({ file, target, viewerRef, onCursor }: {
  file: WorkspaceFile; target: Target | null;
  viewerRef: MutableRefObject<ViewerHandle | null>; onCursor: (line: number, column: number) => void;
}) {
  const lines = useMemo(() => highlightLines(file.path, file.content), [file]);
  const viewport = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const scrollPositions = useRef(new Map<string, number>());
  const previousPath = useRef(file.path);
  const previousFindPath = useRef(file.path);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [selectedLine, setSelectedLine] = useState(1);
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [selection, setSelection] = useState<{ offset: number; length: number } | null>(null);
  const matches = useMemo(() => searchFiles([file], findQuery, {}, 1000).results, [file, findQuery]);
  const longestLine = useMemo(() => lines.reduce((longest, line) => Math.max(longest, line.segments.reduce((length, segment) => length + segment.text.length, 0)), 80), [lines]);
  function reveal(line: number, column: number, length = 0) {
    const clamped = Math.min(Math.max(1, line), lines.length);
    const offset = lines[clamped - 1].offset + Math.max(0, column - 1);
    setSelectedLine(clamped); onCursor(clamped, column);
    setSelection(length ? { offset, length } : null);
    if (viewport.current) {
      viewport.current.scrollTop = Math.max(0, TOP_PADDING + (clamped - 1) * LINE_HEIGHT - viewport.current.clientHeight / 3);
      // Horizontal position matters for long-line search results too.
      const left = 80 + (column - 1) * 7.8;
      if (left < viewport.current.scrollLeft + 80 || left > viewport.current.scrollLeft + viewport.current.clientWidth - 60) viewport.current.scrollLeft = Math.max(0, left - 120);
      setScrollTop(viewport.current.scrollTop);
    }
  }
  useEffect(() => {
    viewerRef.current = { find: () => { setFindVisible(true); requestAnimationFrame(() => findInput.current?.focus()); } };
    return () => { viewerRef.current = null; };
  }, [viewerRef]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setHeight(entries[0].contentRect.height));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    if (previousPath.current !== file.path) {
      scrollPositions.current.set(previousPath.current, scrollTop);
      element.scrollTop = scrollPositions.current.get(file.path) || 0;
      element.scrollLeft = 0; setScrollTop(element.scrollTop);
      setSelectedLine(1); onCursor(1, 1); setSelection(null);
      previousPath.current = file.path;
    }
    if (target?.path === file.path) reveal(target.line, target.column, target.length);
  }, [file.path, target]);
  useEffect(() => {
    if (previousFindPath.current !== file.path) {
      previousFindPath.current = file.path;
      setFindVisible(false); setFindQuery(''); setMatchIndex(0);
      return;
    }
    setMatchIndex(0);
    if (matches[0] && findVisible) reveal(matches[0].line, matches[0].column, matches[0].length);
  }, [matches, findVisible, file.path]);
  function nextMatch(direction: number) {
    if (!matches.length) return;
    const index = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(index); reveal(matches[index].line, matches[index].column, matches[index].length);
  }
  const start = Math.max(0, Math.floor((scrollTop - TOP_PADDING) / LINE_HEIGHT) - 15);
  const end = Math.min(lines.length, start + Math.ceil(height / LINE_HEIGHT) + 35);
  function renderSegment(segment: CodeSegment): ReactNode {
    let value: ReactNode = segment.text;
    if (selection && segment.offset < selection.offset + selection.length && segment.offset + segment.text.length > selection.offset) {
      const from = Math.max(0, selection.offset - segment.offset);
      const to = Math.min(segment.text.length, selection.offset + selection.length - segment.offset);
      value = <>{segment.text.slice(0, from)}<mark className="code-match">{segment.text.slice(from, to)}</mark>{segment.text.slice(to)}</>;
    }
    return <span className={`token ${segment.classes}`} data-offset={segment.offset}>{value}</span>;
  }
  return <div className="code-viewer">
    {findVisible && <div className="file-find" role="search" aria-label="文件内搜索"><Search size={14} /><input ref={findInput} aria-label="文件内搜索文本" placeholder="在当前文件中查找…" value={findQuery} onChange={event => setFindQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') nextMatch(event.shiftKey ? -1 : 1); if (event.key === 'Escape') { setFindVisible(false); viewport.current?.focus(); } }} /><span>{matches.length ? `${matchIndex + 1}/${matches.length}${matches.length === 1000 ? '+' : ''}` : '0/0'}</span><button aria-label="上一个匹配" onClick={() => nextMatch(-1)} disabled={!matches.length}><ArrowUp size={14} /></button><button aria-label="下一个匹配" onClick={() => nextMatch(1)} disabled={!matches.length}><ArrowDown size={14} /></button><button aria-label="关闭文件内搜索" onClick={() => setFindVisible(false)}><X size={14} /></button></div>}
    <div className="code-viewport" ref={viewport} tabIndex={0} role="region" aria-label={`${file.path} 只读代码，共 ${lines.length} 行`}
      onScroll={event => { setScrollTop(event.currentTarget.scrollTop); scrollPositions.current.set(file.path, event.currentTarget.scrollTop); }}
      onKeyDown={event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); viewerRef.current?.find(); }
      }}
      onClick={event => {
        const span = (event.target as HTMLElement).closest<HTMLElement>('[data-offset]');
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
        if (!row) return;
        const line = Number(row.dataset.line);
        const offset = span ? Number(span.dataset.offset) : lines[line - 1].offset;
        setSelectedLine(line); onCursor(line, offset - lines[line - 1].offset + 1);
        viewport.current?.focus({ preventScroll: true });
      }}>
      <div className="code-scroll-content" style={{ height: lines.length * LINE_HEIGHT + TOP_PADDING + 24, minWidth: 104 + longestLine * 7.83 }}>
        <div style={{ paddingTop: TOP_PADDING + start * LINE_HEIGHT }}>
          {lines.slice(start, end).map((line, index) => <div key={start + index} className={`code-line ${selectedLine === start + index + 1 ? 'current-line' : ''} ${target?.path === file.path && target.line === start + index + 1 ? 'target-line' : ''}`} data-line={start + index + 1}>
            <span className="line-number" aria-hidden="true">{start + index + 1}</span><code className="line-code">{line.segments.map((segment, i) => <span key={i}>{renderSegment(segment)}</span>)}{line.segments.length === 0 ? '\u200b' : ''}</code>
          </div>)}
        </div>
      </div>
    </div>
    {file.content.length > 200_000 && <div className="large-file-note">大文件使用纯文本预览，搜索仍可用</div>}
  </div>;
}
