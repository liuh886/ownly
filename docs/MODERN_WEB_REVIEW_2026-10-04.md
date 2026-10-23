# Ownly 现代网页体验与代码审查（2026-10-04）

## 对照方式

本轮对照现代工具型网页的导航和键盘操作惯例，沿实际代码与浏览器操作追查问题并修复。参考的是产品官方文档；没有登录 Linear、Notion 或 GitHub 私有工作区进行竞品实测。

| 对照来源 | 对 Ownly 的检查重点 |
|---|---|
| [Linear conceptual model](https://linear.app/docs/conceptual-model) 中的视图与 URL | 当前视图是否可通过链接定位，刷新和返回是否保留导航上下文 |
| [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) 的前进、后退及键盘导航 | 检查浏览器原生历史操作和日常键盘流程，而不增加冲突快捷键 |
| [GitHub keyboard shortcuts](https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts) | 检查常用入口和动作是否可用键盘完成 |
| [WAI Menu Button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) | 打开菜单后的焦点、方向键、Escape，以及正确的菜单/展开面板语义 |
| [WAI status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html) | 加载反馈是否包含可被读出的文字，而不只有隐藏骨架 |
| [WAI focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) | 主导航隐藏、菜单关闭、对象状态变化后，焦点是否仍能进入可用控件 |
| [MDN reduced motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | 检查整个应用的动画以及 JavaScript 显式平滑滚动 |

实现前读取了仓库安装的 Next.js 16.3.8 文档：`03-architecture/accessibility.md`、`01-app/01-getting-started/04-linking-and-navigating.md` 的 Native History API，以及 lazy-loading 指南。Web 视图使用原生 History API，保留框架 history state；Obsidian 保持内部导航。

## 确认问题与修复

| 优先级 | 实际问题与原因 | 已落实的修复 |
|---|---|---|
| P1 | 首页快捷新增先保存模板意图再切页；`AppShell` 以 `activeTab` 为 key 整体重建 `TabRenderer`，丢失模板与焦点目标 | 保持 `TabRenderer` 实例稳定，真实浏览器验证订阅模板、解析字段、类型与录入框焦点 |
| P1 | 分享链接路由监听绑定在重复挂载的 `TabRenderer` 上；URL fragment 未消费时，切页后再次强制进入 Planner | 分享路由只响应初始入口/新的 hashchange；Planner 收到副本后仅消费对应片段，忽略旧弹窗清理新链接的请求，保留其他 fragment/query/history state |
| P2 | 五个页面仅存 React 状态，刷新回首页，浏览器后退无法返回上一视图 | Web URL 添加 `view`，支持深链、刷新、Back/Forward；相同视图不增加历史记录，Home 清除 view，其他 URL 参数保留 |
| P2 | 本地切页没有对应的页面标题和稳定焦点入口；跳过链接的 main 不可聚焦 | Web 更新当前页 document title；页标题可接收切页焦点，已有模态框时不抢焦点；main 可供跳过链接聚焦，Obsidian 不覆盖宿主标题 |
| P2 | 向下滚动会把主导航设为 inert/aria-hidden；键盘用户需先使它重新出现 | 折叠时保留导航的可访问性和 Tab 顺序，Tab/焦点进入即显示；添加主导航名称并取消未完成的滚动 frame |
| P2 | 页头连接菜单、对象操作菜单只有 menu 角色，缺少实际键盘行为；偏好 select 被放进伪 menu；关闭菜单时聚焦页头导致滚动，吞掉下方按钮的首次真实点击 | 真菜单支持打开定位、方向键/Home/End、Escape 和焦点返回；偏好改为 disclosure；外部指针关闭时恢复焦点使用 preventScroll，原本点击立即执行；共用对象菜单 hook，覆盖指针/焦点竞态、取消弹窗及退役后触发器消失 |
| P2 | 对象搜索仅有 placeholder；创建行程的视觉 label 没有关联字段；导入框、按天时区及复盘评分等字段缺名称；模式按钮被声明为不完整 tablist | 搜索增加永久程序化标签；行程字段使用唯一 ID/htmlFor，补充导入/时区/复盘字段名称；模式选择采用按钮 group 与 aria-pressed |
| P2 | 录入格式帮助只响应 hover，手机和键盘无法正常打开 | 使用原生 details/summary，点击和 Enter 可打开，提示限定在表单宽度内 |
| P2 | MotionConfig 仅覆盖局部，底部导航和弹窗不在范围内；多处显式 smooth scroll 无视减少动效偏好 | MotionConfig 覆盖整个 AppShell；Composer、Review、Planner 的滚动根据实际 media query 使用 auto 或 smooth |
| P2 | 320px 首页 PWA 提示不收缩（326px）；复盘评分撑大隐式网格列（377px）；Planner 长行程下拉框的外层不受宽度限制（334px） | 首页提示窄屏换行；复盘显式 minmax(0,1fr) 单列且评分窄屏换行；行程选择容器与 select 均限制可用宽度；不使用整页 overflow-hidden 遮盖问题 |
| P2 | 动态页面 loading 使用 status，但只有 aria-hidden 骨架，没有可读状态文字 | 共享 Loading 组件包含本地化 loading 文本和 aria-busy，仍保留动态分包 |

## 验证证据

初始构建实际浏览器记录：进入 Accounts 的 URL 仍为 `/app/`，刷新标题回到 Home；320px 首页测得 326px 横向宽度。导航隐藏时确实存在 inert 祖先。初始较短等待只作为定位线索，最终响应式验证等待动态页面加载后再次测量。

`tests/smoke/modern_web_smoke.py` 对生产静态导出执行：真实 OPFS 文件句柄接入、视图 URL/标题/刷新/前进后退、首页订阅模板及字段/焦点、减少动效下实际 scrollIntoView 参数、键盘展开帮助、从页尾 Tab 进入折叠导航、页头/对象菜单键盘、行程字段标签点击，以及分享入口消费。再用完整演示数据检查 320/768/1024/1440px × 五个页面。

最终门禁结果在浏览器和共享构建验证完成后记录。日志和前后截图存放在 Git 忽略的 `node_modules/.cache/ownly-ux-audit-20261004/`，避免将个人运行产物提交到仓库。

## 范围

这是一轮代码、操作与响应式审查，未声明完整 WCAG 合规；尚未做真实屏幕阅读器、Windows 文件夹选择器、Safari/iPhone 或线上分享服务操作。OPFS 仅替换系统选目录界面，文件句柄、IndexedDB 和 Markdown 读取写入仍为 Chromium 原生实现。此前报告中的开发工具链依赖迁移维持独立事项。本轮不部署，也不提交混合的既有工作区改动。
