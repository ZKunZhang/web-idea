import { expect, test } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('workspace toolbar, read-only preview, project search and file search work', async ({ page }) => {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173')) remoteRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('region', { name: /src\/App.tsx 只读代码/ })).toBeVisible();
  await expect(page.locator('.line-number').first()).toHaveText('1');
  await expect(page.locator('[contenteditable="true"], textarea, .component-word, .topbar')).toHaveCount(0);
  await expect(page.locator('.workspace-bar .command-search')).toBeVisible();
  await expect(page.getByRole('button', { name: '组件跳转', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/private/tmp/web-idea-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '全项目搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索项目代码', exact: true }).fill('function Button');
  await expect(page.locator('.search-summary')).toHaveText('1 处结果 · 1 个文件');
  await page.locator('.result-row').click();
  await expect(page.getByRole('region', { name: /src\/components\/Button.tsx 只读代码/ })).toBeVisible();
  await expect(page.locator('.target-line')).toHaveAttribute('data-line', '9');
  await expect(page.locator('.target-line')).toContainText('function Button');
  expect(await page.locator('.code-match').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: '文件内搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '文件内搜索文本' }).fill('onClick');
  await expect(page.locator('.file-find > span')).toHaveText('1/4');
  await page.getByRole('button', { name: '下一个匹配' }).click();
  await expect(page.locator('.file-find > span')).toHaveText('2/4');
  await page.getByRole('textbox', { name: '文件内搜索文本' }).fill('return');
  await page.getByRole('textbox', { name: '搜索项目代码', exact: true }).fill('function Header');
  await page.locator('.result-row').click();
  await expect(page.locator('.target-line')).toHaveAttribute('data-line', '5');
  await expect(page.locator('.target-line')).toContainText('function Header');
  await expect(page.locator('.file-find')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('compatible folder import reads real local fixtures; clicks on code do not navigate', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(path.resolve('tests/fixtures/react-project'));
  await expect(page.locator('.workspace-breadcrumb')).toContainText('react-project');
  await expect(page.locator('.status-file-count')).toHaveText('3 个文件');
  await expect(page.getByRole('region', { name: /src\/App.tsx 只读代码/ })).toBeVisible();
  await page.locator('.line-code').filter({ hasText: 'return <Button' }).click({ modifiers: ['Control'] });
  await expect(page.getByRole('region', { name: /src\/App.tsx 只读代码/ })).toBeVisible();
  await page.locator('.file-tree').getByRole('button', { name: 'Button.tsx', exact: true }).click();
  await expect(page.getByRole('region', { name: /src\/components\/Button.tsx 只读代码/ })).toBeVisible();
});

test('localhost picker requests read access and native handles refresh changed snapshots', async ({ page }) => {
  await page.goto('http://localhost:4173');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const project = await root.getDirectoryHandle('native-local-project', { create: true });
    const file = await project.getFileHandle('App.tsx', { create: true });
    const writer = await file.createWritable();
    await writer.write('export default function App() { return <div>native-first</div>; }');
    await writer.close();
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async (options: { mode: string }) => {
      (window as unknown as { pickerMode: string }).pickerMode = options.mode;
      return project;
    } });
  });
  await page.getByRole('button', { name: '打开本地项目', exact: true }).click();
  await expect(page.locator('.workspace-breadcrumb')).toContainText('native-local-project');
  await expect(page.getByRole('region', { name: /App.tsx 只读代码/ })).toContainText('native-first');
  expect(await page.evaluate(() => (window as unknown as { pickerMode: string }).pickerMode)).toBe('read');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const project = await root.getDirectoryHandle('native-local-project');
    const file = await project.getFileHandle('App.tsx');
    const writer = await file.createWritable();
    await writer.write('export default function App() { return <div>native-refreshed</div>; }');
    await writer.close();
  });
  await page.getByRole('button', { name: '重新读取本地项目', exact: true }).click();
  await expect(page.getByRole('region', { name: /App.tsx 只读代码/ })).toContainText('native-refreshed');
});

test('quick open, denied access and small-screen layout work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /搜索文件，快速前往/ }).click();
  await page.getByRole('textbox', { name: '快速打开文件名称' }).fill('Header');
  await page.getByRole('textbox', { name: '快速打开文件名称' }).press('Enter');
  await expect(page.getByRole('region', { name: /Header.tsx 只读代码/ })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => { throw new DOMException('拒绝读取', 'NotAllowedError'); } }));
  await page.getByRole('button', { name: '打开本地项目', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /打开失败/ })).toContainText('兼容模式');
  await expect(page.getByRole('region', { name: /Header.tsx 只读代码/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.locator('.workspace-bar .command-search')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/web-idea-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('large file renders only visible rows and search locates offscreen lines', async ({ page }) => {
  await page.goto('/');
  const content = Array.from({ length: 5000 }, (_, index) => index === 4999 ? 'needle-final' : `// line ${index + 1}`).join('\n');
  const folder = await mkdtemp(path.join(tmpdir(), 'web-idea-fixture-'));
  await writeFile(path.join(folder, 'large.ts'), content);
  await writeFile(path.join(folder, 'long.txt'), 'x'.repeat(21000) + 'long-line-needle');
  await page.locator('input[type=file]').setInputFiles(folder);
  await expect(page.getByRole('region', { name: /large.ts 只读代码，共 5000 行/ })).toBeVisible();
  await rm(folder, { recursive: true });
  expect(await page.locator('.code-line').count()).toBeLessThan(100);
  await page.getByRole('button', { name: '全项目搜索', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索项目代码', exact: true }).fill('needle-final');
  await page.locator('.result-row').click();
  await expect(page.locator('.target-line')).toHaveAttribute('data-line', '5000');
  await expect(page.locator('.target-line')).toContainText('needle-final');
  await page.getByRole('textbox', { name: '搜索项目代码', exact: true }).fill('long-line-needle');
  await page.locator('.result-row').click();
  await expect(page.locator('.code-match')).toHaveText('long-line-needle');
  await expect(page.locator('.code-match')).toBeInViewport();
});
