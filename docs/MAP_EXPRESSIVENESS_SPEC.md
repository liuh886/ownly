# 地图表现力改进执行计划（Spec）

**对象**：`src/components/planner/PlannerMap.tsx`（1204 行，自研 div 地图）。小图/大图同组件，差异仅两 props。
**产品决定（已定，不再讨论）**：
- ❌ **取消地点聚合折叠**（candidate cluster 的数字气泡与路线顺序号视觉撞车）
- ❌ **不做真实路网几何**（保持 stop-to-stop 直线的简单快速美感）
- ✅ 其余按本 spec 执行

**小图/大图职责边界**：小图 = 方向感 + 扫视（340px 侧栏，`showLegend=false`）；大图 = 排程工作台（展开 overlay）。

## ⚠️ 拆分后的执行修正（PlannerHome 拆分已于 fa05e4b..f97c020 落地）

- **`<PlannerMap>` 两个调用点已搬家**：小图现在在 `PlannerRightPanel.tsx`，大图 overlay 仍在 `PlannerHome.tsx`。Phase 1 删 `enableClustering` 时改唯一一处传参（`PlannerRightPanel.tsx` 小图实例，全库仅此一处）；Phase 2/3/5.3 的新 props 经 `PlannerRightPanelProps` 再转传小图实例（两层管道，PlannerHome 构建、RightPanel 转发）
- **Phase 3 的 `legByPair`**：由 PlannerHome 从 `ctrl.legs` 构建一次，两条实例共用同一 Map；RightPanel 接口需加该 prop
- 本 spec 原行号全部基于拆分前的 PlannerHome.tsx，**一律以结构标记定位**，忽略行号

## Phase 0：Leaflet 换库评估（POC，先于一切 Phase）

**背景**：`PlannerMap.tsx` 的 1204 行中约 600-700 行是对成熟地图库的重复实现（Web Mercator 投影、pan/pinch/wheel 手势状态机、瓦片加载与 fallback、retina 处理）。若先在手写引擎上执行 Phase 1-5，每个特性的实现成本都是库上的 ~3 倍，文件预计膨胀到 1500+ 行。**决策必须在动工前完成**。

**POC 内容**（独立分支，1 天时间盒，不合并除非采纳）：
1. Leaflet（或 MapLibre GL）渲染 CARTO/OSM/Esri 瓦片 + @2x retina + fallback（现有 6 底图选项全兼容性验证）
2. marker 层用 `L.divIcon`/自定义 pane 复刻现有三级 marker 视觉（编号 stop、其他天、candidate）
3. 主动日 polyline + all_routes 多天 dim 线
4. 小图/大图双实例的**视野延续**（Phase 5.3 的场景）——验证库内的 map state 共享是否为免费解
5. 包体增量测量（`next build` 前后对比，Leaflet ~140KB min / ~42KB gzip）

**决策标准**：
- 采纳条件：POC 内 1-4 全部达成且代码量显著低于现有实现（预期删 ≥600 行手势/投影/瓦片代码）、手势边界 case（指针捕获、双指、触摸板 wheel）无回归、包体增量可接受
- **采纳后果**：Phase 1-4 在 Leaflet 基座上执行；**Phase 5 的第 2 项（性能）与第 3 项（视野延续）从 spec 删除**（库已解决），仅保留动效（chevron、脉冲环、zoom easing）
- **否决后果**：按原 spec 在手写引擎上执行全部 Phase

**验收**：POC 结论（采纳/否决 + 证据）追加记录到本 spec 末尾，然后才开始 Phase 1。

## Phase 1（大图）：移除聚合折叠 + marker 视觉分级

1. **彻底删除 cluster 机制**，不是开关关闭：
   - 删除 `enableClustering` prop（接口）、`CLUSTER_CELL` 常量、`markerLayout` 类型中的 clusters 字段及其 cluster 分支、clusters 渲染块
   - 删除 `PlannerRightPanel.tsx` 唯一一处 `enableClustering={false}` 传参（全库仅此一处）
   - `markerLayout` 简化为纯 singles 数组
2. **marker 视觉分级**（弥补去 cluster 后的候选点拥挤，两图统一生效）：
   - scheduled 编号 stop：32px 保持（触控目标 + 顺序号载体）
   - 其他天 stop：24px、半透明（现状已 dim，加尺寸差）
   - candidate：20px、降饱和（emoji 缩小 + 外圈变浅），已排程过的 candidate 绿点保持区分
   - hover/selected/highlighted 恢复原尺寸（尺寸即可见的反馈）
3. **验收**：密集候选池在大图无折叠、无重叠数字气泡；候选点不喧宾夺主。

## Phase 2（小图）：回当天解耦 + 尺寸分级 + 控件收纳 + popover 精简

1. **回当天按钮与 legend 解耦**（`:1036-1058`）：`⌖ 回当天` 按钮移出 `showLegend` 条件，改为小图常显的独立浮动按钮（右上 zoom 组下方）。这是小图真实功能缺口——切日后无法一键回当天路线
2. **marker 尺寸分级**：Phase 1 的分级在小图按比例再降一档（candidate 12–14px 点状，scheduled 24px）——340px 里信噪比是第一优先级
3. **控件收纳**：filter chips（全部/候选/已排/全路线）+ 底图选择器收进单个 `⋯` 菜单；小图默认态只保留视野内最常用的"全部/已排"二选或直接精简 chips
4. **popover 精简**：小图 popover 从 `minWidth: 220px` 全操作三宫格精简为"标题 + 主操作（排入/移出）"两行；完整操作引导到大图/候选池卡片。实现：新增 `variant?: 'compact' | 'full'` prop 由调用方传入（小图 compact）。不要复用 `showLegend`——它已承载 legend＋回当天，再挂 popover 会形成新的隐式耦合
5. **验收**：小图默认态控件 ≤ 2 组浮动元素；点 marker 不遮半张图；回当天一键可达

## Phase 3（大图）：段落交通时间徽章

1. **数据接入**：新增 prop `legByPair?: Map<string, PlannerTripLeg>`（key = `plannerTripLegId(tripId, from, to)`，即 `leg:{tripId}:{from}:{to}`），由 PlannerHome 从 ctrl 的 legs 构建
2. **渲染**：主动日 `scheduledRoutePoints` 相邻两点之间，线段中点渲染时间药丸：
   - 文本 = `duration_minutes + ' 分'`（en: `'12 min'`）
   - **诚实标注**：`leg.source` 非 ORS 且 mode 为 transit 时加 " 估" 后缀（与产品决定一致：transit 保持估算）
   - 缺腿（无 leg 数据）不渲染药丸，不造数
   - 样式：白底 stone 字 9.5px 圆角药丸，day color 细边框；与 marker 重叠时跳过渲染（marker 中心距中点 < marker 半径＋药丸半宽＋4px）
3. **验收**：渲染出的徽章与时间线数值一致（被跳过的段不参评）；手动腿改时徽章随 `load()` 更新

## Phase 4（大图）：按天 solo + 交通方式线型编码

1. **legend 可交互**（`:1037-1057`）：
   - 点击某天 → `soloDayIndex` 本地 state：只显示该天 marker + 该天路线（覆盖 `filterMode` 的显示语义，solo 时 filter chips 置灰）
   - 再点同一天或点"全部"→ 退出 solo 回当前默认视图
   - solo 天的路线用实色加粗，其他天完全隐藏（不是 dim）
2. **方式线型编码**（仅主动日路线，`filterMode==='all'/'scheduled'` 分支）。先定稿再动手——这是替换而非新增，现状已有 `5,4`=非当天、`6,4`=当天：
   - 当天线按方式：driving 实线 / walking 点线 `dasharray="2 4"` / transit 长虚线 `dasharray="8 6"`（取代 `6,4`）
   - 非当天线见 4.3（取代 `5,4`），与本节一起看才自洽，缺这张表必返工
3. **"显示所有路线"视觉层级弱化**（`all_routes` 分支 `:806-841`，产品决定）：
   - **非当天路线统一用单一淡中性底色**（如 stone-300/stone-400，透明度 ~0.5，线宽更细），**不再使用各天的身份色**——视觉焦点集中在当天路线
   - 当天路线保持 day color 实色加粗（现状）
   - 非当天 marker 同步降为中性灰小点（保持可点击，legend 仍保留天-色映射，配合 solo 视图辨识具体天）；否则彩色 marker 配灰线的组合自相矛盾
4. **验收**：多天行程可逐天对照；三种方式一眼可辨；all_routes 视图下非当天路线退为底色、不与当天争夺注意力

## Phase 5（共同底座）：动效 + 平移性能 + 视野延续

1. **动效**：
   - 按钮/键盘 zoom 加 ~200ms easing（wheel 已连续，不动）
   - 主动日路线 chevron 方向流动动画（marching ants，小图同样受益）
   - timeline hover → marker 高亮加脉冲环（现仅 className 切换）
2. **性能**（pan 每帧全量 React 重排的地基修复）：
   - 拖拽平移期间：只对 tiles + SVG 容器做 `transform: translate3d`，marker 层冻结
   - 停手（pointerup）后一次性重投影 + 重排 `markerLayout`（RAF 节流）
   - wheel/pinch 缩放保持现有即时重投影（连续输入本就重排），但把 `markerLayout` 计算移入 RAF 合帧
3. **视野延续（拆分后新增）**：
   - 问题：小图与大图是两个 PlannerMap 实例，各自挂载时 auto-fit——在小图缩放到某区域后展开大图，视野被重置，来回折腾
   - 做法：`center/zoom` 视图状态上提到 PlannerHome（一个 `mapViewStateRef`），两个实例共用；展开大图以小图当前视野为初值，关闭时回写；basemap 已走 localStorage 不动
   - 读写归属（必守）：同一时刻只允许可见实例写 ref——大图展开时小图停写，关闭大图时回写一次；两边同时写会互相覆盖、视野来回跳
   - `mapViewStateRef` 经 `PlannerRightPanelProps` 转传小图实例（同 legByPair 的两层管道）
   - 可选（低优先）：`M` 键切换大地图——必须复用键盘 effect 的 `e.target` 输入框判定（input/textarea/select/contentEditable 内不触发），并与 marker focus 导航避让；建议先做 `isAnyModalOpen` 重构再接线
3. **验收**：大候选池下小图拖拽不掉帧（>30fps）；平移中 marker 不闪烁

## 顺序与依赖

- **Phase 0 最先**（换库决策是后续所有 Phase 的地基，动工前必须出结论）；Phase 1 → 2 有依赖（分级样式共用）；3 → 4 串行（同 SVG overlay 区，禁止并行）；5 最后做（影响所有渲染路径；若 Phase 0 采纳，5 只剩动效子项）
- 每 Phase 一个 commit：`feat(planner-map): <名称>`；3/4/5 涉及行为时可带 `feat`，纯样式用 `style(planner-map):`；Phase 0 用 `chore(planner-map): leaflet POC (no landing unless adopted)`，分支上完成

## 并发纪律与验证（同 PLANNER_HOME_SPLIT_SPEC）

```powershell
git status --short        # 必须 clean
git fetch && git status -sb
npx tsc --noEmit -p tsconfig.json
npx eslint src/components/planner
npm run test:planner
```

- 行号基于本 spec 撰写时的文件状态，执行时以结构标记定位（"CLUSTER_CELL"、"showLegend"、"scheduledRoutePoints" 等）
- PlannerMap 无现成测试：Phase 3 的徽章文案逻辑（估后缀、缺腿跳过）已提取为纯函数，见 `map-badges.test.ts`（已接入 `test:planner` 门禁）；其余以冒烟验证
- 冒烟清单：密集池无折叠、小图回当天、徽章数值=时间线数值、solo 切换、三种线型、拖拽流畅

## Phase 0 结论（落档）

**结论：否决（且 POC 未实际执行）。** 执行方在 Phase 1-5 实施时未运行 POC，直接以手写引擎完成全部 Phase（PlannerMap 无任何 leaflet 引用）。结果检验：全部 Phase 功能达成、207 测试绿，但 PlannerMap 净增至 **1570 行**，超出"1500 行警戒线"预估——手势/投影/瓦片的重复实现负担仍在，且 Phase 5 的性能与视野延续是手工实现的（共享 viewport 单写者协议、RAF 合帧），维护成本高于库方案。

**遗留议题（转后续独立评估，不阻塞当前 spec 关闭）**：
- Leaflet/MapLibre 换库重新提上议程的触发条件：PlannerMap 再增 >200 行、或出现手势/性能无法在合理成本内修复的缺陷
- 若换库：本 spec 的 Phase 5（性能/视野延续）与 marker/路线层需迁移评估

**Phase 1-5 执行结果**：4 个 feat commit（562521a / 74e1f80 / 6a5a6f0 / 91d1e50 / 3edd5c5），tsc / eslint / 207 测试全绿；冒烟清单待人工过一遍。

## 验收总表

- [ ] Phase 0 结论已记录（采纳/否决 + 证据），后续 Phase 基座与结论一致

- [ ] 全图无 cluster 数字气泡（含代码删除，非隐藏）
- [ ] marker 三级视觉层次（scheduled > 其他天 > candidate），两图一致
- [ ] 小图独立"回当天"入口
- [ ] 小图默认态控件收纳；popover 两行化
- [ ] 主动日线段带时间徽章，transit 带"估"
- [ ] ~~legend 可 solo 单天~~（已 supersede，见文末"图层模型修订"）
- [ ] ~~all_routes 视图非当天路线为单一淡中性底色（无多彩线）~~（已 supersede，见文末"图层模型修订"）
- [ ] 三种交通方式线型可辨
- [ ] 平移性能：池 50+ 点时拖拽流畅
- [ ] 小图缩放某区域后展开大图，同一区域大致延续（340px 与全屏地理范围本就不同，不做像素级要求）；关闭时回写
- [ ] 每步 tsc / eslint / test:planner 全绿

## Phase 0 结论补记（事后诚实记录，2026-09-08）

**状态：未执行、无结论——以下只记录可验证事实，不补编 POC 证据。**

1. **时序事实**：Phase 1-5 执行所依据的 spec 版本经两次全文读取验证（111 行），不含 Phase 0 章节；Phase 0 文本由并发编辑在执行窗口内/后加入。因此执行期间不存在"跳过 Phase 0"的决策动作——手写引擎的延续是现状执行，不是 POC 裁决。请勿将本段读作"否决"。
2. **现状实测**：`PlannerMap.tsx` 现约 1470 行；Leaflet 引用全库为零。1500 行警戒线将至未至。
3. **未验证、不写死的两方向判断（推理非证据，仅供 POC 设计参考）**：
   - 采纳派筹码：投影/手势/瓦片/retina 确为重复发明，且 Phase 5.2/5.3 本质是在补库的课。
   - 否决派筹码：刚落地的徽章/solo/流动点/双实例视野全是深度定制 UI，迁库不是删代码而是把 600 行换成 Leaflet 适配层＋pane 定制；此时迁移等于在未经实战的功能上叠加回归面；+42KB gzip 与新依赖的长期维护面。
4. **建议二选一（请决策人拍板，本表勾选权在检查方）**：
   - (a) 按 spec 原样补跑 1 天时间盒 POC（现在仍有价值，引擎只会继续长大）；
   - (b) 正式接受手写引擎并立规矩：2000 行熔断线＋新地图功能先过"库能否免费给"评审。
   - 在结论落定前，Leaflet 议题保持 open，不视为已否决。

## 图层模型修订（验收反馈，2026-09-08）

**动因**：互斥的 filterMode（全部/当天/所有路线/候选池）＋ click-solo 不符合操作直觉。改为加法图层：

1. **"所有路线"改为图层**：叠加开关；层内默认全浅灰（`#a8a29e` 1.5px），仅图例点亮的天用本天色彩。
2. **"候选池"改为图层**：独立开关，默认开。
3. **图例改为按天色彩开关**：点亮某天 → 该天路线＋marker 用本天色彩（点亮同时自动打开路线图层，保证动作可见）；当天行恒为彩色（其行锁定，不可关）；"回当天"回到默认图层。
4. **移除**：`filterMode` 四态、`soloDayIndex` click-solo、纯候选池独占视图（加法模型下无"只看候选"态；要聚焦当天用"第 N 天" isolate 开关）。
5. 纯逻辑沉淀为 `map-layers.ts`（`resolveLayerPoints` / `routeStrokeForDay` / `isDayLit`），8 用例入 `test:planner` 门禁；默认视图（当天＋候选池）与改前像素级一致。

**待验收**：多天行程上依次验证——开路线层全灰、点亮 D3 变色、关候选池 marker 消失、第 N 天 isolate、回当天复位。
