import type { WYQDTranslationKey } from '@/core/i18n';
import { COUNTRY_NAMES } from '@/domain/travel';
import type {
  BillingCycle,
  OneTimeExperienceStatus,
  PhysicalStatus,
  RecurringCostStatus,
  WYQDObjectType,
} from '@/domain/types';

// ── Parse result types ───────────────────────────────────

export interface QuickLineParseResult {
  ok: boolean;
  objectType: WYQDObjectType | null;
  fields: Record<string, string>;
  warnings: string[];
  errors: string[];
}

export const QL_FIELD = {
  TITLE: 'title',
  TYPE: 'type',
  AMOUNT: 'amount',
  PURCHASED_AT: 'purchasedAt',
  ENDED_AT: 'endedAt',
  CATEGORY: 'category',
  PHYSICAL_STATUS: 'physicalStatus',
  CYCLE: 'cycle',
  DAY: 'day',
  ACCOUNT: 'account',
  STARTED_AT: 'startedAt',
  RECURRING_STATUS: 'recurringStatus',
  BUDGET: 'budget',
  ACTUAL: 'actual',
  EXPERIENCE_STATUS: 'experienceStatus',
  SUBTYPE: 'subtype',
  COUNTRY_CODE: 'countryCode',
  CITY: 'city',
  LAT: 'lat',
  LNG: 'lng',
} as const;

// ── Templates ────────────────────────────────────────────

export function getQuickLineTemplates(t: (key: WYQDTranslationKey) => string, lang: string): Array<{ label: string; value: string; kind: 'physical' | 'recurring_cost' | 'travel' }> {
  const isZh = lang !== 'en';
  const travelCategory = isZh ? '旅行体验' : 'Travel experience';
  const aiCategory = isZh ? 'AI工具' : 'AI Tools';
  return [
    {
      label: t('physicalTemplate'),
      kind: 'physical' as const,
      value: isZh
        ? `小米13U / physical / 5843 / 2023-06-07 / 2025-09-20 / 电子产品 / 已退役`
        : `Sony A7C / physical / 12000 / 2026-05-01 / 2026-05-17 / Camera / using`,
    },
    {
      label: t('fixedCostTemplate'),
      kind: 'recurring_cost' as const,
      value: isZh
        ? `ChatGPT Plus / recurring_cost / 145 / monthly / 20 / 招行信用卡 / 2026-05-01 / 订阅中 / ${aiCategory}`
        : `ChatGPT Plus / recurring_cost / 20 / monthly / 1 / Credit Card / 2026-01-01 / active / ${aiCategory}`,
    },
    {
      label: t('experienceTemplate'),
      kind: 'travel' as const,
      value: isZh
        ? `香港之旅 / travel / 18000 / 16500 / 2026-05-04 / ${travelCategory} / 已完成 / HK / Hong Kong / 22.3193 / 114.1694`
        : `Tokyo trip / travel / 18000 / 16500 / 2026-05-04 / ${travelCategory} / completed / JP / Tokyo / 35.6762 / 139.6503`,
    },
  ];
}

// ── Field parsers (unchanged public API) ──────────────────

export function parsePhysicalStatus(value: string): PhysicalStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, PhysicalStatus> = {
    观察: 'observing',
    观察中: 'observing',
    想买: 'observing',
    已购买: 'purchased',
    使用中: 'using',
    服役中: 'using',
    在用: 'using',
    闲置: 'idle',
    退役: 'idle',
    已退役: 'idle',
    卖出: 'transferred',
    已卖出: 'transferred',
    转让: 'transferred',
    已转让: 'transferred',
    丢弃: 'discarded',
    已丢弃: 'discarded',
    observing: 'observing',
    purchased: 'purchased',
    using: 'using',
    idle: 'idle',
    transferred: 'transferred',
    discarded: 'discarded',
  };

  return statusMap[normalized] || null;
}

export function parseRecurringStatus(value: string): RecurringCostStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, RecurringCostStatus> = {
    种草: 'seeded',
    订阅中: 'active',
    使用中: 'active',
    active: 'active',
    seeded: 'seeded',
    paused: 'paused',
    暂停: 'paused',
    已暂停: 'paused',
    cancelled: 'cancelled',
    取消: 'cancelled',
    已取消: 'cancelled',
  };

  return statusMap[normalized] || null;
}

export function parseExperienceStatus(value: string): OneTimeExperienceStatus | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const statusMap: Record<string, OneTimeExperienceStatus> = {
    planned: 'planned',
    计划中: 'planned',
    in_progress: 'in_progress',
    执行中: 'in_progress',
    进行中: 'in_progress',
    completed: 'completed',
    已完成: 'completed',
    完成: 'completed',
    reviewed: 'reviewed',
    已复盘: 'reviewed',
    复盘: 'reviewed',
  };

  return statusMap[normalized] || null;
}

export function parseBillingCycle(value: string): BillingCycle | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const cycleMap: Record<string, BillingCycle> = {
    weekly: 'weekly',
    每周: 'weekly',
    monthly: 'monthly',
    每月: 'monthly',
    月: 'monthly',
    quarterly: 'quarterly',
    每季度: 'quarterly',
    annual: 'annual',
    yearly: 'annual',
    每年: 'annual',
    年: 'annual',
    custom: 'custom',
    自定义: 'custom',
  };

  return cycleMap[normalized] || null;
}

export function parseObjectType(value: string): WYQDObjectType | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const typeMap: Record<string, WYQDObjectType> = {
    physical: 'physical',
    实物: 'physical',
    固定成本: 'recurring_cost',
    订阅: 'recurring_cost',
    recurring: 'recurring_cost',
    fixed: 'recurring_cost',
    recurring_cost: 'recurring_cost',
    体验: 'one_time_experience',
    一次性体验: 'one_time_experience',
    experience: 'one_time_experience',
    one_time_experience: 'one_time_experience',
    travel: 'one_time_experience',
    旅行: 'one_time_experience',
  };

  return typeMap[normalized] || null;
}

export function isDateLike(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

// ── Internal helpers ─────────────────────────────────────

function splitParts(value: string): string[] {
  return value
    .split(/[\/／，,|\t]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isNumeric(v: string): boolean {
  return /^\d+(\.\d+)?$/.test(v);
}

function isLatLng(v: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(v);
}

function parsePhysicalFields(parts: string[], hasExplicitType: boolean) {
  const fields: Record<string, string> = {};
  const warnings: string[] = [];

  const [name, priceOrType, firstDateOrPrice, secondDateOrFirstDate, maybeCategory, maybeStatus] = parts;
  const price = hasExplicitType ? firstDateOrPrice : priceOrType;
  const firstDate = hasExplicitType ? secondDateOrFirstDate : firstDateOrPrice;
  const secondDate = hasExplicitType ? maybeCategory : secondDateOrFirstDate;
  const category = hasExplicitType ? maybeStatus : maybeCategory;
  const status = hasExplicitType ? parts[6] : maybeStatus;

  if (name) fields[QL_FIELD.TITLE] = name;
  if (price) {
    fields[QL_FIELD.AMOUNT] = price;
    if (!isNumeric(price)) warnings.push('Amount is not a valid number');
  }
  if (firstDate) {
    fields[QL_FIELD.PURCHASED_AT] = firstDate;
    if (!isDateLike(firstDate)) warnings.push('Purchase date is not YYYY-MM-DD');
  }
  if (secondDate) {
    fields[QL_FIELD.ENDED_AT] = secondDate;
    if (!isDateLike(secondDate)) warnings.push('End date is not YYYY-MM-DD');
  }
  if (category) fields[QL_FIELD.CATEGORY] = category;

  const statusStr = status || category || '';
  const parsedStatus = parsePhysicalStatus(statusStr);
  if (parsedStatus) {
    fields[QL_FIELD.PHYSICAL_STATUS] = parsedStatus;
  } else if (statusStr) {
    warnings.push(`Unrecognized physical status "${statusStr}"`);
  }

  return { fields, warnings };
}

function parseRecurringFields(parts: string[]) {
  const fields: Record<string, string> = {};
  const warnings: string[] = [];

  const [name, , price, cycle, day, account, startedAt, status, maybeCategory] = parts;

  if (name) fields[QL_FIELD.TITLE] = name;
  if (price) {
    fields[QL_FIELD.AMOUNT] = price;
    if (!isNumeric(price)) warnings.push('Amount is not a valid number');
  }
  if (cycle) {
    const parsedCycle = parseBillingCycle(cycle);
    if (parsedCycle) {
      fields[QL_FIELD.CYCLE] = parsedCycle;
    } else {
      warnings.push(`Unrecognized billing cycle "${cycle}"`);
      fields[QL_FIELD.CYCLE] = cycle;
    }
  }
  if (day) {
    fields[QL_FIELD.DAY] = day;
    if (!/^\d{1,2}$/.test(day)) warnings.push('Billing day should be a number (1-31)');
  }
  if (account) fields[QL_FIELD.ACCOUNT] = account;
  if (startedAt) {
    fields[QL_FIELD.STARTED_AT] = startedAt;
    if (!isDateLike(startedAt)) warnings.push('Started date is not YYYY-MM-DD');
  }
  if (status) {
    const parsedStatus = parseRecurringStatus(status);
    if (parsedStatus) {
      fields[QL_FIELD.RECURRING_STATUS] = parsedStatus;
    } else {
      warnings.push(`Unrecognized recurring status "${status}"`);
      fields[QL_FIELD.RECURRING_STATUS] = status;
    }
  }
  if (maybeCategory) fields[QL_FIELD.CATEGORY] = maybeCategory;

  return { fields, warnings };
}

function parseExperienceFields(parts: string[]) {
  const fields: Record<string, string> = {};
  const warnings: string[] = [];

  const subtypeKeywords = ['travel', '旅行', '旅行体验', 'travel_worldview'];

  const [name, typeOrSubtype, budget, actual, endedAt, maybeCategory, status] = parts;

  if (name) fields[QL_FIELD.TITLE] = name;

  // Subtype detection
  const subtypeHit =
    subtypeKeywords.includes((typeOrSubtype || '').toLowerCase()) ||
    subtypeKeywords.includes((maybeCategory || '').toLowerCase());
  if (subtypeHit) {
    fields[QL_FIELD.SUBTYPE] = 'travel_worldview';
  }

  if (budget) {
    fields[QL_FIELD.BUDGET] = budget;
    if (!isNumeric(budget)) warnings.push('Budget is not a valid number');
  }
  if (actual) {
    fields[QL_FIELD.ACTUAL] = actual;
    if (!isNumeric(actual)) warnings.push('Actual amount is not a valid number');
  }
  if (endedAt) {
    fields[QL_FIELD.ENDED_AT] = endedAt;
    if (!isDateLike(endedAt)) warnings.push('Ended date is not YYYY-MM-DD');
  }
  if (maybeCategory) fields[QL_FIELD.CATEGORY] = maybeCategory;

  if (status) {
    const parsedStatus = parseExperienceStatus(status);
    if (parsedStatus) {
      fields[QL_FIELD.EXPERIENCE_STATUS] = parsedStatus;
    } else {
      warnings.push(`Unrecognized experience status "${status}"`);
      fields[QL_FIELD.EXPERIENCE_STATUS] = status;
    }
  }

  // Location: support both 11-field (with city) and legacy 10-field (no city) formats
  // 11-field: [7]=countryCode, [8]=city, [9]=lat, [10]=lng
  // 10-field: [7]=countryCode, [8]=lat, [9]=lng
  const countryCode = parts[7];
  const maybeCityOrLat = parts[8];
  const maybeLatOrLng = parts[9];
  const maybeLng = parts[10];

  if (parts.length >= 11) {
    // New 11-field format: explicit city
    if (countryCode) fields[QL_FIELD.COUNTRY_CODE] = countryCode;
    if (maybeCityOrLat) fields[QL_FIELD.CITY] = maybeCityOrLat;
    if (maybeLatOrLng) {
      fields[QL_FIELD.LAT] = maybeLatOrLng;
      if (!isLatLng(maybeLatOrLng)) warnings.push(`Latitude "${maybeLatOrLng}" is not a valid number`);
    }
    if (maybeLng) {
      fields[QL_FIELD.LNG] = maybeLng;
      if (!isLatLng(maybeLng)) warnings.push(`Longitude "${maybeLng}" is not a valid number`);
    }
  } else if (parts.length === 10 && countryCode && maybeCityOrLat && maybeLatOrLng) {
    // Legacy 10-field format: no city — fall back to title
    if (isLatLng(maybeCityOrLat) && isLatLng(maybeLatOrLng)) {
      fields[QL_FIELD.COUNTRY_CODE] = countryCode;
      fields[QL_FIELD.LAT] = maybeCityOrLat;
      fields[QL_FIELD.LNG] = maybeLatOrLng;
      fields[QL_FIELD.CITY] = parts[0] || '';
      warnings.push('Legacy 10-field format: city defaulted to title. Add city field for explicit control.');
    } else {
      // Best-effort: treat as lat/lng
      if (countryCode) fields[QL_FIELD.COUNTRY_CODE] = countryCode;
      if (maybeCityOrLat) {
        fields[QL_FIELD.LAT] = maybeCityOrLat;
        if (!isLatLng(maybeCityOrLat)) warnings.push(`Latitude "${maybeCityOrLat}" is not a valid number`);
      }
      if (maybeLatOrLng) {
        fields[QL_FIELD.LNG] = maybeLatOrLng;
        if (!isLatLng(maybeLatOrLng)) warnings.push(`Longitude "${maybeLatOrLng}" is not a valid number`);
      }
    }
  } else if (countryCode) {
    // Fewer fields but has country code
    fields[QL_FIELD.COUNTRY_CODE] = countryCode;
    if (maybeCityOrLat && !isLatLng(maybeCityOrLat)) {
      fields[QL_FIELD.CITY] = maybeCityOrLat;
    } else if (maybeCityOrLat) {
      fields[QL_FIELD.LAT] = maybeCityOrLat;
      if (!isLatLng(maybeCityOrLat)) warnings.push(`Latitude "${maybeCityOrLat}" is not a valid number`);
    }
    if (maybeLatOrLng) {
      fields[QL_FIELD.LNG] = maybeLatOrLng;
      if (!isLatLng(maybeLatOrLng)) warnings.push(`Longitude "${maybeLatOrLng}" is not a valid number`);
    }
  }

  return { fields, warnings };
}

// ── Pure parse function ──────────────────────────────────

export function parseQuickLine(value: string): QuickLineParseResult {
  const parts = splitParts(value);
  const errors: string[] = [];
  let warnings: string[] = [];
  const fields: Record<string, string> = {};

  if (parts.length === 0) {
    return { ok: false, objectType: null, fields: {}, warnings: [], errors: ['No fields entered'] };
  }

  if (parts.length < 3) {
    return { ok: false, objectType: null, fields: {}, warnings: [],
      errors: ['At least 3 fields required: title, type, amount'] };
  }

  const parsedType = parseObjectType(parts[1] || '');
  if (!parsedType) {
    return { ok: false, objectType: null, fields: {}, warnings: [],
      errors: [`Unknown object type "${parts[1]}". Expected: physical, fixed/recurring_cost, or travel/experience`] };
  }

  fields[QL_FIELD.TITLE] = parts[0] || '';
  fields[QL_FIELD.TYPE] = parts[1] || '';

  let typeFields: { fields: Record<string, string>; warnings: string[] };

  if (parsedType === 'recurring_cost') {
    typeFields = parseRecurringFields(parts);
  } else if (parsedType === 'one_time_experience') {
    typeFields = parseExperienceFields(parts);
  } else {
    typeFields = parsePhysicalFields(parts, true);
  }

  // Merge type-specific fields and warnings
  Object.assign(fields, typeFields.fields);
  warnings = typeFields.warnings;

  return {
    ok: errors.length === 0,
    objectType: parsedType,
    fields,
    warnings,
    errors,
  };
}

// ── applyQuickLine: bridge from parse result to form setters ──

export function applyQuickLine(
  value: string,
  setters: {
    setTitle: (next: string) => void;
    setAmount: (next: string) => void;
    setPurchasedAt: (next: string) => void;
    setEndedAt: (next: string) => void;
    setCategory: (next: string) => void;
    setPhysicalStatus: (next: PhysicalStatus) => void;
    setRecurringStatus: (next: RecurringCostStatus) => void;
    setBillingCycle: (next: BillingCycle) => void;
    setBillingDay: (next: string) => void;
    setPaymentAccount: (next: string) => void;
    setRecurringStartedAt: (next: string) => void;
    setExperienceStatus: (next: OneTimeExperienceStatus) => void;
    setActualAmount: (next: string) => void;
    setObjectType: (next: WYQDObjectType) => void;
    setExperienceSubtype?: (next: string) => void;
    setLocationCountry?: (next: string) => void;
    setLocationCountryCode?: (next: string) => void;
    setLocationCity?: (next: string) => void;
    setLocationLatitude?: (next: string) => void;
    setLocationLongitude?: (next: string) => void;
  },
) {
  const result = parseQuickLine(value);
  if (!result.ok || !result.objectType) return;

  const f = result.fields;

  setters.setObjectType(result.objectType);

  if (f[QL_FIELD.TITLE]) setters.setTitle(f[QL_FIELD.TITLE]);

  if (result.objectType === 'physical') {
    const amount = f[QL_FIELD.AMOUNT] || f[QL_FIELD.BUDGET];
    if (amount && isNumeric(amount)) setters.setAmount(amount);
    if (f[QL_FIELD.PURCHASED_AT] && isDateLike(f[QL_FIELD.PURCHASED_AT])) setters.setPurchasedAt(f[QL_FIELD.PURCHASED_AT]);
    if (f[QL_FIELD.ENDED_AT] && isDateLike(f[QL_FIELD.ENDED_AT])) setters.setEndedAt(f[QL_FIELD.ENDED_AT]);
    if (f[QL_FIELD.CATEGORY]) setters.setCategory(f[QL_FIELD.CATEGORY]);
    const pStatus = parsePhysicalStatus(f[QL_FIELD.PHYSICAL_STATUS] || '');
    if (pStatus) setters.setPhysicalStatus(pStatus);
  }

  if (result.objectType === 'recurring_cost') {
    const amount = f[QL_FIELD.AMOUNT];
    if (amount && isNumeric(amount)) setters.setAmount(amount);
    const cycle = parseBillingCycle(f[QL_FIELD.CYCLE] || '');
    if (cycle) setters.setBillingCycle(cycle);
    if (f[QL_FIELD.DAY] && /^\d{1,2}$/.test(f[QL_FIELD.DAY])) setters.setBillingDay(f[QL_FIELD.DAY]);
    if (f[QL_FIELD.ACCOUNT]) setters.setPaymentAccount(f[QL_FIELD.ACCOUNT]);
    if (f[QL_FIELD.STARTED_AT] && isDateLike(f[QL_FIELD.STARTED_AT])) setters.setRecurringStartedAt(f[QL_FIELD.STARTED_AT]);
    const rStatus = parseRecurringStatus(f[QL_FIELD.RECURRING_STATUS] || '');
    if (rStatus) setters.setRecurringStatus(rStatus);
    if (f[QL_FIELD.CATEGORY]) setters.setCategory(f[QL_FIELD.CATEGORY]);
  }

  if (result.objectType === 'one_time_experience') {
    const budget = f[QL_FIELD.BUDGET];
    if (budget && isNumeric(budget)) setters.setAmount(budget);
    const actual = f[QL_FIELD.ACTUAL];
    if (actual && isNumeric(actual)) setters.setActualAmount(actual);
    if (f[QL_FIELD.ENDED_AT] && isDateLike(f[QL_FIELD.ENDED_AT])) setters.setEndedAt(f[QL_FIELD.ENDED_AT]);
    if (f[QL_FIELD.CATEGORY]) setters.setCategory(f[QL_FIELD.CATEGORY]);
    const eStatus = parseExperienceStatus(f[QL_FIELD.EXPERIENCE_STATUS] || '');
    if (eStatus) setters.setExperienceStatus(eStatus);
    if (f[QL_FIELD.SUBTYPE] === 'travel_worldview') {
      setters.setExperienceSubtype?.('travel_worldview');
    }
    if (f[QL_FIELD.COUNTRY_CODE]) {
      setters.setLocationCountryCode?.(f[QL_FIELD.COUNTRY_CODE]);
      setters.setLocationCountry?.(COUNTRY_NAMES[f[QL_FIELD.COUNTRY_CODE].toUpperCase()] || f[QL_FIELD.COUNTRY_CODE]);
    }
    if (f[QL_FIELD.CITY]) setters.setLocationCity?.(f[QL_FIELD.CITY]);
    if (f[QL_FIELD.LAT] && isLatLng(f[QL_FIELD.LAT])) setters.setLocationLatitude?.(f[QL_FIELD.LAT]);
    if (f[QL_FIELD.LNG] && isLatLng(f[QL_FIELD.LNG])) setters.setLocationLongitude?.(f[QL_FIELD.LNG]);
  }
}
