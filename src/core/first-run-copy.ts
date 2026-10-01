import type { FirstObjectChoice } from './first-object-copy';
import type { WYQDLanguage } from './i18n';

export interface FirstRunCopy {
  eyebrowModel: string;
  eyebrowRecord: string;
  progressLabel: string;
  modelTitle: string;
  modelDescription: string;
  model: ReadonlyArray<{ icon: string; title: string; body: string; example: string }>;
  modelNext: string;
  recordTitle: string;
  recordDescription: string;
  choices: Record<FirstObjectChoice, { title: string; description: string; example: string }>;
  choiceIcons: Record<FirstObjectChoice, string>;
  sampleTitle: string;
  sampleBody: string;
  loading: string;
  error: string;
  /** One-click load of the whole ownership side. */
  dataCta: string;
  dataHint: string;
  dataLoading: string;
  dataError: string;
  dismiss: string;
}

const COPY: Record<WYQDLanguage, FirstRunCopy> = {
  en: {
    eyebrowModel: 'How Ownly fits together',
    eyebrowRecord: 'Your data is ready',
    progressLabel: 'Setup progress',
    modelTitle: 'Collect → Curate → Plan',
    modelDescription:
      'One idea, three surfaces. Capture saves places you see, Collection keeps the ones worth keeping, Planner turns them into days you can actually follow. All three speak the same plain Markdown in your data folder.',
    model: [
      { icon: '📍', title: '① Capture', body: 'Save a place from Google Maps with one click.', example: 'e.g. Suvarnabhumi Airport' },
      { icon: '📦', title: '② Collection', body: 'Curate, tag and dedupe the places worth keeping.', example: 'e.g. My Bangkok Eats Top 8' },
      { icon: '🗓️', title: '③ Planner', body: 'Import into a trip, schedule each stop onto a day.', example: 'e.g. Oct 05 · 3 stops' },
    ],
    modelNext: 'Set up my first record',
    recordTitle: 'Record your first real object',
    recordDescription:
      'Start with one thing that is genuinely useful to remember. This creates a normal Ownly Markdown record, not demo data — and you can also open a finished Sample Trip and take it apart instead.',
    choices: {
      physical: {
        title: 'Physical item',
        description: 'A possession you are considering, using, or preparing to exit.',
        example: 'Example: camera, laptop, bicycle',
      },
      recurring_cost: {
        title: 'Subscription',
        description: 'A subscription with an ongoing cost worth reviewing.',
        example: 'Example: cloud storage, software, membership',
      },
      experience: {
        title: 'Experience or plan',
        description: 'A trip, event, meal, or other finite experience.',
        example: 'Example: weekend trip, concert, course',
      },
    },
    choiceIcons: { physical: '□', recurring_cost: '↻', experience: '◇' },
    sampleTitle: 'Or look at a finished trip first',
    sampleBody:
      'A Sample Trip is an ordinary trip with places, a daily timeline, travel legs and a ledger already filled in. Open one, change anything, delete it whenever you like.',
    loading: 'Loading…',
    error: 'Could not load the Sample Trip.',
    dataCta: 'Or load a full set of example data',
    dataHint:
      'Objects, subscriptions, three trips, six months of account snapshots and reviews — one click, so every page has something to show. Every record is tagged and can be archived individually.',
    dataLoading: 'Loading example data…',
    dataError: 'Could not load the example data.',
    dismiss: 'Skip for now',
  },
  zh: {
    eyebrowModel: 'Ownly 是怎么串起来的',
    eyebrowRecord: '本地数据已经就绪',
    progressLabel: '设置进度',
    modelTitle: '收集 → 整理 → 规划',
    modelDescription:
      '一个想法，三个界面。Capture 存下你看到的地点，Collection 留下值得保留的那几个，Planner 把它们排成真正能走的天数。三者读写的是数据目录里同一份 Markdown。',
    model: [
      { icon: '📍', title: '① Capture 收集', body: '在 Google Maps 看到地点，点扩展一键收集。', example: '例：素万那普机场' },
      { icon: '📦', title: '② Collection 整理', body: '在合集里筛选、补标签、去重。', example: '例：我的曼谷美食 Top 8' },
      { icon: '🗓️', title: '③ Planner 规划', body: '导入行程，把每个地点排进某一天。', example: '例：10 月 5 日 · 3 个点' },
    ],
    modelNext: '开始设置第一条记录',
    recordTitle: '记录第一个真实对象',
    recordDescription:
      '从一件真正值得记住的事物开始。系统会创建一条正常的 Ownly Markdown 记录，而不是演示数据 —— 你也可以先打开一份已排好的示例行程，边看边改。',
    choices: {
      physical: {
        title: '实体物品',
        description: '正在考虑购买、已经使用，或准备退出的一件物品。',
        example: '例如：相机、电脑、自行车',
      },
      recurring_cost: {
        title: '订阅',
        description: '一项值得持续审视的订阅及其订阅成本。',
        example: '例如：云存储、软件、会员',
      },
      experience: {
        title: '体验或计划',
        description: '一次旅行、活动、用餐或其它有限期体验。',
        example: '例如：周末旅行、演出、课程',
      },
    },
    choiceIcons: { physical: '□', recurring_cost: '↻', experience: '◇' },
    sampleTitle: '或者先看一份已排好的行程',
    sampleBody:
      '示例行程就是一条普通行程：地点、日程时间线、交通段和费用账本都已经填好。打开看看，随便改，任何时候都能删掉。',
    loading: '载入中…',
    error: '示例行程载入失败。',
    dataCta: '或者一次性载入整套示例数据',
    dataHint:
      '实体物品、订阅、三段旅行、六个月的账户快照和复盘 —— 一次载入，五个页面立刻都有内容。每条记录都带标记，可以单独归档删除。',
    dataLoading: '正在载入示例数据…',
    dataError: '示例数据载入失败。',
    dismiss: '暂时跳过',
  },
};

export function getFirstRunCopy(language: WYQDLanguage): FirstRunCopy {
  return COPY[language];
}
