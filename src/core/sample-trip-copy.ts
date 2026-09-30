import type { WYQDLanguage } from './i18n';

export interface SampleTripCopy {
  /** Empty Planner headline. */
  headline: string;
  /** Why looking at a finished trip beats reading a form. */
  lede: string;
  /** Pre-picker reassurance: nothing is written until a click. */
  noWriteYet: string;
  cardCta: string;
  loading: string;
  /** Shown on the card row. */
  stopsLabel: string;
  daysLabel: string;
  poolLabel: string;
  /** After a successful load. */
  successTitle: string;
  successBody: string;
  /** Compact entry point inside the trip management sheet. */
  compactLink: string;
  dismiss: string;
  /** Governance-safe explanation shown on the created trip. */
  badge: string;
  deleteHint: string;
  error: string;
  /** The 3-step orientation shown above the cards. */
  orientation: ReadonlyArray<{ icon: string; title: string; body: string }>;
}

const ORIENTATION = {
  zh: [
    { icon: '🗺️', title: '1 · 把地点放上地图', body: '每个地点带坐标、票价、营业时间和风险，都会画成地图标记。' },
    { icon: '🗓️', title: '2 · 排进某一天', body: '排期后自动算交通时间，发现赶不上、闭馆或一天太满会直接标红。' },
    { icon: '💸', title: '3 · 记一笔花了多少', body: '费用按行程本币汇总，多币种自动换算，AA 分摊一次算清。' },
  ],
  en: [
    { icon: '🗺️', title: '1 · Drop places on the map', body: 'Each place carries coordinates, admission price, opening hours and risks, and becomes a map pin.' },
    { icon: '🗓️', title: '2 · Put them on a day', body: 'Scheduling computes travel time and flags conflicts, closures and overloaded days.' },
    { icon: '💸', title: '3 · Track what it cost', body: 'Expenses total in the trip currency, convert across currencies, and settle an AA split.' },
  ],
} as const;

const COPY: Record<WYQDLanguage, SampleTripCopy> = {
  en: {
    headline: 'See a finished trip first',
    lede: 'Load a complete itinerary with places, a daily timeline, travel legs and a ledger — then take it apart, change anything, or delete it.',
    noWriteYet: 'Nothing is written to your Ownly data folder until you pick one. A loaded Sample Trip is a normal trip you can delete in one tap.',
    cardCta: 'Load this Sample Trip',
    loading: 'Loading…',
    stopsLabel: 'stops',
    daysLabel: 'days',
    poolLabel: 'in research pool',
    successTitle: 'Sample Trip loaded',
    successBody: 'It is a normal trip in your data folder. Open a day, move a stop, then edit or delete it whenever you like.',
    compactLink: 'Load a Sample Trip instead',
    dismiss: 'Not now',
    badge: 'Sample Trip',
    deleteHint: 'Sample Trips are ordinary trips — delete one from Trip management at any time.',
    error: 'Could not load the Sample Trip.',
    orientation: ORIENTATION.en,
  },
  zh: {
    headline: '先看一份已经排好的行程',
    lede: '载入一份完整行程：地点、日程时间线、交通段和费用账本都在里面。可以随便改，也可以随时删掉。',
    noWriteYet: '在你点选之前，不会向 Ownly 数据目录写入任何内容。载入后的示例行程就是一条普通行程，一键即可删除。',
    cardCta: '载入这份示例行程',
    loading: '载入中…',
    stopsLabel: '个地点',
    daysLabel: '天',
    poolLabel: '个在研究池',
    successTitle: '示例行程已载入',
    successBody: '它是你数据目录里的一条普通行程。打开某一天、挪动一个点，随时可以修改或删除。',
    compactLink: '改为载入一份示例行程',
    dismiss: '暂时不用',
    badge: '示例行程',
    deleteHint: '示例行程就是普通行程 —— 随时可以在「行程管理」里删除。',
    error: '示例行程载入失败。',
    orientation: ORIENTATION.zh,
  },
};

export function getSampleTripCopy(language: WYQDLanguage): SampleTripCopy {
  return COPY[language];
}
