import { WYQD_SCHEMA_VERSION } from '@/core/runtime';
import {
  effectiveFxRate,
  PLANNER_TRAVEL_MODE_CONFIG,
  type PlannerTravelMode,
  type PlannerTrip,
  type PlannerTripLeg,
  type PlannerTripPlace,
  type TripExpenseItem,
} from './planner';
import type { PlannerTripVisit } from './planner-visits';
import type {
  CurrencyCode,
  ExperienceExpenseItem,
  OneTimeExperienceObject,
} from './types';

/**
 * WS-1 — trip retrospective: aggregate a finished trip into an experience-
 * object draft (travel_worldview). Confirming the draft saves a normal
 * one_time_experience object through the existing review-entry path, so
 * TravelInsightsPanel picks it up with zero new queries.
 */

export interface TripReviewModeSlice {
  mode: PlannerTravelMode;
  count: number;
}

export interface TripReviewTopExpense {
  title: string;
  amount: number;
  currency: string;
  converted: number | null;
}

export interface TripReviewStats {
  placeCount: number;
  visitCount: number;
  legCount: number;
  modeMix: TripReviewModeSlice[];
  expenseCurrency: string;
  /** Converted total in the trip currency; null when there are no expenses. */
  expenseTotal: number | null;
  unconvertible: { currency: string; amount: number }[];
  topExpenses: TripReviewTopExpense[];
  topRatedPlace: { title: string; rating: number } | null;
}

export function buildTripReviewStats(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  visits: PlannerTripVisit[],
  legs: PlannerTripLeg[],
  expenses: TripExpenseItem[],
): TripReviewStats {
  const tripPlaces = places.filter((p) => p.trip_id === trip.id && p.state !== 'dropped');
  const tripVisits = visits.filter((v) => v.trip_id === trip.id);
  const tripLegs = legs.filter((l) => l.trip_id === trip.id);
  const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);

  const modeCounts = new Map<PlannerTravelMode, number>();
  for (const leg of tripLegs) {
    modeCounts.set(leg.mode, (modeCounts.get(leg.mode) ?? 0) + 1);
  }
  const modeMix = [...modeCounts.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);

  const base = (trip.currency || 'CNY').toUpperCase();
  const fx = { base, overrides: trip.fx_rates };
  let convertedSum = 0;
  let convertibleCount = 0;
  const unconvertibleByCurrency = new Map<string, number>();
  const ranked: TripReviewTopExpense[] = [];
  for (const expense of tripExpenses) {
    const rate = effectiveFxRate(expense.currency, fx);
    const converted =
      rate !== null && rate > 0 ? Math.round(expense.amount * rate) : null;
    if (converted !== null) {
      convertedSum += converted;
      convertibleCount += 1;
    } else {
      const code = (expense.currency || 'unknown').toUpperCase();
      unconvertibleByCurrency.set(
        code,
        (unconvertibleByCurrency.get(code) ?? 0) + expense.amount,
      );
    }
    ranked.push({
      title: expense.title,
      amount: expense.amount,
      currency: (expense.currency || base).toUpperCase(),
      converted,
    });
  }
  ranked.sort((a, b) => (b.converted ?? -1) - (a.converted ?? -1));
  const topExpenses = ranked.slice(0, 3);

  let topRatedPlace: TripReviewStats['topRatedPlace'] = null;
  for (const place of tripPlaces) {
    const rating = place.observed_rating;
    if (typeof rating === 'number' && Number.isFinite(rating)) {
      if (!topRatedPlace || rating > topRatedPlace.rating) {
        topRatedPlace = { title: place.title, rating };
      }
    }
  }

  return {
    placeCount: tripPlaces.length,
    visitCount: tripVisits.length,
    legCount: tripLegs.length,
    modeMix,
    expenseCurrency: base,
    expenseTotal: tripExpenses.length > 0 && convertibleCount > 0 ? convertedSum : null,
    unconvertible: [...unconvertibleByCurrency.entries()].map(([currency, amount]) => ({
      currency,
      amount,
    })),
    topExpenses,
    topRatedPlace,
  };
}

export interface TripReviewDraft {
  object: OneTimeExperienceObject;
  body: string;
}

export function buildTripReviewDraft(
  trip: PlannerTrip,
  stats: TripReviewStats,
  options?: {
    language?: 'zh' | 'en';
    now?: Date;
    idFactory?: () => string;
  },
): TripReviewDraft {
  const language = options?.language ?? 'zh';
  const zh = language === 'zh';
  const now = options?.now ?? new Date();
  const date = now.toISOString().split('T')[0];
  const id =
    options?.idFactory?.() ?? `obj_${date.replaceAll('-', '')}_${now.getTime()}`;

  const destinations = trip.destinations ?? [];
  const expenseItems: ExperienceExpenseItem[] = stats.topExpenses.map((item) => ({
    name: item.title,
    amount: item.amount,
    currency: item.currency as CurrencyCode,
  }));

  const object: OneTimeExperienceObject = {
    schema_version: WYQD_SCHEMA_VERSION,
    id,
    type: 'object',
    object_type: 'one_time_experience',
    status: 'completed',
    title: trip.title,
    experience_subtype: 'travel_worldview',
    started_at: trip.start_date,
    ended_at: trip.end_date,
    location: destinations.length > 0 ? { city: destinations[0] } : undefined,
    locations: destinations.map((city) => ({ city })),
    budget_total: undefined,
    actual_total: stats.expenseTotal ?? undefined,
    expense_items: expenseItems.length > 0 ? expenseItems : undefined,
    currency: (trip.currency as CurrencyCode | undefined) ?? undefined,
    tags: ['ownly', 'experience', 'travel', 'trip-review'],
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const lines: string[] = [
    zh ? `## 行程自动统计（可删改）` : `## Auto trip stats (editable)`,
    ``,
    zh
      ? `- 到访地点 ${stats.placeCount} 个 · 日程 ${stats.visitCount} 项 · 路段 ${stats.legCount} 条`
      : `- ${stats.placeCount} places · ${stats.visitCount} visits · ${stats.legCount} legs`,
  ];
  if (stats.modeMix.length > 0) {
    const mix = stats.modeMix
      .map(({ mode, count }) => {
        const config = PLANNER_TRAVEL_MODE_CONFIG[mode];
        const label = config ? (zh ? config.labelZh : config.labelEn) : mode;
        return `${label} ×${count}`;
      })
      .join(' / ');
    lines.push(zh ? `- 交通方式构成：${mix}` : `- Transport mix: ${mix}`);
  }
  if (stats.expenseTotal !== null) {
    lines.push(
      zh
        ? `- 实际总花费 ${stats.expenseCurrency} ${stats.expenseTotal}（按行程汇率折算）`
        : `- Actual total ${stats.expenseCurrency} ${stats.expenseTotal} (converted at trip rates)`,
    );
  } else if (stats.unconvertible.length > 0) {
    lines.push(
      zh
        ? `- 花费因缺少汇率未能折算，见下`
        : `- Spend could not be converted (missing rates), see below`,
    );
  } else {
    lines.push(zh ? `- 本行程未记账` : `- No expenses recorded for this trip`);
  }
  for (const item of stats.unconvertible) {
    lines.push(
      zh
        ? `- 未折算：${item.currency} ${item.amount}（缺汇率，请手动确认）`
        : `- Unconverted: ${item.currency} ${item.amount} (missing rate, confirm manually)`,
    );
  }
  if (stats.topExpenses.length > 0) {
    lines.push(``, zh ? `### 花费 Top 3` : `### Top 3 spend`);
    for (const [index, item] of stats.topExpenses.entries()) {
      const converted =
        item.converted !== null ? ` ≈ ${stats.expenseCurrency} ${item.converted}` : '';
      lines.push(`${index + 1}. ${item.title} — ${item.currency} ${item.amount}${converted}`);
    }
  }
  if (stats.topRatedPlace) {
    lines.push(
      ``,
      zh
        ? `### 评分最高：${stats.topRatedPlace.title}（★ ${stats.topRatedPlace.rating}）`
        : `### Top rated: ${stats.topRatedPlace.title} (★ ${stats.topRatedPlace.rating})`,
    );
  }
  lines.push(
    ``,
    zh ? `### 待你填写` : `### For you to fill in`,
    zh
      ? `- 复游意愿 / 美食 / 风景 / 体验评分请走「复盘」页补录`
      : `- Add revisit intent and food / scenery / experience scores via the Reviews tab`,
    zh ? `- 预算（budget_total）本行程未设定，如有请手动填写` : `- No trip budget was set; fill in budget_total manually if known`,
  );

  return { object, body: `${lines.join('\n')}\n` };
}

/** A trip is reviewable once it ended or was manually marked complete. */
export function isTripReviewable(trip: PlannerTrip, today = new Date().toISOString().split('T')[0]): boolean {
  return trip.status === 'completed' || trip.end_date < today;
}
