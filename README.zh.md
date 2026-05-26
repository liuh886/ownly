# WYQD

WYQD 是一款 Obsidian 原生、本地优先的个人决策账本，用 Markdown 管理实物、订阅与体验成本。

**Own less, Live more, Decide better.**

它目前支持两种运行环境：

- 作为 Web App (在浏览器或通过 PM2 部署使用)
- 作为私有 Obsidian 插件 (在本地 Vault 内使用)

产品发展方向以 Obsidian 插件为主，Web App 版本阶段性保持兼容，作为浏览器运行时与开发验证界面。

## 版本说明

当前目标版本：`0.2.0` (Alpha/Beta 过渡期)

`0.2.0` 为 Next.js 和 Obsidian 双运行环境提供了稳定的基线。目前用于追踪实物、成本和快照的核心工作流已在功能上开发完善。

许可证：MIT。

## 国际化 (i18n)

WYQD Obsidian 插件原生支持英文 (English) 与中文 (`zh`) 双语。您可以在 Obsidian 内的 WYQD 插件设置页面切换语言首选项。

## Web App

开发环境运行：

```bash
npm run dev
```

生产环境静态构建：

```bash
npm run build
```

生产构建产物将输出到 `out/` 目录，可使用现有的 PM2 静态服务器流进行部署。

## Obsidian 插件

构建私有插件包：

```bash
npm run build:obsidian
```

生成可安装的私有插件文件夹：

```bash
npm run package:obsidian
```

生成的插件核心文件包括：

- `manifest.json`
- `versions.json`
- `main.js`
- `styles.css`

打包输出路径：

```text
dist/obsidian/wyqd/
  manifest.json
  versions.json
  main.js
  styles.css
```

手动安装到测试 Vault 中：

```text
.obsidian/plugins/wyqd/
  manifest.json
  versions.json
  main.js
  styles.css
```

然后在 Obsidian 社区插件选项中启用 `WYQD`。

### 真实 Vault 安装

1. 构建并打包插件：

```bash
npm run package:obsidian
```

2. 将插件文件夹复制到某个 Vault：

```bash
mkdir -p /path/to/vault/.obsidian/plugins
cp -R dist/obsidian/wyqd /path/to/vault/.obsidian/plugins/wyqd
```

在 Ductor 的常规 Vault 挂载中，可将 `/path/to/vault` 替换为 `/mnt/zhihaol`。

3. 打开 Obsidian 的 `Settings -> Community plugins`，如有需要先关闭 Restricted mode，然后启用 `WYQD`。

4. 从左侧 Ribbon 图标或命令面板 `Open WYQD workspace` 打开 WYQD。

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

- WYQD 工作台视图
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
- WYQD Doctor 数据体检及摘要
- Obsidian 主题适配，以及基于系统颜色偏好的 Web 深色模式

## 稳定性说明

仍在完善中 / 暂未稳定：

- 除 Vault 本地原生同步以外的云同步特性
- 真实的 Lemon Squeezy 许可证服务端验证 (当前仅支持本地 alpha 密钥测试)
- 在各色 Obsidian 自定义主题下的全方位截图级别 QA
- 提交至公开的 Obsidian 社区插件商店

免费版用户始终拥有对自身 Markdown 数据的完整访问权限。WYQD 绝不会因许可证状态而锁定、加密、删除或阻碍数据的导出。
