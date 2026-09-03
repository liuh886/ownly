# Phase 2: Collection 分享预览 — 公开 Collection Preview 增长入口

> 技术已具备：`OwnlyCollectionExportV1`（`src/domain/capture.ts:137` `buildCollectionExport`）+ `src/extension/export.ts:8` `downloadCollectionJson`  
> 目标：从「下载 JSON」到「可分享链接 + 公开预览页」，成为增长入口

## 要做

1. **分享链接生成**（本地优先）
   - 复用 `PlannerRepository` 的本地存储或新增 `CollectionShareToken`（`collectionId + HMAC`），生成 `https://ownly.app/c/:token`（或本地 `/#/c/:token` 占位）
   - 权限：默认「仅查看」，可选「可导入」

2. **公开 Preview 页**（只读）
   - 路由：`/c/:token` → 读取 `OwnlyCollectionExportV1` → 渲染 List（标题、来源、地址、评分、价格、标签）
   - 组件：`src/components/collection/CollectionPreview.tsx`（卡片列表 + 地图缩略 + `导入到我的行程` 按钮）
   - SEO：`title` / `description` 源自 `collection.title` + `place_count`

3. **导入闭环**
   - 按钮：`导入到我的行程` → 复用 `ImportCandidatesModal.tsx:50` 的 `parseCaptureCollectionExport` + `capturePlaceToPlannerPlace` → 跳转 `PlannerHome`

## 不做（本阶段）

- 服务端持久化 / 账号体系（先本地 + 静态 token，验证转化后再上云）
- 评论 / 点赞（仅浏览 + 导入）

## 验收

- [ ] A 用户导出合集 → 生成链接 → B 用户无登录打开预览可见前 20 条
- [ ] 点击导入 → places 正确落入 B 的 `Trip Places`，`ImportReport` 显示 `created`
- [ ] 与现有 Export 不冲突（保留下载 JSON 作为降级）

## 拆分

- PR-1：`collection-share-link` 生成 + 本地 token 存取
- PR-2：`CollectionPreview` 只读页
- PR-3：导入按钮 + 埋点（分享→预览→导入转化）
