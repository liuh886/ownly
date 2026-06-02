@AGENTS.md

---

# Ownly 项目开发必读 (Developer Workflow)

## 路径别名

| 别名 | 路径 | 说明 |
|------|------|------|
| `@repo` | `/mnt/GitHub/wyqd-app` | 源码仓库（开发环境） |
| `@vault` | `/mnt/zhihaol` | Obsidian Vault（宿主机 `D:\Documents\zhihaol`） |
| `@plugin` | `/mnt/zhihaol/.obsidian/plugins/ownly` | 插件运行时目录 |

## 代码同步规则 (P0)

Ownly 是一个 Obsidian 插件。源码仓库（`@repo`）是开发的主战场，但用户的 Obsidian Vault（`@vault`）中 `.obsidian/plugins/ownly/` 下的文件才是实际运行的版本。

**每次代码变更并构建完成后，必须将以下三个文件从仓库同步到 Vault 插件目录：**

```
@repo/main.js       → @plugin/main.js
@repo/styles.css    → @plugin/styles.css
@repo/manifest.json → @plugin/manifest.json
```

同步命令（在容器内执行）：

```bash
cp /mnt/GitHub/wyqd-app/main.js /mnt/zhihaol/.obsidian/plugins/ownly/main.js
cp /mnt/GitHub/wyqd-app/styles.css /mnt/zhihaol/.obsidian/plugins/ownly/styles.css
cp /mnt/GitHub/wyqd-app/manifest.json /mnt/zhihaol/.obsidian/plugins/ownly/manifest.json
```

> ⚠️ **不要忘记这一步。** 漏掉同步会导致用户在 Obsidian 中看到的仍是旧版本，造成困惑。

## Git 提交与推送规则 (P0)

**每次集中完成功能代码更新后，必须：**

1. `git add` 相关变更文件（避免包含无关文件）
2. `git commit` — 提交信息应简洁描述本次变更内容
3. `git push` — 推送到远程仓库

```bash
cd /mnt/GitHub/wyqd-app
git add -A
git commit -m "feat: <变更描述>"
git push
```

> 目的是保持远程仓库与本地开发同步，避免积压大量未推送的变更。

## 标准开发流程 (Checklist)

完成一轮功能开发时，按顺序执行：

1. ✅ 编写/修改源码 (`src/`)
2. ✅ 构建项目 (`npm run build`)
3. ✅ **同步产物到 Vault**（main.js / styles.css / manifest.json）
4. ✅ **Git commit + push**
5. ✅ 验证：让用户在 Obsidian 中刷新插件确认生效
