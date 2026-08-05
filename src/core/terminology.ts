import type { WYQDLanguage, WYQDTranslationKey } from './i18n';

type TerminologyOverrides = Partial<Record<WYQDTranslationKey, string>>;

/**
 * Product-language corrections that deliberately leave the persisted schema
 * (`recurring_cost`, `monthly_fixed_cost`, etc.) unchanged.
 *
 * User-facing model:
 * - physical objects -> usage cost
 * - subscriptions -> subscription cost
 */
const TERMINOLOGY_OVERRIDES: Record<WYQDLanguage, TerminologyOverrides> = {
  en: {
    fixedCost: 'Subscriptions',
    monthlyFixedCost: 'Monthly subscription cost',
    dailyCost: 'Daily usage cost',
    highestDailyCost: 'Highest daily usage cost',
    monthlyFixedCostAvg: 'Average monthly subscription cost',
    largestMonthlyFixedCost: 'Largest monthly subscription cost',
    enterFixedCostHint: 'Enter subscription cost to generate',
    monthlyFixedCostN: 'Subscriptions ({count})',
    fixedCostCoverage: 'Subscription cost coverage',
    filterRecurringCost: 'Subscriptions',
    typeRecurringCost: 'Subscription',
    dailyCostAvg: 'Average daily usage cost',
    recurringCostAndExperience: 'Subscriptions and experiences',
    subscriptionServiceUnified: 'Manage subscriptions and one-time experiences together.',
    fixedCostTrend: 'Subscription cost trend',
    fixedCostTemplate: 'Subscription cost template',
  },
  zh: {
    workspaceSubtitle: '面向实物、订阅与体验复盘的本地优先决策账本。',
    newObjectDesc: '捕获实物、订阅或体验对象。',
    fixedCost: '订阅',
    tabObjectsDesc: '管理实物、订阅与一次性体验',
    monthlyFixedCost: '月订阅成本',
    activeSubscription: '活跃订阅',
    dailyCost: '日均使用成本',
    highestDailyCost: '最高日使用成本',
    actionObjectHint: '{count} 个对象已入库，继续沉淀实物、订阅和体验',
    monthlyFixedCostAvg: '月均订阅成本',
    subscriptionService: '订阅服务',
    largestMonthlyFixedCost: '最大月订阅成本',
    noSubscriptionCost: '暂无订阅成本',
    clickToViewSubscription: '点击查看订阅',
    enterFixedCostHint: '录入订阅成本后生成',
    monthlyFixedCostN: '订阅 ({count})',
    captureSubscription: '订阅',
    fixedCostCoverage: '订阅成本覆盖',
    fixedCostHistory: '订阅成本趋势',
    filterRecurringCost: '订阅',
    typeRecurringCost: '订阅',
    objectConsoleSubtitle: '按决策状态管理物欲、订阅和体验，优先处理最该推进的对象。',
    dailyCostAvg: '日均使用成本',
    recurringCostAndExperience: '订阅与体验',
    subscriptionServiceUnified: '订阅与一次性体验统一管理。',
    fixedCostTrend: '订阅成本趋势',
    fixedCostTemplate: '订阅成本模板',
  },
};

export function getTerminologyOverride(
  language: WYQDLanguage,
  key: WYQDTranslationKey,
): string | undefined {
  return TERMINOLOGY_OVERRIDES[language][key];
}
