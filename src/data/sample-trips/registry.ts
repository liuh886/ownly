/**
 * Sample Trip registry — metadata only.
 *
 * Importing this module must stay cheap: the Planner renders these cards on an
 * empty data folder, so the actual bundle data (≈100 KB of JSON across three
 * trips) lives behind `loadSampleTripBundle()` and a dynamic import.
 *
 * The counts here are the single source of truth for the picker UI.
 * `sample-trips.registry.test.ts` asserts they still match the built bundles,
 * so the cards can never advertise a trip the data no longer contains.
 */
import type { WYQDLanguage } from '@/core/i18n';

export const SAMPLE_TRIP_IDS = ['sample-thailand-6d', 'sample-china-8d', 'sample-kansai-6d'] as const;
export type SampleTripId = (typeof SAMPLE_TRIP_IDS)[number];

/** Tag every loaded Sample Trip carries, so the UI can badge it later. */
export const SAMPLE_TRIP_TAG = 'sample';

export interface SampleTripSummary {
  id: SampleTripId;
  /** Covers a new user's first scan of the empty Planner. */
  eyebrow: string;
  title: string;
  route: string;
  emoji: string;
  /** 0-based day offset of the first stop, used only for the "从第 N 天开始看" hint. */
  days: number;
  stops: number;
  poolSize: number;
  highlights: string[];
  titleEn: string;
  routeEn: string;
  eyebrowEn: string;
  highlightsEn: string[];
}

export const SAMPLE_TRIPS: Record<SampleTripId, SampleTripSummary> = {
  'sample-thailand-6d': {
    id: 'sample-thailand-6d',
    emoji: '🇹🇭',
    eyebrow: '东南亚 · 双城 + 返程',
    eyebrowEn: 'Southeast Asia · two cities plus a return hub',
    title: '泰国 6 日',
    route: '曼谷 · 清迈 · 昆明',
    days: 6,
    stops: 13,
    poolSize: 3,
    highlights: [
      '大皇宫 + 卧佛寺连成一条步行线',
      '恰图恰周末市集，正好落在周日',
      '曼谷/昆明跨时区，日历按当地时刻导出',
    ],
    titleEn: 'Thailand in 6 days',
    routeEn: 'Bangkok · Chiang Mai · Kunming',
    highlightsEn: [
      'Grand Palace + Wat Pho as one walking line',
      'Chatuchak weekend market lands on a Sunday',
      'Crosses Bangkok/Kunming timezones for calendar export',
    ],
  },
  'sample-china-8d': {
    id: 'sample-china-8d',
    emoji: '🇨🇳',
    eyebrow: '国内 · 四城内陆线',
    eyebrowEn: 'China · four inland cities',
    title: '中国 8 日',
    route: '北京 · 西安 · 重庆 · 成都',
    days: 8,
    stops: 18,
    poolSize: 3,
    highlights: [
      '陕历博排在周日——周一闭馆',
      '费用账本带 11 笔，含 AA 分摊',
      '重庆一天串起穿楼、索道与古镇',
    ],
    titleEn: 'China in 8 days',
    routeEn: 'Beijing · Xi\u2019an · Chongqing · Chengdu',
    highlightsEn: [
      'History museum lands on Sunday — closed Mondays',
      'Ledger ships with 11 entries and an AA split',
      'One Chongqing day threads rail, cableway and old town',
    ],
  },
  'sample-kansai-6d': {
    id: 'sample-kansai-6d',
    emoji: '🇯🇵',
    eyebrow: '日本 · 铁道三角',
    eyebrowEn: 'Japan · the rail triangle',
    title: '关西 6 日',
    route: '大阪 · 京都 · 奈良',
    days: 6,
    stops: 12,
    poolSize: 3,
    highlights: [
      '伏见稻荷排在 08:00，趁没人',
      '大阪城标注了元旦休馆日',
      '环球影城留在研究池：需要指定日票',
    ],
    titleEn: 'Kansai in 6 days',
    routeEn: 'Osaka · Kyoto · Nara',
    highlightsEn: [
      'Fushimi Inari at 08:00, before the crowds',
      'Osaka Castle carries its New Year closure',
      'USJ stays in the pool: it needs a dated ticket',
    ],
  },
};

export function isSampleTripId(value: string): value is SampleTripId {
  return (SAMPLE_TRIP_IDS as readonly string[]).includes(value);
}

export function allSampleTrips(): SampleTripSummary[] {
  return SAMPLE_TRIP_IDS.map((id) => SAMPLE_TRIPS[id]);
}

export function sampleTripSummary(id: SampleTripId): SampleTripSummary {
  return SAMPLE_TRIPS[id];
}

/** Localized card body. Falls back to English for any unmapped locale. */
export function localizeSampleTrip(summary: SampleTripSummary, language: WYQDLanguage) {
  if (language === 'zh') {
    return {
      eyebrow: summary.eyebrow,
      title: summary.title,
      route: summary.route,
      highlights: summary.highlights,
    };
  }
  return {
    eyebrow: summary.eyebrowEn,
    title: summary.titleEn,
    route: summary.routeEn,
    highlights: summary.highlightsEn,
  };
}
