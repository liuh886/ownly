# Planner Milestones 1-5 实施计划与进度追踪

## 一、Milestone 1: 可靠导入与精准 ACK
- [x] 1.1 `PlannerRepository.importCapturedPlaces()` 返回实际成功持久化的 place IDs
- [x] 1.2 `syncCapture()` 仅 ACK 已成功写入的 IDs，失败条目保留在 Capture Inbox
- [x] 1.3 同批导入即时更新身份索引，避免同一地点在一批数据中重复写入

## 二、Milestone 2: 排期冲突感知
- [x] 2.1 增强营业时间与 preferred window 冲突检测，并处理跨午夜营业场景
- [x] 2.2 实现 `checkDayScheduleCollisions(places, date)`：显式时长过载与相邻站点长距离提醒
- [x] 2.3 在 Day Skeleton 与地点卡片展示结构化警告
- [x] 2.4 缺失 `duration_minutes` 不再假定 60 分钟，避免虚构日程负荷

## 三、Milestone 3: 外部候选导入
- [x] 3.1 `parseImportPayload(rawText, tripId)` 支持 JSON、CSV、KML、纯文本与 Google Maps 链接
- [x] 3.2 `ImportCandidatesModal` 支持粘贴或上传文件导入 Research Pool
- [x] 3.3 外部导入使用独立 `importExternalCandidates()` 入口，不借用 Capture ACK 语义
- [x] 3.4 保留 `source_category`、评论量及结构化价格等高价值 research facts

## 四、Milestone 4: 预算估算与真实账本分离
- [x] 4.1 `parsePlaceExpenseEstimate(place)` 直接消费 `price_currency/min/max/unit` 等结构化价格事实，原始 `observed_price` 仅作为证据与补充解析来源
- [x] 4.2 Day 头部并列展示“预估”与“实记”，但预估值不会自动写入真实 AA 账本
- [x] 4.3 `person` 单位按行程成员数计算；缺失汇率的金额显式排除并提示，不使用 1:1 fallback
- [x] 4.4 Markdown 账本汇总先统一折算至 Trip Currency，再计算总额

## 五、Milestone 5: 行程交付
- [x] 5.1 `exportTripToMarkdown()` 输出每日安排、Google Maps 路线、候选池与真实费用账本
- [x] 5.2 Planner 增加一键复制 Markdown 行程单
- [x] 5.3 保留 Candidate Pool → Day 的快速排期、顺序调整、锁定与退回闭环
- [x] 5.4 完整验证 `validate:fast / shared / web / obsidian / extension`

---

## Review 结论

- **导入可靠性**：成功写入与 ACK 一一对应；单条失败不会导致其从 Capture Inbox 消失，重试保持幂等。
- **数据边界**：Capture 与外部文件都是 Research 输入；Planner/Vault 仍是 Trip、排期和用户决策的唯一权威。
- **冲突提示**：当前提供确定性的启发式提醒，不把缺失时长或未知交通时间伪装成事实。
- **预算语义**：地点价格属于 estimate，AA Ledger 属于 actual；二者可比较但不自动互相转换。
- **币种语义**：结构化 `price_currency` 优先于裸 `$ / ¥` 推断；未知汇率显式暴露。
- **验证**：修正后 `validate:fast`、`validate:shared`、`validate:web`、`validate:obsidian`、`validate:extension` 全部通过。
