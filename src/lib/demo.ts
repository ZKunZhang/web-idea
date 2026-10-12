import type { Workspace } from './workspace';
export const demoWorkspace: Workspace = {
  name: 'react-starter', mode: 'demo', skipped: 0,
  files: [
    { path: 'src/App.tsx', content: `import { useState } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { ProjectCard } from '@/components/ProjectCard';
import './styles.css';

// 使用左侧文件树浏览代码，或搜索项目内的文本。
// 这是示例项目。点击「打开本地项目」浏览自己的代码。
export default function App() {
  const [activeTab, setActiveTab] = useState('all');

  return (
    <div className="app">
      <Header title="我的工作空间" />
      <main className="workspace">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h1>让想法，成为作品。</h1>
            <p>所有项目都在这里，随时开始新的探索。</p>
          </div>
          <Button variant="primary">新建项目</Button>
        </div>

        <nav className="tabs">
          {['all', 'recent', 'favorites'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}>
              {tab}
            </button>
          ))}
        </nav>

        <section className="project-grid">
          <ProjectCard name="Design system" language="TypeScript" />
          <ProjectCard name="Personal website" language="React" />
        </section>
      </main>
    </div>
  );
}
` },
    { path: 'src/components/Header.tsx', content: `import { Button } from './Button';

type HeaderProps = { title: string };

export function Header({ title }: HeaderProps) {
  return (
    <header className="header">
      <a href="/" className="brand">studio.</a>
      <span>{title}</span>
      <Button variant="ghost">个人设置</Button>
    </header>
  );
}
` },
    { path: 'src/components/Button.tsx', content: `import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  onClick?: () => void;
};

export function Button({ children, variant = 'primary', onClick }: ButtonProps) {
  return (
    <button className={\`button button--\${variant}\`} onClick={onClick}>
      {children}
    </button>
  );
}
` },
    { path: 'src/components/ProjectCard.tsx', content: `type ProjectCardProps = { name: string; language: string };

export function ProjectCard({ name, language }: ProjectCardProps) {
  return (
    <article className="project-card">
      <div className="project-card__icon">✦</div>
      <h2>{name}</h2>
      <span>{language}</span>
    </article>
  );
}
` },
    { path: 'src/hooks/useLocalStorage.ts', content: `import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    const saved = localStorage.getItem(key);
    try { return saved ? JSON.parse(saved) : initialValue; }
    catch { return initialValue; }
  });

  function update(next: T) {
    localStorage.setItem(key, JSON.stringify(next));
    setValue(next);
  }

  return [value, update] as const;
}
` },
    { path: 'src/main.tsx', content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
` },
    { path: 'src/styles.css', content: `:root {
  font-family: Inter, sans-serif;
  color: #232136;
  background: #f8f7fc;
}

.workspace { max-width: 1120px; margin: 0 auto; padding: 48px; }
.workspace-heading { display: flex; justify-content: space-between; }
.project-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.button--primary { color: white; background: #7759de; }
` },
    { path: 'public/favicon.svg', content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path fill="#9b87f5" d="M12 2 22 12 12 22 2 12Z" />
</svg>
` },
    { path: 'package.json', content: `{
  "name": "react-starter",
  "private": true,
  "scripts": { "dev": "vite", "build": "tsc && vite build" },
  "dependencies": { "react": "^19.2.0", "react-dom": "^19.2.0" },
  "devDependencies": { "typescript": "~5.9.3", "vite": "^7.2.0" }
}
` },
    { path: 'tsconfig.json', content: `{
  "compilerOptions": {
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "strict": true
  },
  "include": ["src"]
}
` },
    { path: 'README.md', content: `# React Starter

一个简洁的 React + TypeScript 示例项目。

## 本地开发

运行 pnpm install，然后运行 pnpm dev。

## 组件

- Header：工作空间导航
- Button：通用按钮
- ProjectCard：项目卡片

在 Local IDE 中使用全项目搜索，点击结果定位到对应行。
` },
    { path: '.gitignore', content: `node_modules\ndist\n.DS_Store\n` },
  ],
};
