# Local IDE

在浏览器里只读浏览本地 React 项目。使用 React + TypeScript + Vite，参考 GitLab Web IDE 的文件树与标签布局，使用 Prism 进行语法高亮。

支持左侧文件树、路径筛选、多标签代码预览、行号、文件快速打开、全项目搜索、文件内搜索与复制代码。内置轻量静态索引，支持组件/函数/变量/类型定义跳转，以及当前符号的项目内引用查询。没有代码编辑或保存功能，也不会写入本地文件。

启动后是空工作区，需要先打开本地目录；项目不再内置示例数据。

## 启动

需要 Node.js 22.12+ 和 pnpm 12（项目锁定 pnpm 12.11.2）。

```sh
pnpm install
pnpm dev
```

打开终端显示的地址，默认是 http://127.0.0.1:5173，也可使用 http://localhost:5173。服务只监听本机回环地址。

## 本地目录

- Chrome / Edge：点击「打开本地项目」，通过浏览器目录选择器授权**只读**访问。
- 不支持目录选择 API 的浏览器：自动使用目录导入；也可点击左下方「兼容模式导入目录」。文件仍只在浏览器里读取，不会上传。
- 本地文件变化后，点击代码标签右侧的刷新按钮重新读取。兼容导入模式需要重新选择目录；没有自动监听。
- 浏览器不能通过输入任意磁盘路径直接访问目录，需要手动选择授权。请通过 localhost / 127.0.0.1 或 HTTPS 访问，不能直接双击 HTML 文件启动。

自动跳过 `.git`、`node_modules`、构建产物目录和常见二进制文件。最多读取 2,000 个文本文件，单文件最大 2 MB，总计最大 32 MB；不可读文件会跳过并提示。大于 200,000 字符的文件使用纯文本预览。代码区只渲染可见行，全项目搜索最多显示 500 个匹配。

## 组件与引用

- 代码区的组件名、函数、变量和类型会显示虚线下划线，单击跳到项目内定义。
- import 语句中的目标路径也可以点击，直接打开对应的项目文件。
- 将光标放在符号上，按 `F12` 跳到定义，按 `Shift F12` 在左侧查看引用；也可以使用代码工具栏的「定义」「引用」按钮。
- 支持相对路径、`tsconfig.json` / `jsconfig.json` 的 `baseUrl` 和 `paths` 别名，以及 `index.ts(x)` 与 `.js` → `.ts(x)` 常见 ESM 映射。来自 `node_modules` 的外部依赖不做跳转。

## 快捷键

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 快速打开文件 | ⌘ P | Ctrl P |
| 全项目搜索 | ⌘ Shift F | Ctrl Shift F |
| 文件内搜索 | ⌘ F | Ctrl F |
| 跳转到定义 | F12 | F12 |
| 查找引用 | ⇧ F12 | Shift F12 |
| 展开 / 收起文件树 | ⌘ B | Ctrl B |

## 验证

```sh
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

单元测试覆盖目录读取、过滤、大小限制、文本搜索、CRLF 行列、语法高亮偏移，以及组件/定义/引用索引。浏览器测试覆盖空工作区、定义与引用跳转、只读预览、搜索定位、目录导入、localhost 下的原生文件句柄读取与刷新、权限失败、窄屏布局及大文件可见行渲染。原生文件句柄测试使用浏览器存储目录并模拟目录选择器，系统目录授权弹窗仍需手动操作。

## 部署到 GitHub Pages

项目已包含 `.github/workflows/deploy.yml`。推送到 `main` 后，GitHub Actions 会运行单元测试、构建 `dist`，并通过 GitHub Pages 发布。首次使用时在仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

构建使用相对资源路径，因此同时兼容 `https://<user>.github.io/<repo>/` 和自定义域名。GitHub Pages 默认提供 HTTPS，可直接使用 Chrome / Edge 的目录选择器读取本地项目；文件仍只在浏览器内处理。

部署完成后，站点地址通常是：

```text
https://<user>.github.io/<repo>/
```

如果使用自定义域名，请在 **Settings → Pages → Custom domain** 配置，并按 GitHub 提示添加 DNS 记录和启用 HTTPS。不要在 `vite.config.ts` 中写死 `base`，当前相对路径配置可以避免仓库名变化导致的资源 404。
