import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-scss';
import { languageFor } from './workspace';
export type CodeSegment = { text: string; offset: number; classes: string };
export type CodeLine = { offset: number; segments: CodeSegment[] };

export function highlightLines(path: string, content: string): CodeLine[] {
  const language = /\.tsx$/.test(path) ? 'tsx' : /\.jsx$/.test(path) ? 'jsx' : languageFor(path) === 'shell' ? 'bash' : languageFor(path);
  const grammar = Prism.languages[language];
  // Large files still support search; skip costly tokenization.
  const tokens = grammar && content.length <= 200_000 ? Prism.tokenize(content, grammar) : [content];
  const lines: CodeLine[] = [{ offset: 0, segments: [] }];
  let offset = 0;
  function walk(token: string | Prism.Token | (string | Prism.Token)[], classes = '') {
    if (Array.isArray(token)) { token.forEach(item => walk(item, classes)); return; }
    if (typeof token !== 'string') {
      const aliases = token.alias ? (Array.isArray(token.alias) ? token.alias.join(' ') : token.alias) : '';
      walk(token.content, `${classes} ${token.type} ${aliases}`.trim()); return;
    }
    const parts = token.split('\n');
    parts.forEach((part, index) => {
      if (index) { offset++; lines.push({ offset, segments: [] }); }
      const text = part.replace(/\r$/, '');
      if (text) lines[lines.length - 1].segments.push({ text, offset, classes });
      offset += part.length;
    });
  }
  walk(tokens);
  return lines;
}
