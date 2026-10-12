import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, Code2, Copy, Eye, Files, FolderOpen, Info, ListTree, LoaderCircle, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, ShieldCheck, Sparkles, TextSearch, X } from 'lucide-react';
import { FileTree } from './components/FileTree';
import { FileIcon } from './components/FileIcon';
import type { Target, ViewerHandle } from './components/CodeViewer';
import { demoWorkspace } from './lib/demo';
import { languageFor, readDirectory, readUpload, type DirectoryPickerWindow, type Workspace } from './lib/workspace';
import { searchFiles, type SearchResult } from './lib/search';

const CodeViewer = lazy(() => import('./components/CodeViewer'));
const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';
const initialPath = 'src/App.tsx';
const languageLabels: Record<string, string> = { typescript: 'TypeScript', javascript: 'JavaScript', markdown: 'Markdown', json: 'JSON', css: 'CSS', html: 'HTML', plaintext: '纯文本', yaml: 'YAML', shell: 'Shell' };

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(demoWorkspace);
  const [workspaceId, setWorkspaceId] = useState(0);
  const [activePath, setActivePath] = useState<string | null>(initialPath);
  const [tabs, setTabs] = useState<string[]>([initialPath, 'src/components/Button.tsx']);
  const [panel, setPanel] = useState<'files' | 'search'>('files');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [fileFilter, setFileFilter] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [collapseKey, setCollapseKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [quickIndex, setQuickIndex] = useState(0);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const activeFile = workspace.files.find(file => file.path === activePath);
  const search = useMemo(() => searchFiles(workspace.files, deferredQuery, { caseSensitive, wholeWord }), [workspace.files, deferredQuery, caseSensitive, wholeWord]);
  const searchGroups = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    search.results.forEach(result => groups.set(result.path, [...(groups.get(result.path) || []), result]));
    return [...groups.entries()];
  }, [search]);
  const quickFiles = useMemo(() => workspace.files.filter(file => file.path.toLowerCase().includes(quickQuery.toLowerCase())).slice(0, 40), [workspace.files, quickQuery]);

  function message(text: string) { setNotice(text); }
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  function openFile(path: string, line = 1, column = 1, length = 0) {
    if (!workspace.files.some(file => file.path === path)) return;
    setActivePath(path);
    setTabs(old => old.includes(path) ? old : [...old, path]);
    setTarget({ path, line, column, length, request: Date.now() });
    if (window.innerWidth < 760) setSidebarVisible(false);
  }
  function closeTab(path: string) {
    const index = tabs.indexOf(path);
    const next = tabs.filter(tab => tab !== path);
    setTabs(next);
    if (activePath === path) {
      const nextPath = next[Math.max(0, index - 1)] || null;
      setActivePath(nextPath); setTarget(null);
    }
  }
  function applyWorkspace(next: Workspace, keepLocation = false) {
    if (!next.files.length) { message('未找到可预览的文本文件。依赖、构建目录和二进制文件会被跳过。'); return; }
    const preferred = keepLocation && next.files.some(file => file.path === activePath) ? activePath! :
      next.files.find(file => /(^|\/)App\.[jt]sx$/.test(file.path))?.path || next.files.find(file => /\.[jt]sx$/.test(file.path))?.path || next.files[0].path;
    setWorkspace(next); setWorkspaceId(value => value + 1);
    setActivePath(preferred); setTabs(keepLocation ? [...new Set([...tabs.filter(path => next.files.some(file => file.path === path)), preferred])] : [preferred]);
    setTarget(null); setCursor({ line: 1, column: 1 }); setFileFilter('');
    message(`已读取 ${next.files.length} 个文件${next.skipped ? `，已跳过 ${next.skipped} 个目录或文件（过滤、大小限制或读取失败）` : ''}`);
  }
  async function openLocal() {
    if (busy) return;
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) { uploadRef.current?.click(); return; }
    try {
      // Call before awaiting anything: browsers require a direct user gesture.
      const directory = await picker.call(window, { mode: 'read' });
      setBusy(true); setProgress(0);
      applyWorkspace(await readDirectory(directory, setProgress));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      message(`打开失败：${error instanceof Error ? error.message : '请检查目录读取权限'}。可以使用「兼容模式导入目录」。`);
    } finally { setBusy(false); }
  }
  async function refresh() {
    if (!workspace.directory) { uploadRef.current?.click(); return; }
    setBusy(true); setProgress(0);
    try { applyWorkspace(await readDirectory(workspace.directory, setProgress), true); }
    catch (error) { message(`重新读取失败：${error instanceof Error ? error.message : '请重新打开项目'}`); }
    finally { setBusy(false); }
  }
  async function copyCode() {
    if (!activeFile) return;
    try { await navigator.clipboard.writeText(activeFile.content); message('已复制当前文件代码'); }
    catch { message('复制失败，可在代码区选择文本后使用 Ctrl / ⌘ + C。'); }
  }
  function activateSearch() { setPanel('search'); setSidebarVisible(true); requestAnimationFrame(() => searchRef.current?.focus()); }
  function showQuickOpen() { setQuickQuery(''); setQuickIndex(0); setQuickOpen(true); }
  useEffect(() => { if (quickOpen) quickRef.current?.focus(); }, [quickOpen]);
  useEffect(() => { setQuickIndex(0); }, [quickQuery]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); viewerRef.current?.find(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); showQuickOpen(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); activateSearch(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') { event.preventDefault(); setSidebarVisible(value => !value); }
      if (event.key === 'Escape') { setQuickOpen(false); setHelpOpen(false); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  const basename = (path: string) => path.split('/').pop();
  const totalLines = activeFile ? activeFile.content.split('\n').length : 0;

  return <div className="ide-shell">
    <div className="workspace-bar"><div className="workspace-breadcrumb"><FolderOpen size={16} /><span>{workspace.name}</span><ChevronRight size={12} /><span className="muted">工作空间</span><span className={`mode-pill ${workspace.mode === 'demo' ? 'demo-pill' : ''}`}>{workspace.mode === 'demo' ? '示例项目' : '本地项目'}</span></div><button className="command-search" aria-label="搜索文件，快速前往" onClick={showQuickOpen}><Search size={14} /><span>搜索文件，快速前往…</span><kbd>{mod} P</kbd></button><div className="workspace-actions"><span className="readonly-label"><Eye size={13} />只读浏览</span><button className="open-project" onClick={openLocal} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin" /> : <FolderOpen size={14} />}{busy ? `读取中 · ${progress}` : '打开本地项目'}</button></div></div>
    <input ref={uploadRef} type="file" multiple {...{ webkitdirectory: '', directory: '' }} className="visually-hidden" aria-label="导入本地目录" onChange={async event => {
      const selected = event.target.files; if (!selected?.length) return;
      setBusy(true); setProgress(0);
      try { applyWorkspace(await readUpload(selected, setProgress)); }
      catch (error) { message(`读取失败：${error instanceof Error ? error.message : '请重试'}`); }
      finally { setBusy(false); if (uploadRef.current) uploadRef.current.value = ''; }
    }} />
    <main className="main-layout">
      <nav className="activity-bar" aria-label="工具栏">
        <div><button className={`activity-button ${panel === 'files' && sidebarVisible ? 'active' : ''}`} title="文件浏览" aria-label="文件浏览" onClick={() => { setPanel('files'); setSidebarVisible(true); }}><Files size={22} /></button><button className={`activity-button ${panel === 'search' && sidebarVisible ? 'active' : ''}`} title={`全项目搜索 (${mod} Shift F)`} aria-label="全项目搜索" onClick={activateSearch}><Search size={22} /></button></div>
        <div><button className="activity-button" title="使用说明" aria-label="关于代码浏览器" onClick={() => setHelpOpen(true)}><BookOpen size={20} /></button><span className="activity-avatar"><Code2 size={15} /></span></div>
      </nav>
      {sidebarVisible && <aside className="sidebar">
        <div className="panel-heading"><h2>{panel === 'files' ? '文件浏览' : '全项目搜索'}</h2><div>{panel === 'files' && <button className="icon-button" title="折叠所有文件夹" aria-label="折叠所有文件夹" onClick={() => setCollapseKey(value => value + 1)}><ListTree size={15} /></button>}<button className="icon-button" title="收起侧栏" aria-label="收起侧栏" onClick={() => setSidebarVisible(false)}><PanelLeftClose size={16} /></button></div></div>
        {panel === 'files' && <><div className="sidebar-filter"><Search size={13} /><input placeholder="查找文件…" aria-label="查找文件" value={fileFilter} onChange={event => setFileFilter(event.target.value)} />{fileFilter && <button aria-label="清空文件筛选" onClick={() => setFileFilter('')}><X size={12} /></button>}</div><div className="tree-project-heading"><ChevronDown size={13} /><span>{workspace.name}</span><span className="file-count">{workspace.files.length}</span></div><FileTree files={workspace.files} activePath={activePath} filter={fileFilter} onOpen={openFile} collapseKey={collapseKey} /></>}
        {panel === 'search' && <><div className="search-box"><div className="search-input"><Search size={14} /><input ref={searchRef} placeholder="搜索项目代码…" aria-label="搜索项目代码" value={query} onChange={event => setQuery(event.target.value)} /><button title="区分大小写" aria-label="区分大小写" aria-pressed={caseSensitive} className={caseSensitive ? 'enabled' : ''} onClick={() => setCaseSensitive(value => !value)}>Aa</button><button title="全字匹配" aria-label="全字匹配" aria-pressed={wholeWord} className={wholeWord ? 'enabled' : ''} onClick={() => setWholeWord(value => !value)}>ab</button></div><div className="search-summary">{query ? `${search.truncated ? '前 ' : ''}${search.results.length} 处结果 · ${searchGroups.length} 个文件${search.truncated ? '（已达上限）' : ''}` : '搜索项目内所有文本文件'}</div></div><div className="search-results">{searchGroups.map(([path, results]) => <div className="result-group" key={path}><div className="result-file"><ChevronDown size={12} /><FileIcon path={path} /><span className="ellipsis" title={path}>{path}</span><span>{results.length}</span></div>{results.map((result, index) => <button className="result-row" key={`${result.line}:${result.column}:${index}`} onClick={() => openFile(result.path, result.line, result.column, result.length)} title={`${path}:${result.line}`}><span className="result-line">{result.line}</span><span className="result-snippet">{result.text.slice(Math.max(0, result.column - 31), result.column - 1)}<mark>{result.text.slice(result.column - 1, result.column - 1 + result.length)}</mark>{result.text.slice(result.column - 1 + result.length, result.column + result.length + 85)}</span></button>)}</div>)}{query && !search.results.length && <div className="search-empty"><TextSearch size={30} /><p>没有找到匹配的代码</p><span>试试其他关键词或调整匹配选项</span></div>}{!query && <div className="search-empty"><TextSearch size={32} /><p>在整个项目中查找</p><span>搜索文本、组件名或 import 路径</span><kbd>{mod} Shift F</kbd></div>}</div></>}
        <div className="sidebar-bottom"><div><ShieldCheck size={15} /><span>文件只在你的浏览器中读取</span></div><span>不会上传，也不会修改本地文件</span><button onClick={() => uploadRef.current?.click()} disabled={busy}>兼容模式导入目录 <ArrowRight size={12} /></button></div>
      </aside>}
      <section className="editor-section" aria-label="代码预览">
        <div className="tab-strip">{!sidebarVisible && <button className="icon-button restore-sidebar" title="展开侧栏" aria-label="展开侧栏" onClick={() => setSidebarVisible(true)}><PanelLeftOpen size={17} /></button>}<div className="tabs">{tabs.map(path => <div className={`file-tab ${path === activePath ? 'active' : ''}`} key={path}><button className="tab-name" title={path} onClick={() => openFile(path)}><FileIcon path={path} /><span>{basename(path)}</span></button><button className="tab-close" title={`关闭 ${basename(path)}`} aria-label={`关闭 ${basename(path)}`} onClick={() => closeTab(path)}><X size={12} /></button></div>)}</div><div className="tab-controls"><button className="icon-button" title="重新读取本地项目" aria-label="重新读取本地项目" disabled={busy || workspace.mode === 'demo'} onClick={refresh}><RefreshCw size={14} className={busy ? 'spin' : ''} /></button><button className="icon-button" title="文件内搜索" aria-label="文件内搜索" onClick={() => viewerRef.current?.find()}><TextSearch size={15} /></button></div></div>
        {activeFile ? <><div className="code-toolbar"><div className="code-breadcrumb">{activeFile.path.split('/').map((part, index, parts) => <span key={index} className={index === parts.length - 1 ? 'current-crumb' : ''}>{index === parts.length - 1 && <FileIcon path={activeFile.path} size={14} />}{part}{index < parts.length - 1 && <ChevronRight size={11} />}</span>)}</div><div className="code-actions"><button className="icon-button" aria-label="复制当前文件" title="复制当前文件" onClick={copyCode}><Copy size={14} /></button><span className="code-readonly"><Eye size={12} />只读</span></div></div>
          {workspace.mode === 'demo' && <div className="demo-banner"><Sparkles size={15} /><span>先探索一下示例项目，或打开本地 React 项目。</span><button onClick={openLocal}>打开项目 <ArrowRight size={13} /></button><button className="banner-help" onClick={() => setHelpOpen(true)} title="查看使用说明" aria-label="查看使用说明"><Info size={14} /></button></div>}
          <div className="editor-surface"><Suspense fallback={<div className="editor-loading"><LoaderCircle size={20} className="spin" />正在加载代码预览…</div>}><CodeViewer key={workspaceId} file={activeFile} target={target} viewerRef={viewerRef} onCursor={(line, column) => setCursor({ line, column })} /></Suspense></div>
          <div className="editor-hint"><span><TextSearch size={12} />代码预览</span><span><kbd>{mod} F</kbd> 文件内搜索</span><span className="hint-right">仅浏览 · 放心探索你的代码</span></div></> : <div className="empty-editor"><span className="empty-brand"><Code2 size={40} /></span><h1>你的代码，一目了然。</h1><p>打开本地项目，从文件树开始探索。</p><button className="primary-button" onClick={openLocal}><FolderOpen size={16} />打开本地项目</button><button className="text-button" onClick={showQuickOpen}>快速打开文件 <kbd>{mod} P</kbd></button></div>}
      </section>
    </main>
    <footer className="statusbar"><div><span className="status-connected"><span />{workspace.mode === 'demo' ? '示例工作空间' : '本地工作空间'}</span><span className="status-file-count"><Files size={12} />{workspace.files.length} 个文件</span></div><div><span>行 {cursor.line}，列 {cursor.column}</span><span>{totalLines} 行</span><span className="status-encoding">UTF-8</span><span>{activeFile ? languageLabels[languageFor(activeFile.path)] || languageFor(activeFile.path) : ''}</span><span className="status-readonly"><Eye size={12} />只读</span></div></footer>
    {notice && <div className="toast" role="status"><Info size={17} /><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {busy && <div className="loading-indicator" role="status"><LoaderCircle size={15} className="spin" />正在读取本地文件 · {progress}</div>}
    {quickOpen && <div className="modal-backdrop" onClick={() => setQuickOpen(false)}><div className="quick-dialog" role="dialog" aria-modal="true" aria-label="快速打开文件" onClick={event => event.stopPropagation()}><div className="quick-input"><Search size={18} /><input ref={quickRef} placeholder="输入文件名称或路径…" aria-label="快速打开文件名称" value={quickQuery} onChange={event => setQuickQuery(event.target.value)} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setQuickIndex(index => Math.min(index + 1, quickFiles.length - 1)); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setQuickIndex(index => Math.max(index - 1, 0)); }
      if (event.key === 'Enter' && quickFiles[quickIndex]) { openFile(quickFiles[quickIndex].path); setQuickOpen(false); }
    }} /><kbd>esc</kbd></div><div className="quick-list">{quickFiles.map((file, index) => <button key={file.path} className={index === quickIndex ? 'selected' : ''} onClick={() => { openFile(file.path); setQuickOpen(false); }}><FileIcon path={file.path} /><span>{basename(file.path)}</span><small className="ellipsis">{file.path}</small>{index === quickIndex && <span>↵</span>}</button>)}{!quickFiles.length && <p className="panel-empty">没有匹配的文件</p>}</div><div className="quick-footer"><span><ArrowUp size={12} /><ArrowDown size={12} />选择</span><span>↵ 打开文件</span><span>{workspace.files.length} 个文件</span></div></div></div>}
    {helpOpen && <div className="modal-backdrop" onClick={() => setHelpOpen(false)}><div className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={event => event.stopPropagation()}><button className="dialog-close icon-button" aria-label="关闭使用说明" onClick={() => setHelpOpen(false)}><X size={18} /></button><span className="help-symbol"><Code2 size={28} /></span><h2 id="help-title">在浏览器里，探索本地代码。</h2><p className="help-intro">一个专注于 React 项目的只读代码浏览器。</p><div className="help-feature"><FolderOpen size={19} /><div><strong>打开本地项目</strong><p>在 localhost / 127.0.0.1 下使用 Chrome 或 Edge，通过目录选择器授权读取。其他浏览器可用兼容模式导入；文件始终留在浏览器内。</p></div></div><div className="help-feature"><Search size={19} /><div><strong>搜索项目代码</strong><p>全文搜索支持大小写与全字匹配，点击结果定位到对应行。顶部搜索框可按文件名称或路径快速打开文件，代码区也支持文件内搜索。</p></div></div><div className="help-feature"><RefreshCw size={19} /><div><strong>按需刷新</strong><p>本地文件变更后，点击右上方刷新重新读取。导入模式需要重新选择目录。自动忽略依赖、构建目录和二进制文件；最多读取 2,000 个文件，单文件 2 MB，总计 32 MB。</p></div></div><div className="shortcut-grid"><span>快速打开文件</span><kbd>{mod} P</kbd><span>全项目搜索</span><kbd>{mod} Shift F</kbd><span>文件内搜索</span><kbd>{mod} F</kbd><span>展开 / 收起文件树</span><kbd>{mod} B</kbd></div><div className="help-security"><ShieldCheck size={15} /><span>仅请求读取权限，不上传、不编辑本地文件。</span></div><button className="primary-button" onClick={() => setHelpOpen(false)}><Check size={15} />开始探索</button></div></div>}
  </div>;
}
