import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import type { WorkspaceFile } from './workspace';

export type SymbolKind = 'component' | 'hook' | 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'module';
export type Definition = {
  id: string;
  name: string;
  path: string;
  line: number;
  column: number;
  offset: number;
  length: number;
  kind: SymbolKind;
  exported: boolean;
  defaultExport: boolean;
};
export type NavigationTarget = Omit<Definition, 'exported' | 'defaultExport'>;
export type NavigationLink = {
  offset: number;
  length: number;
  name: string;
  role: 'import' | 'usage';
  target: NavigationTarget;
};
export type ImportBinding = {
  localName: string;
  importedName: string;
  source: string;
  resolvedPath: string | null;
  line: number;
  column: number;
  offset: number;
  length: number;
  kind: 'named' | 'default' | 'namespace';
  typeOnly: boolean;
  sourceOffset: number;
  sourceLength: number;
};
export type Occurrence = { name: string; offset: number; line: number; column: number; length: number };
export type ReferenceRole = 'definition' | 'import' | 'usage';
export type ReferenceTarget = NavigationTarget & { role: ReferenceRole };
export type ProjectIndex = {
  files: WorkspaceFile[];
  fileByPath: Map<string, WorkspaceFile>;
  aliases: AliasRule[];
  definitions: Definition[];
  definitionsByPath: Map<string, Definition[]>;
  definitionsByName: Map<string, Definition[]>;
  importsByPath: Map<string, ImportBinding[]>;
  exportedNames: Map<string, Map<string, Definition>>;
  defaultExports: Map<string, Definition>;
  defaultAliases: Map<string, { name: string; offset: number }>;
  reexports: Map<string, Reexport[]>;
  occurrences: Map<string, Occurrence[]>;
};

type AliasRule = { prefix: string; suffix: string; targetPrefix: string; targetSuffix: string; base: string };
type Reexport = { importedName: string | null; exportedName: string; resolvedPath: string | null };

const codeExtensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];
const identifierPattern = /[A-Za-z_$][\w$]*/g;
const ignoredTokenTypes = new Set([
  'comment', 'string', 'regex', 'attr-value', 'attr-name', 'plain-text', 'keyword', 'builtin',
  'boolean', 'number', 'operator', 'punctuation', 'doctype', 'prolog', 'cdata', 'url', 'entity',
]);

export function buildProjectIndex(files: WorkspaceFile[]): ProjectIndex {
  const fileByPath = new Map(files.map(file => [file.path, file]));
  const index: ProjectIndex = {
    files,
    fileByPath,
    aliases: readAliasRules(files),
    definitions: [],
    definitionsByPath: new Map(),
    definitionsByName: new Map(),
    importsByPath: new Map(),
    exportedNames: new Map(),
    defaultExports: new Map(),
    defaultAliases: new Map(),
    reexports: new Map(),
    occurrences: new Map(),
  };

  for (const file of files) {
    const definitions = collectDefinitions(file);
    index.definitionsByPath.set(file.path, definitions);
    for (const definition of definitions) {
      index.definitions.push(definition);
      const named = index.definitionsByName.get(definition.name) || [];
      named.push(definition);
      index.definitionsByName.set(definition.name, named);
      if (definition.defaultExport) index.defaultExports.set(file.path, definition);
    }
    index.importsByPath.set(file.path, collectImports(file, index));
  }

  for (const file of files) collectExports(file, index);
  return index;
}

export function getNavigationLinks(index: ProjectIndex, path: string): NavigationLink[] {
  const file = index.fileByPath.get(path);
  if (!file) return [];
  const definitions = index.definitionsByPath.get(path) || [];
  const definitionOffsets = new Set(definitions.map(definition => definition.offset));
  const imports = index.importsByPath.get(path) || [];
  const importOffsets = new Map(imports.map(binding => [binding.offset, binding]));
  const occurrences = getOccurrences(index, path);
  const links: NavigationLink[] = [];
  const seen = new Set<number>();

  for (const occurrence of occurrences) {
    if (definitionOffsets.has(occurrence.offset)) continue;
    if (seen.has(occurrence.offset)) continue;
    const target = resolveOccurrence(index, path, occurrence, occurrences);
    if (!target) continue;
    if (target.path === path && target.offset === occurrence.offset) continue;
    seen.add(occurrence.offset);
    links.push({
      offset: occurrence.offset,
      length: occurrence.length,
      name: occurrence.name,
      role: importOffsets.has(occurrence.offset) ? 'import' : 'usage',
      target: toTarget(target),
    });
  }
  for (const binding of imports) {
    if (!binding.resolvedPath || seen.has(binding.sourceOffset)) continue;
    seen.add(binding.sourceOffset);
    links.push({
      offset: binding.sourceOffset,
      length: binding.sourceLength,
      name: binding.source,
      role: 'import',
      target: { id: `module:${binding.resolvedPath}`, name: binding.source, path: binding.resolvedPath, line: 1, column: 1, offset: 0, length: 0, kind: 'module' },
    });
  }
  return links;
}

export function resolveDefinitionAt(index: ProjectIndex, path: string, line: number, column: number): NavigationTarget | null {
  const file = index.fileByPath.get(path);
  if (!file) return null;
  const offset = offsetAt(file.content, line, column);
  const occurrences = getOccurrences(index, path);
  const occurrence = occurrences.find(item => item.offset <= offset && offset < item.offset + item.length)
    || occurrenceFromOffset(offset, occurrences);
  if (!occurrence) return null;
  const definition = resolveOccurrence(index, path, occurrence, occurrences);
  return definition ? toTarget(definition) : null;
}

export function findReferencesAt(index: ProjectIndex, path: string, line: number, column: number) {
  const file = index.fileByPath.get(path);
  const definition = resolveDefinitionAt(index, path, line, column);
  if (!file || !definition) return null;
  const references: ReferenceTarget[] = [];
  const seen = new Set<string>();
  const limit = 500;
  let truncated = false;

  for (const candidate of index.files) {
    if (!shouldSearchFile(index, candidate, definition)) continue;
    const occurrences = getOccurrences(index, candidate.path);
    const candidateImports = index.importsByPath.get(candidate.path) || [];
    for (const occurrence of occurrences) {
      const resolved = resolveOccurrence(index, candidate.path, occurrence, occurrences);
      if (!resolved || resolved.id !== definition.id) continue;
      const key = `${candidate.path}:${occurrence.offset}`;
      if (seen.has(key)) continue;
      if (references.length === limit) { truncated = true; break; }
      seen.add(key);
      const role: ReferenceRole = resolved.path === candidate.path && resolved.offset === occurrence.offset
        ? 'definition'
        : candidateImports.some(binding => binding.offset === occurrence.offset) ? 'import' : 'usage';
      references.push({
        ...toTarget(resolved),
        path: candidate.path,
        line: occurrence.line,
        column: occurrence.column,
        offset: occurrence.offset,
        length: occurrence.length,
        role,
      });
    }
    if (truncated) break;
  }

  references.sort((a, b) => Number(b.role === 'definition') - Number(a.role === 'definition') || a.path.localeCompare(b.path) || a.line - b.line);
  return { definition, references, truncated };
}

function shouldSearchFile(index: ProjectIndex, file: WorkspaceFile, definition: NavigationTarget) {
  if (file.path === definition.path) return true;
  if (file.content.includes(definition.name)) return true;
  const bindings = index.importsByPath.get(file.path) || [];
  return bindings.some(binding => resolveImportBinding(index, binding)?.id === definition.id);
}

function collectImports(file: WorkspaceFile, index: ProjectIndex): ImportBinding[] {
  const imports: ImportBinding[] = [];
  const source = maskSource(file.content, false);
  const importPattern = /(^|\n)[ \t]*import\s+([^;]*?)\s+from\s+(['"])([^'"]+)\3\s*;?/g;
  for (const match of source.matchAll(importPattern)) {
    const clause = match[2];
    const clauseOffset = match.index! + match[0].indexOf(clause);
    const resolvedPath = resolveImportPath(index, match[4], file.path);
    const quotedSource = `${match[3]}${match[4]}${match[3]}`;
    const sourceOffset = match.index! + match[0].lastIndexOf(quotedSource);
    imports.push(...parseImportClause(clause, clauseOffset, match[4], resolvedPath, file, sourceOffset, quotedSource.length));
  }
  return imports;
}

function parseImportClause(clause: string, clauseOffset: number, source: string, resolvedPath: string | null, file: WorkspaceFile, sourceOffset: number, sourceLength: number): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const starts = createLineStarts(file.content);
  let cursor = 0;
  let typeOnly = false;
  const add = (localName: string, importedName: string, kind: ImportBinding['kind'], at: number, itemTypeOnly = typeOnly) => {
    const position = positionAt(starts, clauseOffset + at);
    bindings.push({
      localName,
      importedName,
      source,
      resolvedPath,
      line: position.line,
      column: position.column,
      offset: clauseOffset + at,
      length: localName.length,
      kind,
      typeOnly: itemTypeOnly,
      sourceOffset,
      sourceLength,
    });
  };
  const skipSeparators = () => { while (cursor < clause.length && /[\s,]/.test(clause[cursor])) cursor++; };

  const leadingType = clause.match(/^\s*type\s+/);
  if (leadingType) { typeOnly = true; cursor += leadingType[0].length; }
  skipSeparators();

  if (clause[cursor] === '*') {
    const namespace = clause.slice(cursor).match(/^\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) {
      const name = namespace[1];
      add(name, '*', 'namespace', clause.indexOf(name, cursor));
    }
    return bindings;
  }

  if (clause[cursor] !== '{') {
    const defaultImport = clause.slice(cursor).match(/^([A-Za-z_$][\w$]*)/);
    if (defaultImport) {
      add(defaultImport[1], 'default', 'default', clause.indexOf(defaultImport[1], cursor));
      cursor += defaultImport[0].length;
      skipSeparators();
    }
  }

  if (clause[cursor] === '{') {
    const close = clause.indexOf('}', cursor);
    if (close !== -1) {
      const named = clause.slice(cursor + 1, close);
      let search = cursor + 1;
      for (const rawPart of named.split(',')) {
        const part = rawPart.trim();
        if (part) {
          const partOffset = clause.indexOf(rawPart, search);
          search = partOffset + rawPart.length;
          const partType = /^type\s+/.test(part);
          const clean = part.replace(/^type\s+/, '');
          const specifier = clean.match(/^([A-Za-z_$][\w$]*|default)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
          if (specifier) {
            const importedName = specifier[1];
            const localName = specifier[2] || specifier[1];
            add(localName, importedName, 'named', partOffset + rawPart.lastIndexOf(localName), partType || typeOnly);
          }
        }
      }
    }
  }

  return bindings;
}

function collectExports(file: WorkspaceFile, index: ProjectIndex) {
  const source = maskSource(file.content, false);
  const masked = maskSource(file.content, true);
  const definitions = index.definitionsByPath.get(file.path) || [];
  const exportedNames = index.exportedNames.get(file.path) || new Map<string, Definition>();
  index.exportedNames.set(file.path, exportedNames);
  const reexports = index.reexports.get(file.path) || [];
  index.reexports.set(file.path, reexports);
  const starts = createLineStarts(file.content);

  const addDefault = (definition: Definition) => {
    definition.defaultExport = true;
    index.defaultExports.set(file.path, definition);
  };
  const findDefinition = (name: string) => definitions.find(definition => definition.name === name);

  for (const definition of definitions) {
    if (definition.exported && !definition.defaultExport) exportedNames.set(definition.name, definition);
  }

  const exportListPattern = /(^|\n)[ \t]*export\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s+(['"])([^'"]+)\3)?/g;
  for (const match of source.matchAll(exportListPattern)) {
    const exported = match[2];
    const from = match[4];
    const resolvedPath = from ? resolveImportPath(index, from, file.path) : null;
    for (const rawPart of exported.split(',')) {
      const part = rawPart.trim().replace(/^type\s+/, '');
      if (!part) continue;
      const specifier = part.match(/^([A-Za-z_$][\w$]*|default)(?:\s+as\s+([A-Za-z_$][\w$]*|default))?$/);
      if (!specifier) continue;
      const importedName = specifier[1];
      const exportedName = specifier[2] || specifier[1];
      if (from) {
        reexports.push({ importedName, exportedName, resolvedPath });
        continue;
      }
      if (exportedName === 'default') {
        const definition = findDefinition(importedName);
        if (definition) addDefault(definition);
        else index.defaultAliases.set(file.path, { name: importedName, offset: match.index! });
      } else {
        const definition = findDefinition(importedName);
        if (definition) { definition.exported = true; exportedNames.set(exportedName, definition); }
      }
    }
  }

  const exportAllPattern = /(^|\n)[ \t]*export\s+\*\s+from\s+(['"])([^'"]+)\2/g;
  for (const match of source.matchAll(exportAllPattern)) {
    reexports.push({ importedName: null, exportedName: '*', resolvedPath: resolveImportPath(index, match[3], file.path) });
  }

  const defaultPattern = /(^|\n)[ \t]*export\s+default\s+/g;
  for (const match of masked.matchAll(defaultPattern)) {
    const expressionOffset = match.index! + match[0].length;
    const expression = file.content.slice(expressionOffset);
    const namedFunction = expression.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/) || expression.match(/^class\s+([A-Za-z_$][\w$]*)/);
    if (namedFunction) continue;
    const alias = expression.match(/^([A-Za-z_$][\w$]*)\s*(?:;|\n|$)/);
    if (alias) {
      const definition = findDefinition(alias[1]);
      if (definition) { addDefault(definition); continue; }
      const binding = (index.importsByPath.get(file.path) || []).find(item => item.localName === alias[1]);
      if (binding) { index.defaultAliases.set(file.path, { name: alias[1], offset: expressionOffset }); continue; }
    }
    const anonymous = expression.match(/^(?:async\s+)?(function|class)\b/);
    const nameOffset = anonymous ? expressionOffset + anonymous[0].lastIndexOf(anonymous[1]) : expressionOffset;
    const position = positionAt(starts, nameOffset);
    const definition: Definition = {
      id: `${file.path}:${nameOffset}:default`,
      name: 'default',
      path: file.path,
      line: position.line,
      column: position.column,
      offset: nameOffset,
      length: 7,
      kind: /\.jsx?$/.test(file.path) || /\.tsx$/.test(file.path) ? 'component' : 'function',
      exported: false,
      defaultExport: true,
    };
    definitions.push(definition);
    index.definitions.push(definition);
    const named = index.definitionsByName.get('default') || [];
    named.push(definition);
    index.definitionsByName.set('default', named);
    index.defaultExports.set(file.path, definition);
  }
}

function collectDefinitions(file: WorkspaceFile): Definition[] {
  const source = maskSource(file.content, true);
  const starts = createLineStarts(file.content);
  const definitions: Definition[] = [];
  const seen = new Set<string>();
  const add = (name: string, offset: number, kind: SymbolKind, exported: boolean, defaultExport: boolean) => {
    const key = `${offset}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const position = positionAt(starts, offset);
    definitions.push({
      id: `${file.path}:${offset}:${name}`,
      name,
      path: file.path,
      line: position.line,
      column: position.column,
      offset,
      length: name.length,
      kind,
      exported,
      defaultExport,
    });
  };
  const declarationKind = (name: string, fallback: SymbolKind): SymbolKind => /^[A-Z]/.test(name) ? 'component' : /^use[A-Z]/.test(name) ? 'hook' : fallback;

  for (const match of source.matchAll(/(^|\n)[ \t]*(export\s+)?(default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) {
    const name = match[4];
    add(name, match.index! + match[0].lastIndexOf(name), declarationKind(name, 'function'), !!match[2], !!match[3]);
  }
  for (const match of source.matchAll(/(^|\n)[ \t]*(export\s+)?(default\s+)?class\s+([A-Za-z_$][\w$]*)/g)) {
    const name = match[4];
    add(name, match.index! + match[0].lastIndexOf(name), declarationKind(name, 'class'), !!match[2], !!match[3]);
  }
  for (const match of source.matchAll(/(^|\n)[ \t]*(export\s+)?(?:default\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    const name = match[3];
    add(name, match.index! + match[0].lastIndexOf(name), declarationKind(name, 'variable'), !!match[2], false);
  }
  for (const match of source.matchAll(/(^|\n)[ \t]*(export\s+)?(type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) {
    const keyword = match[3] as 'type' | 'interface' | 'enum';
    const name = match[4];
    add(name, match.index! + match[0].lastIndexOf(name), keyword, !!match[2], false);
  }

  return definitions;
}

function resolveOccurrence(index: ProjectIndex, path: string, occurrence: Occurrence, occurrences: Occurrence[]): Definition | null {
  const file = index.fileByPath.get(path);
  const bindings = index.importsByPath.get(path) || [];
  const binding = bindings.find(item => item.localName === occurrence.name);
  if (binding) {
    if (binding.kind === 'namespace') return null;
    return resolveImportBinding(index, binding);
  }

  const local = (index.definitionsByPath.get(path) || []).find(definition => definition.name === occurrence.name);
  if (local) return local;

  if (!file) return null;
  const previous = findPreviousOccurrence(occurrences, occurrence.offset);
  if (!previous) return null;
  const between = file.content.slice(previous.offset + previous.length, occurrence.offset);
  if (!/^\s*\.\s*$/.test(between)) return null;
  const namespace = bindings.find(item => item.localName === previous.name && item.kind === 'namespace');
  return namespace?.resolvedPath ? resolveExport(index, namespace.resolvedPath, occurrence.name) : null;
}

function resolveImportBinding(index: ProjectIndex, binding: ImportBinding, seen = new Set<string>()): Definition | null {
  if (!binding.resolvedPath) return null;
  const name = binding.kind === 'default' ? 'default' : binding.importedName;
  return resolveExport(index, binding.resolvedPath, name, seen);
}

function resolveExport(index: ProjectIndex, path: string, name: string, seen = new Set<string>()): Definition | null {
  const key = `${path}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);

  if (name === 'default') {
    const direct = index.defaultExports.get(path);
    if (direct) return direct;
    const alias = index.defaultAliases.get(path);
    if (alias) {
      const local = (index.definitionsByPath.get(path) || []).find(definition => definition.name === alias.name);
      if (local) return local;
      const binding = (index.importsByPath.get(path) || []).find(item => item.localName === alias.name);
      if (binding) return resolveImportBinding(index, binding, seen);
    }
  } else {
    const direct = index.exportedNames.get(path)?.get(name);
    if (direct) return direct;
  }

  for (const reexport of index.reexports.get(path) || []) {
    if (!reexport.resolvedPath) continue;
    if (reexport.importedName !== null && reexport.exportedName !== name) continue;
    const targetName = reexport.importedName || name;
    const found = resolveExport(index, reexport.resolvedPath, targetName, seen);
    if (found) return found;
  }
  return null;
}

function getOccurrences(index: ProjectIndex, path: string): Occurrence[] {
  const cached = index.occurrences.get(path);
  if (cached) return cached;
  const file = index.fileByPath.get(path);
  if (!file) return [];
  const occurrences = collectOccurrences(file);
  index.occurrences.set(path, occurrences);
  return occurrences;
}

function collectOccurrences(file: WorkspaceFile): Occurrence[] {
  const language = /\.tsx$/.test(file.path) ? 'tsx' : /\.jsx$/.test(file.path) ? 'jsx' : /\.(ts|mts|cts)$/.test(file.path) ? 'typescript' : /\.(js|mjs|cjs)$/.test(file.path) ? 'javascript' : 'typescript';
  const grammar = Prism.languages[language];
  const tokens = grammar && file.content.length <= 200_000 ? Prism.tokenize(file.content, grammar) : [maskSource(file.content, true)];
  const starts = createLineStarts(file.content);
  const occurrences: Occurrence[] = [];
  let offset = 0;

  function walk(token: string | Prism.Token | (string | Prism.Token)[], inherited: string[]) {
    if (Array.isArray(token)) { token.forEach(item => walk(item, inherited)); return; }
    if (typeof token === 'string') {
      if (!inherited.some(type => ignoredTokenTypes.has(type))) {
        for (const match of token.matchAll(identifierPattern)) {
          const at = offset + match.index!;
          const position = positionAt(starts, at);
          occurrences.push({ name: match[0], offset: at, line: position.line, column: position.column, length: match[0].length });
        }
      }
      offset += token.length;
      return;
    }
    const aliases = token.alias ? (Array.isArray(token.alias) ? token.alias : [token.alias]) : [];
    walk(token.content, [...inherited, token.type, ...aliases]);
  }

  walk(tokens, []);
  return occurrences;
}

function readAliasRules(files: WorkspaceFile[]): AliasRule[] {
  const config = files.find(file => /^(tsconfig|jsconfig)(\.app|\.base)?\.json$/.test(file.path));
  const rules: AliasRule[] = [];
  let baseUrl = '';
  if (config) {
    try {
      const parsed = JSON.parse(stripJsonComments(config.content));
      const options = parsed.compilerOptions || {};
      baseUrl = typeof options.baseUrl === 'string' ? normalizePath(options.baseUrl) : '';
      const paths = options.paths && typeof options.paths === 'object' ? options.paths : {};
      for (const [pattern, targets] of Object.entries(paths)) {
        if (!Array.isArray(targets)) continue;
        for (const target of targets) {
          if (typeof target !== 'string') continue;
          const rule = aliasRule(pattern, target, baseUrl);
          if (rule) rules.push(rule);
        }
      }
    } catch { /* Fall back to the common Vite alias below. */ }
  }
  if (!rules.some(rule => rule.prefix === '@/' && rule.suffix === '')) rules.push({ prefix: '@/', suffix: '', targetPrefix: baseUrl ? '' : 'src/', targetSuffix: '', base: baseUrl });
  return rules;
}

function aliasRule(pattern: string, target: string, base: string): AliasRule | null {
  const patternStar = pattern.indexOf('*');
  const targetStar = target.indexOf('*');
  if ((patternStar === -1) !== (targetStar === -1)) return null;
  if (patternStar === -1) return { prefix: pattern, suffix: '', targetPrefix: target, targetSuffix: '', base };
  return {
    prefix: pattern.slice(0, patternStar),
    suffix: pattern.slice(patternStar + 1),
    targetPrefix: target.slice(0, targetStar),
    targetSuffix: target.slice(targetStar + 1),
    base,
  };
}

function resolveImportPath(index: ProjectIndex, source: string, fromPath: string): string | null {
  if (!source) return null;
  const candidates: string[] = [];
  if (source.startsWith('.')) {
    candidates.push(joinPath(dirname(fromPath), source));
  } else if (source.startsWith('/')) {
    candidates.push(source.slice(1));
  } else {
    for (const rule of index.aliases) {
      const matched = matchAlias(rule, source);
      if (matched === null) continue;
      candidates.push(joinPath(rule.base, `${rule.targetPrefix}${matched}${rule.targetSuffix}`));
    }
    candidates.push(source);
  }

  for (const raw of candidates) {
    const candidate = normalizePath(raw);
    if (!candidate) continue;
    const variants = [candidate];
    const withoutJavaScriptExtension = candidate.replace(/\.(js|jsx|mjs|cjs)$/i, '');
    if (withoutJavaScriptExtension !== candidate) variants.push(`${withoutJavaScriptExtension}.tsx`, `${withoutJavaScriptExtension}.ts`);
    for (const extension of codeExtensions) variants.push(`${candidate}${extension}`);
    for (const variant of variants) if (index.fileByPath.has(variant)) return variant;
    for (const extension of codeExtensions) {
      const indexPath = `${candidate}/index${extension}`;
      if (index.fileByPath.has(indexPath)) return indexPath;
    }
  }
  return null;
}

function matchAlias(rule: AliasRule, source: string) {
  if (!source.startsWith(rule.prefix) || !source.endsWith(rule.suffix)) return null;
  if (source.length < rule.prefix.length + rule.suffix.length) return null;
  return source.slice(rule.prefix.length, source.length - rule.suffix.length);
}

function maskSource(source: string, maskStrings: boolean) {
  const output = source.split('');
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (state === 'code') {
      if (char === '/' && source[index + 1] === '/') { output[index] = output[index + 1] = ' '; state = 'line'; index++; continue; }
      if (char === '/' && source[index + 1] === '*') { output[index] = output[index + 1] = ' '; state = 'block'; index++; continue; }
      if (maskStrings && (char === "'" || char === '"')) { output[index] = ' '; state = char === "'" ? 'single' : 'double'; continue; }
      if (maskStrings && char === '`') { output[index] = ' '; state = 'template'; continue; }
      continue;
    }
    if (char === '\n') {
      if (state === 'line') state = 'code';
      continue;
    }
    output[index] = ' ';
    if (state === 'line') continue;
    if (state === 'block' && char === '*' && source[index + 1] === '/') { output[index + 1] = ' '; state = 'code'; index++; continue; }
    if ((state === 'single' || state === 'double' || state === 'template') && char === '\\') { output[index + 1] = ' '; index++; continue; }
    if ((state === 'single' && char === "'") || (state === 'double' && char === '"') || (state === 'template' && char === '`')) state = 'code';
  }
  return output.join('');
}

function stripJsonComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

function offsetAt(source: string, line: number, column: number) {
  const lines = source.split('\n');
  let offset = 0;
  for (let index = 0; index < Math.min(line - 1, lines.length); index++) offset += lines[index].length + 1;
  return Math.min(source.length, offset + Math.max(0, column - 1));
}

function occurrenceFromOffset(offset: number, occurrences: Occurrence[]) {
  let closest: Occurrence | null = null;
  let closestDistance = Infinity;
  for (const occurrence of occurrences) {
    const distance = Math.abs(occurrence.offset - offset);
    if (distance <= 40 && distance < closestDistance) { closest = occurrence; closestDistance = distance; }
  }
  return closest;
}

function findPreviousOccurrence(occurrences: Occurrence[], offset: number) {
  let low = 0;
  let high = occurrences.length - 1;
  let previous: Occurrence | null = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (occurrences[middle].offset < offset) { previous = occurrences[middle]; low = middle + 1; }
    else high = middle - 1;
  }
  return previous;
}

function toTarget(definition: Definition): NavigationTarget {
  const { id, name, path, line, column, offset, length, kind } = definition;
  return { id, name, path, line, column, offset, length, kind };
}

function createLineStarts(source: string) {
  const starts = [0];
  for (let index = 0; index < source.length; index++) if (source[index] === '\n') starts.push(index + 1);
  return starts;
}

function positionAt(starts: number[], offset: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - starts[lineIndex] + 1 };
}

function dirname(path: string) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function joinPath(left: string, right: string) {
  return left ? `${left}/${right}` : right;
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/^\.\//, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}
