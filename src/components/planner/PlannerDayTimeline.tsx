'use client';

import { useState } from 'react';
import type { PlannerTravelMode, PlannerTrip } from '@/domain/planner';
import {
  calculateDefaultTripLeg,
  currencySymbolFor,
  formatPlacePriceInTripCurrency,
  isTransitHubPlace,
  PLANNER_KIND_ICONS,
  PLANNER_TRAVEL_MODE_CONFIG,
} from '@/domain/planner';
import type { PlannerExecutionTransitionItem, PlannerTimelineStopItem } from '@/domain/planner-schedule';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import type { PlannerControllerReturn } from './usePlannerController';
import { TravelModeSwitchPopover } from './TravelModeSwitchPopover';

export interface PlannerDayTimelineProps {
  zh: boolean;
  scheduled: PlannerControllerReturn['scheduled'];
  draggingPlaceId: string | null;
  dayAssessment: PlannerControllerReturn['dayAssessment'];
  dayTimeline: PlannerControllerReturn['dayTimeline'];
  highlightedPlaceId: string | null;
  setHighlightedPlaceId: (value: string | null) => void;
  currentDayTransferInfo: PlannerControllerReturn['currentDayTransferInfo'];
  selectedTrip: PlannerTrip;
  expensesByPlace: Map<string, { total: number; count: number }>;
  hotelStayDaysMap: {
    getDays: (place: { id: string; place_id?: string; title: string; kind?: string }) => number;
  };
  setTimingModalPlace: (place: PlannerScheduledPlace | null) => void;
  setBudgetInitialPlaceId: (id: string) => void;
  setRightTab: (tab: 'map' | 'context' | 'budget') => void;
  handleToggleVisitLock: PlannerControllerReturn['handleToggleVisitLock'];
  moveScheduled: PlannerControllerReturn['moveScheduled'];
  removeVisit: PlannerControllerReturn['removeVisit'];
  activeModeSwitchPair: string | null;
  setActiveModeSwitchPair: (value: string | null) => void;
  handleSwitchTravelMode: PlannerControllerReturn['handleSwitchTravelMode'];
  handleClearTravelEstimate: PlannerControllerReturn['handleClearTravelEstimate'];
  handleRecalculateTravelEstimate: PlannerControllerReturn['handleRecalculateTravelEstimate'];
}

export function PlannerDayTimeline(props: PlannerDayTimelineProps) {
  const {
    zh, scheduled, draggingPlaceId, dayAssessment, dayTimeline,
    highlightedPlaceId, setHighlightedPlaceId, currentDayTransferInfo,
    selectedTrip, expensesByPlace, hotelStayDaysMap,
    setTimingModalPlace, setBudgetInitialPlaceId, setRightTab, handleToggleVisitLock,
    moveScheduled, removeVisit, activeModeSwitchPair, setActiveModeSwitchPair,
    handleSwitchTravelMode, handleClearTravelEstimate, handleRecalculateTravelEstimate,
  } = props;
  const [transferExpanded, setTransferExpanded] = useState(false);
  return (
          <div className="p-2 sm:p-2.5">
            {currentDayTransferInfo?.isTransferDay ? (
              <div className="mb-1.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-xs text-amber-950 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setTransferExpanded((v) => !v)}
                  aria-expanded={transferExpanded}
                  className="flex w-full cursor-pointer items-center gap-1.5 text-left"
                  title={zh ? '点击展开换宿详情' : 'Toggle transfer details'}
                >
                  <span className="shrink-0">🧳</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-amber-900">
                    {zh ? '换宿日' : 'Transfer Day'}：{currentDayTransferInfo.checkoutHotel?.title} → {currentDayTransferInfo.checkinHotel?.title}
                  </span>
                  <span className={`shrink-0 text-[10px] text-amber-700 transition-transform ${transferExpanded ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>
                {transferExpanded ? (
                  <p className="mt-1.5 border-t border-amber-200/70 pt-1.5 text-[11px] leading-relaxed text-amber-800">
                    {zh ? (
                      <>
                        🌅 <b>退房:</b> {currentDayTransferInfo.checkoutHotel?.title}（行李可寄放前台） → 🌙 <b>入住:</b> {currentDayTransferInfo.checkinHotel?.title}
                      </>
                    ) : (
                      <>
                        🌅 <b>Check-out:</b> {currentDayTransferInfo.checkoutHotel?.title} → 🌙 <b>Check-in:</b> {currentDayTransferInfo.checkinHotel?.title}
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            ) : !currentDayTransferInfo?.isTransferDay && currentDayTransferInfo?.checkoutHotel && !currentDayTransferInfo.stayHotel ? (
              <div className="mb-1.5 flex items-center justify-between gap-1.5 rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 shadow-2xs">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                  <span className="shrink-0">🌅</span>
                  <span className="truncate">
                    {zh ? '早晨退房出发:' : 'Morning Checkout & Depart:'}{' '}
                    <strong className="font-bold">{currentDayTransferInfo.checkoutHotel.title}</strong>
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-sky-200/80 px-2 py-0.5 text-[10.5px] font-bold text-sky-900">
                  {zh ? '退房出发日 · 今晚不住宿' : 'Checkout & Departure Day'}
                </span>
              </div>
            ) : currentDayTransferInfo?.stayHotel ? (
              <div className="mb-1.5 flex items-center justify-between gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950 shadow-2xs">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">
                  <span className="shrink-0">🌙</span>
                  <span className="truncate">
                    {zh ? '今晚住宿:' : 'Tonight Stay:'}{' '}
                    <strong className="font-bold">{currentDayTransferInfo.stayHotel.title}</strong>
                  </span>
                </div>
                {currentDayTransferInfo.totalStayNights && currentDayTransferInfo.totalStayNights > 1 ? (
                  <span className="shrink-0 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10.5px] font-bold text-emerald-900">
                    {zh
                      ? `连住第 ${currentDayTransferInfo.stayNightIndex} 晚 / 共 ${currentDayTransferInfo.totalStayNights} 晚`
                      : `Night ${currentDayTransferInfo.stayNightIndex} of ${currentDayTransferInfo.totalStayNights}`}
                  </span>
                ) : null}
              </div>
            ) : null}
            {scheduled.length === 0 ? (
              <div className={`rounded-xl border-2 border-dashed px-4 py-12 text-center text-sm ${draggingPlaceId ? 'border-emerald-300 bg-emerald-50/50 text-emerald-700' : 'border-stone-200 text-stone-400'}`}>
                {zh ? '把 Research Pool 的候选拖进这一天，或点击“+ 当天”。' : 'Drag a researched candidate here, or use “+ Day”.'}
              </div>
            ) : (
              <ol className="space-y-1">
                {scheduled.map((place, index) => {
                  const timeOverlap = dayAssessment.time_overlaps.find((overlap) => overlap.fromId === place.id || overlap.toId === place.id);
                  const openHoursIssue = dayAssessment.opening_hours_warnings.find((issue) => issue.visit_id === place.visit_id || issue.place_id === place.place_id);
                  const col = timeOverlap
                    ? { isCollision: true, reason: zh ? '与当天其它地点存在时间重叠' : 'Overlaps another timed stop on this day' }
                    : openHoursIssue
                      ? { isCollision: true, reason: openHoursIssue.reason }
                      : undefined;
                  const timelineStop = dayTimeline.items.find(
                    (item): item is PlannerTimelineStopItem => item.type === 'stop' && (item.visit_id === place.visit_id || item.id === place.id),
                  );
                  const nextPlace = scheduled[index + 1];
                  const transitionItems = nextPlace
                    ? dayTimeline.items.filter(
                      (item): item is PlannerExecutionTransitionItem => item.type !== 'stop' && item.from_id === place.id && item.to_id === nextPlace.id,
                    )
                    : [];
                    return (
                    <li
                      key={place.id}
                      className="group space-y-1"
                      onMouseEnter={() => setHighlightedPlaceId(place.id)}
                      onMouseLeave={() => setHighlightedPlaceId(null)}
                    >
                      <div className={`relative flex items-start gap-2 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-2 transition-all duration-150 shadow-2xs ${
                        highlightedPlaceId === place.id
                          ? 'border-emerald-500 ring-2 ring-emerald-300/50 bg-emerald-50/30'
                          : 'border-stone-200/90 bg-white hover:border-stone-300'
                      }`}>
                        {/* Stop Number Circle */}
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white shrink-0 shadow-2xs mt-0.5">
                          {index + 1}
                        </div>

                        {/* Stop Content Body */}
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Row 1: Title (left, 1 line clamp) & Time Trigger (right) */}
                          <div className="flex items-center justify-between gap-1.5">
                            {/* Title with kind emoji */}
                            <div className="min-w-0 flex-1 flex items-center gap-1.5">
                              <span className="text-xs shrink-0">{PLANNER_KIND_ICONS[place.kind] || '📍'}</span>
                              <h3 className="truncate text-xs font-bold text-stone-900 leading-tight" title={place.title}>
                                {place.title}
                              </h3>
                              {place.kind === 'stay' ? (
                                place.anchor_type === 'stay_checkout' ||
                                (currentDayTransferInfo?.checkoutHotel &&
                                  (currentDayTransferInfo.checkoutHotel.id === place.id ||
                                    currentDayTransferInfo.checkoutHotel.visit_id === place.visit_id) &&
                                  currentDayTransferInfo.stayHotel?.visit_id !== place.visit_id) ? (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 py-0.2 text-[9px] font-bold text-sky-800 shrink-0">
                                    🌅 {zh ? '退房出发' : 'Checkout'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-800 shrink-0">
                                    🌙 {zh ? '今晚住宿' : 'Stay'}
                                  </span>
                                )
                              ) : null}
                            </div>

                            {/* Timing Trigger (Top Right) */}
                            <button
                              type="button"
                              onClick={() => setTimingModalPlace(place)}
                              className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold transition hover:scale-102 ${
                                timelineStop?.start
                                  ? timelineStop.is_inferred_start
                                    ? 'bg-amber-50/90 text-amber-800 border border-dashed border-amber-300 hover:bg-amber-100 font-mono'
                                    : 'bg-stone-100 text-stone-800 hover:bg-stone-200 ring-1 ring-stone-300/70 font-mono'
                                  : 'border border-dashed border-stone-300 bg-white text-stone-400 hover:border-stone-400 hover:text-stone-700'
                              }`}
                              title={
                                timelineStop?.is_inferred_start
                                  ? (zh ? '根据上一站游览与通勤时间自动推算；点击可手动调整或锁定' : 'Inferred arrival time; click to adjust or lock manually')
                                  : timelineStop?.start
                                    ? (zh ? '手动设置的游览时段；点击可修改' : 'Manual scheduled timing; click to edit')
                                    : (zh ? '设置开始时间与停留时长' : 'Set start time and duration')
                              }
                            >
                              <span>🕒</span>
                              <span>
                                {timelineStop?.start
                                  ? `${timelineStop.is_inferred_start ? '~' : ''}${timelineStop.start}${timelineStop.end ? `-${timelineStop.end}${timelineStop.crosses_midnight ? ' +1' : ''}` : ''}${timelineStop.is_inferred_start ? ` ${zh ? '估' : 'est'}` : ''}`
                                  : (zh ? '设时间' : 'Time')}
                              </span>
                            </button>
                          </div>

                          {/* Row 2: Bottom-Left Meta/Emojis & Bottom-Right Actions [ 📍 | ↑ | ↓ | ✕ ] */}
                          <div className="flex items-center justify-between gap-1.5 min-w-0">
                            {/* Bottom-Left: Meta info (Area, Duration, Price) + Quick Emojis (🧭, 📞, 🗺️, 📖, 🎟️, 💳) */}
                            <div className="flex items-center gap-1.5 text-[10.5px] text-stone-500 min-w-0 overflow-hidden">
                              {/* Meta Details */}
                              <div className="flex items-center gap-1 min-w-0 shrink-0">
                                {place.area ? <span className="text-stone-600 font-medium truncate max-w-[80px] sm:max-w-[110px] text-[10.5px]">{place.area}</span> : null}
                                {place.duration_minutes ? <span className="text-stone-400 shrink-0 text-[10px] font-mono">{place.duration_minutes}m</span> : null}
                                {(() => {
                                  const isHotel = place.kind === 'stay';
                                  const placeExpense =
                                    expensesByPlace.get(place.id) ||
                                    (place.place_id ? expensesByPlace.get(place.place_id) : undefined) ||
                                    expensesByPlace.get(place.title.trim().toLowerCase());

                                  if (isHotel) {
                                    // Hotel / Stay Card:
                                    // 1. Do NOT display estimated price (only used for hotel comparison).
                                    // 2. If there are recorded expenses, divide by stay days to get daily actual expense.
                                    if (!placeExpense || placeExpense.total <= 0) return null;
                                    const stayDays = hotelStayDaysMap.getDays(place);
                                    const dailyActual = Math.round((placeExpense.total / stayDays) * 100) / 100;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBudgetInitialPlaceId(place.id);
                                          setRightTab('budget');
                                        }}
                                        className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 text-[9.5px] font-semibold shrink-0 transition hover:bg-emerald-100"
                                        title={
                                          zh
                                            ? `实记 ${currencySymbolFor(selectedTrip?.currency)}${dailyActual}/天（总计 ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total}，共 ${stayDays} 晚分摊，共 ${placeExpense.count} 笔），点击前往账本查看`
                                            : `Actual: ${currencySymbolFor(selectedTrip?.currency)}${dailyActual}/day (Total ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total} across ${stayDays} nights, ${placeExpense.count} expenses), click to view in budget`
                                        }
                                      >
                                        💳 {zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip?.currency)}{dailyActual}{stayDays > 1 ? (zh ? '/天' : '/d') : ''}
                                      </button>
                                    );
                                  }

                                  // Non-hotel place: show estimated price if present, and actual expense if recorded
                                  return (
                                    <>
                                      {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates) ? (
                                        <span className="rounded bg-stone-100 px-1 py-0.2 text-[9.5px] font-semibold text-stone-700 shrink-0">
                                          {formatPlacePriceInTripCurrency(place, selectedTrip?.currency || 'CNY', selectedTrip?.fx_rates)}
                                        </span>
                                      ) : null}
                                      {placeExpense && placeExpense.total > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setBudgetInitialPlaceId(place.id);
                                            setRightTab('budget');
                                          }}
                                          className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1 py-0.2 text-[9.5px] font-semibold shrink-0 transition hover:bg-emerald-100"
                                          title={
                                            zh
                                              ? `实记 ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total}（共 ${placeExpense.count} 笔），点击前往账本查看`
                                              : `Actual: ${currencySymbolFor(selectedTrip?.currency)}${placeExpense.total} (${placeExpense.count} expenses), click to view in budget`
                                          }
                                        >
                                          💳 {zh ? '实记' : 'Act'}: {currencySymbolFor(selectedTrip?.currency)}{placeExpense.total}
                                        </button>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </div>

                              {/* Quick Action Emoji Buttons (hover/focus-revealed on fine pointers) */}
                              <div className="flex items-center gap-0.5 shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                                {/* 交通 / 导航 */}
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address || place.title)}&travelmode=${selectedTrip.transport_mode ?? 'transit'}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                  title={zh ? '导航到此地' : 'Directions'}
                                >
                                  🧭
                                </a>
                                {/* 电话 */}
                                {place.phone ? (
                                  <a
                                    href={`tel:${place.phone}`}
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-stone-200 transition"
                                    title={zh ? `拨打电话: ${place.phone}` : `Call: ${place.phone}`}
                                  >
                                    📞
                                  </a>
                                ) : null}
                                {/* 地图 */}
                                {place.source_url ? (
                                  <a
                                    href={place.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                    title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
                                  >
                                    🗺️
                                  </a>
                                ) : (
                                  <a
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.address || place.title)}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-600 hover:bg-stone-200 hover:text-stone-900 transition"
                                    title={zh ? '在 Google Maps 中搜索' : 'Search on Maps'}
                                  >
                                    🗺️
                                  </a>
                                )}
                                {/* 菜单 */}
                                {place.menu_url ? (
                                  <a
                                    href={place.menu_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-stone-200 transition"
                                    title={zh ? '查看菜单' : 'Menu'}
                                  >
                                    📖
                                  </a>
                                ) : null}
                                {/* 预订 */}
                                {place.reservation_url ? (
                                  <a
                                    href={place.reservation_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex h-4.5 w-4.5 items-center justify-center rounded border border-amber-300 bg-amber-50 text-[10px] text-amber-900 hover:bg-amber-100 transition shadow-2xs"
                                    title={zh ? '官方预订' : 'Reserve'}
                                  >
                                    🎟️
                                  </a>
                                ) : null}
                                {/* 记账 */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBudgetInitialPlaceId(place.id);
                                    setRightTab('budget');
                                  }}
                                  className="inline-flex h-4.5 w-4.5 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 transition"
                                  title={zh ? '为此地点记一笔账' : 'Record expense for this place'}
                                >
                                  💳
                                </button>
                              </div>
                            </div>

                            {/* Bottom-Right: Grouped 4 Actions (hover/focus-revealed on fine pointers) */}
                            <div className="inline-flex items-center rounded border border-stone-200 bg-stone-50/90 p-0.5 shadow-2xs shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                              <button
                                type="button"
                                aria-label={place.locked ? (zh ? '取消固定' : 'Unpin') : (zh ? '固定顺位' : 'Pin')}
                                onClick={() => void handleToggleVisitLock(place.visit_id)}
                                className={`flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] transition ${
                                  place.locked
                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                    : 'text-stone-400 hover:bg-white hover:text-stone-700'
                                }`}
                                title={place.locked ? (zh ? '已固定顺位（交通优化不移动此站）' : 'Pinned') : (zh ? '固定在当前顺位' : 'Pin stop')}
                              >
                                {place.locked ? '📌' : '📍'}
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '上移' : 'Move up'}
                                disabled={index === 0}
                                onClick={() => void moveScheduled(index, -1)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '上移一站' : 'Move up'}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '下移' : 'Move down'}
                                disabled={index === scheduled.length - 1}
                                onClick={() => void moveScheduled(index, 1)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] font-bold text-stone-500 hover:bg-white hover:text-stone-900 disabled:opacity-20 transition"
                                title={zh ? '下移一站' : 'Move down'}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                aria-label={zh ? '从当天日程移除' : 'Remove stop'}
                                onClick={() => void removeVisit(place)}
                                className="flex h-4.5 w-4.5 items-center justify-center rounded text-[10px] text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title={zh ? '从当天日程移除（回到待安排候选池）' : 'Remove stop'}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Warning / Conflict Alerts */}
                          {col?.isCollision ? (
                            <div className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200 leading-tight">
                              <span>⚠️</span>
                              <span>{col.reason}</span>
                            </div>
                          ) : null}

                          {/* Deduplicated Research Note / Why Insight (Only 1 block displayed) */}
                          {place.why ? (
                            <p className="line-clamp-1 rounded bg-stone-50 px-1.5 py-0.5 text-[10px] text-stone-600 leading-tight">
                              💡 <strong className="font-semibold text-stone-700">{zh ? '推荐理由:' : 'Why:'}</strong> {place.why}
                            </p>
                          ) : place.notes ? (
                            <p className="line-clamp-1 text-[10px] text-stone-500 italic pl-0.5 leading-tight">
                              📝 {place.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {/* Travel Transition Rail (Between Stops) */}
                      {index < scheduled.length - 1 ? (
                        <div className="relative ml-3 border-l-2 border-dashed border-stone-200 py-1 pl-3.5 space-y-1">
                          {isTransitHubPlace(place) && isTransitHubPlace(nextPlace) ? (
                            <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100/90 px-2.5 py-0.5 text-[10px] font-semibold text-stone-700 shadow-2xs">
                              <span>✈️ {zh ? '跨城交通 · 依据票务时间' : 'Intercity Transit (Ticket-based)'}</span>
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-stone-200 hover:bg-stone-300 px-1.5 py-0.2 text-[9px] font-bold text-stone-800 transition"
                              >
                                Google 路线 ↗
                              </a>
                            </div>
                          ) : transitionItems.length === 0 ? (
                            (() => {
                              const isPairSwitching = activeModeSwitchPair === `${place.id}->${nextPlace.id}`;
                              const defaultLeg = calculateDefaultTripLeg(selectedTrip, place, nextPlace);
                              const modeKey = defaultLeg?.mode ?? (selectedTrip.transport_mode ?? 'driving');
                              const modeConfig = PLANNER_TRAVEL_MODE_CONFIG[modeKey] ?? PLANNER_TRAVEL_MODE_CONFIG.driving;
                              const icon = modeConfig.emoji;
                              const dur = defaultLeg?.duration_minutes ?? modeConfig.defaultDuration;
                              const distance = defaultLeg?.distance_meters === undefined
                                ? ''
                                : defaultLeg.distance_meters < 1000 ? ` · ${defaultLeg.distance_meters} m` : ` · ${(defaultLeg.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div className="relative inline-flex flex-wrap items-center gap-1.5">
                                  <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-sky-200/90 bg-sky-50/90 px-2.5 py-0.5 text-[10px] font-semibold text-sky-900 shadow-2xs">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                      }}
                                      className="inline-flex items-center gap-1 hover:text-sky-700 hover:underline cursor-pointer transition font-medium"
                                      title={zh ? '点击切换出行方式' : 'Click to change travel mode'}
                                    >
                                      <span>{icon} {dur} min{distance}</span>
                                      <span className="text-[8.5px] opacity-70">▾</span>
                                    </button>
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${modeKey === 'motorcycle' ? 'two_wheeler' : (modeKey ?? 'transit')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-full bg-sky-100 hover:bg-sky-200 px-1.5 py-0.2 text-[9px] font-bold text-sky-800 transition"
                                    >
                                      Google 导航 ↗
                                    </a>
                                  </div>

                                  {/* Mode Switch Popover */}
                                  {isPairSwitching && selectedTrip ? (
                                    <TravelModeSwitchPopover
                                      zh={zh}
                                      selectedTrip={selectedTrip}
                                      place={place}
                                      nextPlace={nextPlace}
                                      currentMode={modeKey}
                                      isCleared={false}
                                      onSelectMode={(m) => {
                                        setActiveModeSwitchPair(null);
                                        void handleSwitchTravelMode(place, nextPlace, m);
                                      }}
                                      onClearEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleClearTravelEstimate(place, nextPlace);
                                      }}
                                      onRecalculateEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleRecalculateTravelEstimate(place, nextPlace);
                                      }}
                                      onClose={() => setActiveModeSwitchPair(null)}
                                    />
                                  ) : null}
                                </div>
                              );
                            })()
                          ) : transitionItems.map((item) => {
                            if (item.type === 'travel') {
                              const isPairSwitching = activeModeSwitchPair === `${place.id}->${nextPlace.id}`;
                              const isCleared = item.duration_minutes === 0;
                              const modeKey = (item.mode as PlannerTravelMode) || 'driving';
                              const modeConfig = PLANNER_TRAVEL_MODE_CONFIG[modeKey] ?? PLANNER_TRAVEL_MODE_CONFIG.driving;
                              const icon = modeConfig.emoji;
                              const distance = item.distance_meters === undefined
                                ? ''
                                : item.distance_meters < 1000 ? ` · ${item.distance_meters} m` : ` · ${(item.distance_meters / 1000).toFixed(1)} km`;
                              return (
                                <div key={item.id} className="relative inline-flex flex-wrap items-center gap-2">
                                  {isCleared ? (
                                    <div className="inline-flex flex-wrap items-center gap-2 px-1 py-0.5 text-[10.5px] text-stone-400">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                        }}
                                        className="inline-flex items-center gap-1 hover:text-stone-800 hover:underline cursor-pointer transition font-medium"
                                        title={zh ? '当前无需交通时间预估，点击可恢复或切换' : 'No travel estimate. Click to switch or restore'}
                                      >
                                        <span>🚫 {zh ? '无预估' : 'No est'}</span>
                                        <span className="text-[9px] opacity-70">▾</span>
                                      </button>
                                      <a
                                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9.5px] text-stone-400 hover:text-stone-700 underline underline-offset-2 transition"
                                      >
                                        Google 导航 ↗
                                      </a>
                                    </div>
                                  ) : (
                                    <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-stone-500">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveModeSwitchPair(isPairSwitching ? null : `${place.id}->${nextPlace.id}`);
                                        }}
                                        className="inline-flex items-center gap-1 hover:text-stone-800 hover:underline cursor-pointer transition"
                                        title={zh ? '点击切换出行方式或清除预估' : 'Click to change travel mode or clear estimate'}
                                      >
                                        <span className="font-medium text-stone-600">{icon} {item.duration_minutes} min{distance}{item.source === 'manual' ? (zh ? '（手）' : ' (manual)') : item.source === 'openrouteservice' ? '' : (zh ? '（估）' : ' (est.)')}</span>
                                        <span className="text-[9px] opacity-70">▾</span>
                                      </button>
                                      {item.start && item.end ? <span className="font-mono text-stone-400">{item.start}–{item.end}</span> : null}
                                      <a
                                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${item.mode === 'motorcycle' ? 'two_wheeler' : (item.mode ?? selectedTrip.transport_mode ?? 'transit')}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[9.5px] text-stone-400 hover:text-stone-700 underline underline-offset-2 transition"
                                      >
                                        Google 导航 ↗
                                      </a>
                                    </div>
                                  )}

                                  {/* Mode Switch Popover */}
                                  {isPairSwitching && selectedTrip ? (
                                    <TravelModeSwitchPopover
                                      zh={zh}
                                      selectedTrip={selectedTrip}
                                      place={place}
                                      nextPlace={nextPlace}
                                      currentMode={modeKey}
                                      isCleared={isCleared}
                                      onSelectMode={(m) => {
                                        setActiveModeSwitchPair(null);
                                        void handleSwitchTravelMode(place, nextPlace, m);
                                      }}
                                      onClearEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleClearTravelEstimate(place, nextPlace);
                                      }}
                                      onRecalculateEstimate={() => {
                                        setActiveModeSwitchPair(null);
                                        void handleRecalculateTravelEstimate(place, nextPlace);
                                      }}
                                      onClose={() => setActiveModeSwitchPair(null)}
                                    />
                                  ) : null}
                                </div>
                              );
                            }
                            if (item.type === 'gap') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-[10px] font-semibold text-emerald-800 shadow-2xs">
                                  <span>◌</span>
                                  <span>{zh ? `机动空闲 ${item.duration_minutes} min` : `${item.duration_minutes} min buffer`} · {item.start}-{item.end}</span>
                                </div>
                              );
                            }
                            if (item.type === 'conflict') {
                              return (
                                <div key={item.id} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-0.5 text-[10px] font-semibold text-rose-800 shadow-2xs">
                                  <span>🚨</span>
                                  <span>{zh
                                    ? `衔接冲突 · 最早 ${item.earliest_arrival ?? '次日'} 到达 · 比下一站晚 ${item.late_by_minutes} min`
                                    : `Conflict · ${item.late_by_minutes} min late`}</span>
                                </div>
                              );
                            }
                            // Only render travel_time_missing (which has navigation link); hide "时间不完整" by default
                            if (item.type === 'unknown' && item.reason === 'travel_time_missing') {
                              return (
                                <div key={item.id} className="inline-flex flex-wrap items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <span>❔ {zh ? '交通时间未确认' : 'Travel time unknown'}</span>
                                  <a
                                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(place.address || place.title)}&destination=${encodeURIComponent(nextPlace.address || nextPlace.title)}&travelmode=${selectedTrip.transport_mode === 'motorcycle' ? 'two_wheeler' : (selectedTrip.transport_mode ?? 'transit')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full bg-amber-100 hover:bg-amber-200 px-1.5 py-0.2 text-[9.5px] font-bold text-amber-900 transition"
                                  >
                                    Google 导航 ↗
                                  </a>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
  );
}
