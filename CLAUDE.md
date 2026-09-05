@AGENTS.md

---

# Ownly 项目开发必读 (Developer Workflow)

## 架构概览与多端运行时

Ownly 是一个 Local-First 的所有物决策与旅行规划系统，由 5 个核心运行时组成：
1. **Web App / PWA** (`src/app/`, `src/components/`) — 基于 Next.js Turbopack 构建的独立 Web 决策台与行程规划工作台。
2. **Obsidian Plugin** (`src/obsidian/`) — 嵌入 Obsidian 的原生插件视图。
3. **Capture Chrome Extension** (`src/extension/`, `extension/`) — MV3 Chromium 侧边栏与 6 大平台页面采集器。
4. **Local MCP Server** (`packages/mcp/`) — 面向 Claude / Codex / 智能体系统的两阶段确认事实接口。
5. **Agent CLI** (`scripts/cli/`) — 确定性本地 Markdown 操作终端工具。

## 路径别名

| 别名 | 路径 | 说明 |
|------|------|------|
| `@repo` | `D:\Documents\GitHub\Ownly` | 源码仓库主目录 |
| `@vault` | `D:\Documents\zhihaol` | 本地 Obsidian 测试 Vault |
| `@plugin` | `D:\Documents\zhihaol\.obsidian\plugins\ownly` | Obsidian 插件运行时目录 |

## 开发与验证门禁 (Quality Gates)

在提交任何代码前，必须执行并通过以下对应校验门禁：

```bash
# 1. 快速静态检查 (TypeScript + ESLint + Terminology + Membership)
npm run validate:fast

# 2. Chrome Extension 校验 (Manifest + Build + 单元测试)
npm run validate:extension

# 3. 共享契约与运行时对齐测试 (MCP + CLI + Planner + Parity)
npm run validate:shared

# 4. Next.js 生产环境构建校验
npm run build
```

## Obsidian 插件同步规则

当开发涉及 Obsidian 插件相关代码（`src/obsidian/`）时，构建后需同步产物至本地测试 Vault：

```bash
# 构建 Obsidian 插件产物
npm run build:obsidian

# 同步至本地测试 Vault
cp main.js /path/to/vault/.obsidian/plugins/ownly/main.js
cp styles.css /path/to/vault/.obsidian/plugins/ownly/styles.css
cp manifest.json /path/to/vault/.obsidian/plugins/ownly/manifest.json
```

## Git 提交与推送规则 (P0)

每次集中完成功能开发或缺陷修复后：
1. `git add` 相关变更文件（避免夹带无关临时文件）
2. `git commit -m "feat/fix/chore: <清晰描述>"`
3. `git push origin <branch>` 保持远程同步

## 标准开发流程 (Checklist)

1. ✅ 编写/修改源码 (`src/`)
2. ✅ 执行对应自动化测试与验证门禁 (`npm run validate:fast` 等)
3. ✅ 必要时构建多端产物 (`npm run build`, `npm run build:extension`)
4. ✅ 更新文档与 `tasks/todo.md`
5. ✅ Git commit + push
