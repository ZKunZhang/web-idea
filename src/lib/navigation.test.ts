import { describe, expect, it } from 'vitest';
import { buildProjectIndex, findReferencesAt, getNavigationLinks, resolveDefinitionAt } from './navigation';
import type { WorkspaceFile } from './workspace';

const app: WorkspaceFile = {
  path: 'src/App.tsx',
  content: `import { Button } from '@/components/Button';\nimport Card from './Card';\n\nexport default function App() {\n  return <main><Button label=\"go\" /><Card /></main>;\n}\n`,
};
const button: WorkspaceFile = {
  path: 'src/components/Button.tsx',
  content: `export type ButtonProps = { label: string };\n\nexport function Button({ label }: ButtonProps) {\n  return <button>{label}</button>;\n}\n`,
};
const card: WorkspaceFile = {
  path: 'src/Card.tsx',
  content: `export default function Card() {\n  return <article>card</article>;\n}\n`,
};
const tsconfig: WorkspaceFile = {
  path: 'tsconfig.json',
  content: `{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }`,
};

describe('project navigation', () => {
  it('indexes components, functions, hooks and types with their exports', () => {
    const index = buildProjectIndex([app, button, card, tsconfig]);
    expect(index.definitions.filter(definition => definition.kind === 'component').map(component => `${component.path}:${component.name}`)).toEqual([
      'src/App.tsx:App', 'src/components/Button.tsx:Button', 'src/Card.tsx:Card',
    ]);
    expect(index.definitionsByName.get('ButtonProps')?.[0]).toMatchObject({ path: 'src/components/Button.tsx', kind: 'type', line: 1 });
  });

  it('resolves alias and default imports to their definitions', () => {
    const index = buildProjectIndex([app, button, card, tsconfig]);
    const links = getNavigationLinks(index, 'src/App.tsx');
    const buttonLink = links.find(link => link.offset === app.content.indexOf('<Button') + 1);
    const cardLink = links.find(link => link.offset === app.content.indexOf('<Card') + 1);
    const moduleLink = links.find(link => link.offset === app.content.indexOf("'@/components/Button'"));
    expect(buttonLink?.target).toMatchObject({ path: 'src/components/Button.tsx', name: 'Button', line: 3, kind: 'component' });
    expect(cardLink?.target).toMatchObject({ path: 'src/Card.tsx', name: 'Card', line: 1, kind: 'component' });
    expect(moduleLink?.target).toMatchObject({ path: 'src/components/Button.tsx', line: 1, kind: 'module' });
  });

  it('resolves a symbol under the cursor and finds its project references', () => {
    const index = buildProjectIndex([app, button, card, tsconfig]);
    const buttonUseLine = app.content.split('\n').findIndex(line => line.includes('<Button')) + 1;
    const buttonUseColumn = app.content.split('\n')[buttonUseLine - 1].indexOf('Button') + 1;
    expect(resolveDefinitionAt(index, 'src/App.tsx', buttonUseLine, buttonUseColumn)).toMatchObject({ path: 'src/components/Button.tsx', line: 3 });
    const references = findReferencesAt(index, 'src/App.tsx', buttonUseLine, buttonUseColumn);
    expect(references?.references.map(reference => `${reference.path}:${reference.line}:${reference.role}`)).toEqual([
      'src/components/Button.tsx:3:definition',
      'src/App.tsx:1:import',
      'src/App.tsx:5:usage',
    ]);
  });

  it('resolves relative imports through index files and js-to-ts mappings', () => {
    const index = buildProjectIndex([
      { path: 'src/main.ts', content: `import { start } from './utils';\nstart();\n` },
      { path: 'src/utils/index.ts', content: `export function start() { return true; }\n` },
    ]);
    const link = getNavigationLinks(index, 'src/main.ts')[0];
    expect(link).toMatchObject({ name: 'start', target: { path: 'src/utils/index.ts', line: 1, kind: 'function' } });
  });

  it('resolves default exports declared through a local alias and re-exported through barrels', () => {
    const index = buildProjectIndex([
      { path: 'src/App.tsx', content: `import { Panel } from '@/components';\nimport { Button as Action } from '@/components/Button';\n\nexport default App;\nfunction App() { return <Panel><Action /></Panel>; }\n` },
      { path: 'src/components/index.ts', content: `export { default as Panel } from './Panel';\nexport { Button } from './Button';\n` },
      { path: 'src/components/Panel.tsx', content: `export default function Panel({ children }: { children: React.ReactNode }) { return <section>{children}</section>; }\n` },
      { path: 'src/components/Button.tsx', content: `export function Button() { return <button />; }\n` },
      tsconfig,
    ]);
    const links = getNavigationLinks(index, 'src/App.tsx');
    expect(links.find(link => link.name === 'Panel')?.target).toMatchObject({ path: 'src/components/Panel.tsx', line: 1 });
    expect(links.find(link => link.name === 'Action')?.target).toMatchObject({ path: 'src/components/Button.tsx', line: 1 });
  });

  it('resolves namespace member usage and excludes same-name symbols in unrelated files', () => {
    const files = [
      { path: 'src/App.tsx', content: `import * as UI from './ui';\nexport function App() { return <UI.Button />; }\n` },
      { path: 'src/ui.tsx', content: `export function Button() { return <button />; }\n` },
      { path: 'src/Other.tsx', content: `export function Button() { return <div />; }\n` },
    ];
    const index = buildProjectIndex(files);
    const links = getNavigationLinks(index, 'src/App.tsx');
    expect(links.find(link => link.name === 'Button')?.target).toMatchObject({ path: 'src/ui.tsx', line: 1 });
    const references = findReferencesAt(index, 'src/App.tsx', 2, 40);
    expect(references?.references.map(reference => reference.path)).toEqual(['src/ui.tsx', 'src/App.tsx']);
  });
});
