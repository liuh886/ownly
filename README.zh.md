# 物欲清单 (Ownly)

Ownly 是一款 Obsidian 原生、本地优先的个人决策账本，用 Markdown 管理实物、订阅与体验成本。

**Own less, Live more, Decide better.**

它目前支持两种运行环境：

- 作为 Web App (在浏览器或通过 PM2 部署使用)
- 作为私有 Obsidian 插件 (在本地 Vault 内使用)

产品发展方向以 Obsidian 插件为主，Web App 版本阶段性保持兼容，作为浏览器运行时与开发验证界面。

## 版本说明

当前版本：`1.0.0`

许可证：MIT。

## 国际化 (i18n)

Ownly Obsidian 插件原生支持英文 (English) 与中文 (`zh`) 双语。您可以在 Obsidian 内的 Ownly 插件设置页面切换语言首选项。

## Web App

Web App 是独立的浏览器版本，通过 File System Access API 连接本地文件夹。

```bash
npm run dev        # 开发服务器 localhost:3000
npm run build      # 静态导出到 out/
```

可部署到任意静态托管（Vercel、Netlify、GitHub Pages 等），或用 PM2 本地运行：

```bash
npx pm2 start ecosystem.config.cjs
```

Web App 所有功能默认开启，无许可证限制。

## Obsidian 插件

### 从社区插件安装（推荐）

👉 **[安装 Ownly](https://obsidian.md/plugins?id=ownly)**

或手动操作：
1. 打开 Obsidian → 设置 → 社区插件 → 浏览
2. 搜索 **Ownly**
3. 安装并启用

### 手动安装

```bash
npm run package:obsidian
cp -R dist/obsidian/ownly /path/to/vault/.obsidian/plugins/ownly
```

然后在 Obsidian → 设置 → 社区插件中启用 `Ownly`。

插件核心文件：

- `manifest.json`
- `main.js`
- `styles.css`

### 平台依赖重置

`esbuild` 使用原生二进制。如果同一个 checkout 同时被 Docker/Linux 和 Windows 使用，`node_modules` 里可能留下错误平台的二进制。

如果 `npm run package:obsidian` 报错说当前安装了 `@esbuild/linux-x64`，但 Windows 需要 `@esbuild/win32-x64`，请在当前要构建的平台上重装依赖：

```bash
npm run deps:reset
npm run package:obsidian
```

之后如果切回 Docker/Linux 构建，也需要在 Docker/Linux 内再次执行同样的依赖重置。

## 验证

运行全量验证与检查：

```bash
npm run validate
```

通过 Agent 友好的 CLI 操作 Vault 数据：

```bash
npm run wyqd -- --vault /path/to/vault object list
```

## 示例 Vault

可重复使用的演示 fixture 位于：

```text
samples/wyqd-vault/
```

它可作为 Web 与 Obsidian 插件 QA 的一次性测试 Vault。

仅运行 Obsidian 插件端验证：

```bash
npm run validate:obsidian
```

Obsidian 验证流包含以下检查：

- TypeScript 插件编译
- 插件打包构建
- 发布文件非空检测
- 检查 `package.json` / `manifest.json` / `versions.json` 版本号的一致性

## 当前插件能力

Obsidian 插件当前支持以下功能：

- Ownly 工作台视图
- 左侧边栏 (Ribbon) 入口
- 命令面板 (Command palette) 入口
- 设置面板
- 针对 `Objects`、`Accounts`、`Snapshots`、`Reviews` 目录的 Vault Markdown 仓库读写
- 对象控制台概览
- 对象详情预览
- 打开源 Markdown 文件
- 保存极简对象字段
- 推进对象状态 (含二次确认)
- 对象的归档与恢复
- 本地 Free / Pro 年度 / Lifetime 早期支持者的许可证验证机制 (Alpha)
- Ownly Doctor 数据体检及摘要
- Obsidian 主题适配，以及基于系统颜色偏好的 Web 深色模式

## 数据存储

Ownly 将所有数据以 Markdown 文件形式存储在 Obsidian Vault 的 `Ownly/` 目录下：

```text
Ownly/
  Objects/
  Accounts/
  Snapshots/
  Reviews/
  Archive/
    Objects/
    Accounts/
    Snapshots/
    Reviews/
```

免费版用户始终拥有对自身 Markdown 数据的完整访问权限。Ownly 绝不会因许可证状态而锁定、加密、删除或阻碍数据的导出。
