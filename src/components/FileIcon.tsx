import { FileCode2, FileJson2, FileText, Hash, Braces } from 'lucide-react';
export function FileIcon({ path, size = 16 }: { path: string; size?: number }) {
  if (/\.[jt]sx$/.test(path)) return <span className="react-file-icon" style={{ fontSize: size + 2 }} aria-hidden="true">⚛</span>;
  if (/\.ts$/.test(path)) return <span className="type-file-icon" style={{ fontSize: size - 5 }} aria-hidden="true">TS</span>;
  if (/\.json$/.test(path)) return <FileJson2 size={size} className="icon-json" />;
  if (/\.(css|scss)$/.test(path)) return <Hash size={size} className="icon-css" />;
  if (/\.[cm]?js$/.test(path)) return <Braces size={size} className="icon-js" />;
  if (/\.(md|txt)$/.test(path)) return <FileText size={size} className="icon-text" />;
  return <FileCode2 size={size} className="icon-muted" />;
}
