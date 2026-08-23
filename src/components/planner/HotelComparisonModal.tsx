'use client';

import { useMemo, useState } from 'react';
import type { PlannerTripPlace } from '@/domain/planner';
import {
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
} from '@/domain/planner';

interface HotelComparisonModalProps {
  open: boolean;
  onClose: () => void;
  candidateHotels: PlannerTripPlace[];
  scheduledPlaces: PlannerTripPlace[];
  placesByDate?: Record<string, PlannerTripPlace[]>;
  tripDates?: string[];
  activeDate: string;
  activeDayIndex: number;
  onSelectHotelForStaySpan: (hotel: PlannerTripPlace, stayDates: string[]) => void;
  onDropHotel: (hotelId: string) => void;
  onHoverHotel?: (hotelId: string | null) => void;
  language?: 'zh' | 'en';
}

export function HotelComparisonModal({
  open,
  onClose,
  candidateHotels,
  scheduledPlaces,
  placesByDate = {},
  tripDates = [],
  activeDate,
  activeDayIndex,
  onSelectHotelForStaySpan,
  onDropHotel,
  onHoverHotel,
  language = 'zh',
}: HotelComparisonModalProps) {
  const zh = language === 'zh';
  const totalDays = tripDates.length || 1;

  // Stay Range Selection: end index (inclusive)
  const [stayEndIndex, setStayEndIndex] = useState<number>(activeDayIndex);
  const [isFullTripStay, setIsFullTripStay] = useState<boolean>(false);

  // Derive target stay dates
  const targetStayDates = useMemo(() => {
    if (isFullTripStay && tripDates.length > 0) {
      return tripDates;
    }
    const end = Math.min(Math.max(stayEndIndex, activeDayIndex), totalDays - 1);
    return tripDates.length > 0 ? tripDates.slice(activeDayIndex, end + 1) : [activeDate];
  }, [isFullTripStay, tripDates, stayEndIndex, activeDayIndex, totalDays, activeDate]);

  const stayNightsCount = targetStayDates.length;

  // Compute multi-day proximity metrics for each candidate hotel
  const multiDayMetricsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateMultiDayHotelProximity>>();
    candidateHotels.forEach((hotel) => {
      map.set(hotel.id, calculateMultiDayHotelProximity(hotel, placesByDate, targetStayDates));
    });
    return map;
  }, [candidateHotels, placesByDate, targetStayDates]);

  // Single-day active day metrics
  const singleDayMetricsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateHotelProximity>>();
    candidateHotels.forEach((hotel) => {
      map.set(hotel.id, calculateHotelProximity(hotel, scheduledPlaces));
    });
    return map;
  }, [candidateHotels, scheduledPlaces]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-3 sm:p-6 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="border-b border-stone-100 bg-stone-50/90 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏨</span>
              <h3 className="text-base font-bold text-stone-900">
                {zh ? '酒店多维比选与连住排期' : 'Hotel Comparison & Stay Span'}
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {candidateHotels.length} {zh ? '家备选' : 'candidates'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            >
              ✕
            </button>
          </div>

          {/* Stay Range Selector */}
          {totalDays > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 border border-stone-200 shadow-2xs">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1">
                <span>📅</span> {zh ? '入住跨度:' : 'Stay Span:'}
              </span>

              {/* Single Active Day */}
              <button
                type="button"
                onClick={() => {
                  setIsFullTripStay(false);
                  setStayEndIndex(activeDayIndex);
                }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  !isFullTripStay && stayEndIndex === activeDayIndex
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {zh ? `仅第 ${activeDayIndex + 1} 天 (1 晚)` : `Day ${activeDayIndex + 1} (1N)`}
              </button>

              {/* Multi-day consecutive buttons */}
              {Array.from({ length: totalDays - activeDayIndex - 1 }, (_, i) => activeDayIndex + 1 + i).map(
                (targetIdx) => {
                  const nights = targetIdx - activeDayIndex + 1;
                  const isSelected = !isFullTripStay && stayEndIndex === targetIdx;
                  return (
                    <button
                      key={targetIdx}
                      type="button"
                      onClick={() => {
                        setIsFullTripStay(false);
                        setStayEndIndex(targetIdx);
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        isSelected
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {zh
                        ? `连住至第 ${targetIdx + 1} 天 (${nights} 晚)`
                        : `Stay through Day ${targetIdx + 1} (${nights}N)`}
                    </button>
                  );
                },
              )}

              {/* Full Trip Stay */}
              {activeDayIndex > 0 || totalDays > 2 ? (
                <button
                  type="button"
                  onClick={() => setIsFullTripStay(true)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    isFullTripStay
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {zh ? `全程连住 (Day 1 ~ ${totalDays} 共 ${totalDays} 晚)` : `Full Trip (${totalDays}N)`}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {candidateHotels.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-stone-200 px-6 py-16 text-center text-stone-400">
              <span className="text-4xl">🏨</span>
              <h4 className="mt-3 text-sm font-semibold text-stone-700">
                {zh ? '当前暂无候选酒店' : 'No candidate hotels found'}
              </h4>
              <p className="mt-1 text-xs text-stone-400">
                {zh
                  ? '在 Google Maps / 扩展中采集属于“住宿 (stay)”类别的地点，即可在此进行同屏多维比选。'
                  : 'Capture places with kind "stay" in Google Maps to compare them here.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {candidateHotels.map((hotel) => {
                const singleMetrics = singleDayMetricsMap.get(hotel.id);
                const multiMetrics = multiDayMetricsMap.get(hotel.id);
                const isMultiNight = stayNightsCount > 1;

                return (
                  <div
                    key={hotel.id}
                    onMouseEnter={() => onHoverHotel?.(hotel.id)}
                    onMouseLeave={() => onHoverHotel?.(null)}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-xs transition-all hover:border-emerald-400 hover:shadow-md"
                  >
                    <div>
                      {/* Title & Area */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-stone-900 text-sm">{hotel.title}</h4>
                          {hotel.area ? (
                            <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                              📍 {hotel.area}
                            </span>
                          ) : null}
                        </div>
                        {hotel.observed_rating ? (
                          <div className="flex items-center gap-1 shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                            ★ {hotel.observed_rating}
                          </div>
                        ) : null}
                      </div>

                      {/* Price & Class */}
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 p-2.5 text-xs">
                        <span className="text-stone-500">{zh ? '预估价格' : 'Price'}</span>
                        <strong className="text-emerald-700 font-semibold">
                          {hotel.observed_price || (zh ? '暂无价格' : 'N/A')}
                        </strong>
                      </div>

                      {/* Proximity Metrics */}
                      <div className="mt-3 space-y-1.5 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-[11px] text-emerald-900">
                        <div className="font-semibold text-emerald-800 flex items-center justify-between">
                          <span>
                            🎯 {isMultiNight ? (zh ? `连住 ${stayNightsCount} 晚综合通勤` : `${stayNightsCount}N Combined Distance`) : (zh ? '距当日景点群距离' : 'Proximity to Day Stops')}
                          </span>
                          {multiMetrics && multiMetrics.hasCoordinates ? (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[9.5px] font-bold ${
                                multiMetrics.combinedAvgKm < 2.5
                                  ? 'bg-emerald-600 text-white'
                                  : multiMetrics.combinedAvgKm < 6
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-stone-400 text-white'
                              }`}
                            >
                              {multiMetrics.combinedAvgKm < 2.5
                                ? (zh ? '🟢 极近顺路' : '🟢 Close')
                                : multiMetrics.combinedAvgKm < 6
                                ? (zh ? '🟡 适中' : '🟡 Moderate')
                                : (zh ? '🔴 较远' : '🔴 Far')}
                            </span>
                          ) : null}
                        </div>

                        {multiMetrics && multiMetrics.hasCoordinates ? (
                          <div className="mt-1 space-y-1 text-[10.5px] text-stone-600">
                            {isMultiNight ? (
                              <>
                                <div className="flex justify-between font-semibold text-emerald-950">
                                  <span>{zh ? '全程平均直线:' : 'Combined Avg:'}</span>
                                  <span>{multiMetrics.combinedAvgKm} km</span>
                                </div>
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-emerald-200/60">
                                  {multiMetrics.dayDetails.map((day) => (
                                    <span
                                      key={day.date}
                                      className="rounded bg-white px-1.5 py-0.5 text-[10px] text-stone-600 border border-stone-200"
                                    >
                                      D{day.dayIndex + 1}: {day.spotCount > 0 ? `${day.avgKm}km` : (zh ? '无点' : 'none')}
                                    </span>
                                  ))}
                                </div>
                              </>
                            ) : singleMetrics ? (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-stone-400">{zh ? '距景点中心:' : 'To Centroid:'}</span>
                                  <span className="font-semibold text-stone-800">{singleMetrics.centerDistanceKm} km</span>
                                </div>
                                {singleMetrics.closestPlaceTitle ? (
                                  <div className="flex justify-between truncate">
                                    <span className="text-stone-400">{zh ? '距最近点' : 'Closest'}:</span>
                                    <span className="font-semibold text-stone-800 truncate">{singleMetrics.closestPlaceTitle} ({singleMetrics.minDistanceKm}km)</span>
                                  </div>
                                ) : null}
                                <div className="flex justify-between">
                                  <span className="text-stone-400">{zh ? '平均直线:' : 'Avg Distance:'}</span>
                                  <span className="font-semibold text-stone-800">{singleMetrics.avgDistanceKm} km</span>
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-[10px] text-stone-400 italic">
                            {zh ? '未解析到经纬度' : 'No coordinates available'}
                          </p>
                        )}
                      </div>

                      {/* Signals & Risks */}
                      <div className="mt-3 space-y-1.5 text-xs">
                        {hotel.signals.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {hotel.signals.map((sig) => (
                              <span
                                key={sig}
                                className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200"
                              >
                                ✓ {sig}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {hotel.risks.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {hotel.risks.map((risk) => (
                              <span
                                key={risk}
                                className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200"
                              >
                                ⚠️ {risk}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {hotel.why || hotel.notes ? (
                          <p className="mt-1.5 line-clamp-2 text-[11px] text-stone-600 bg-stone-50 p-2 rounded-md">
                            💡 {hotel.why || hotel.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Decision Actions */}
                    <div className="mt-4 pt-3 border-t border-stone-100 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectHotelForStaySpan(hotel, targetStayDates);
                          onClose();
                        }}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                          isMultiNight
                            ? 'bg-emerald-800 hover:bg-emerald-700 shadow-sm'
                            : 'bg-stone-950 hover:bg-stone-800'
                        }`}
                      >
                        ⭐{' '}
                        {isMultiNight
                          ? zh
                            ? `设为 ${targetStayDates[0]} ~ ${targetStayDates[targetStayDates.length - 1]} 连住宿点 (${stayNightsCount} 晚)`
                            : `Select for ${stayNightsCount} Nights (${targetStayDates[0]} ~ ${targetStayDates[targetStayDates.length - 1]})`
                          : zh
                          ? `选定为第 ${activeDayIndex + 1} 天住宿`
                          : `Select for Day ${activeDayIndex + 1}`}
                      </button>

                      <div className="flex items-center justify-between text-[11px]">
                        <a
                          href={hotel.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          🗺️ {zh ? 'Google Maps' : 'View Map'}
                        </a>
                        <button
                          type="button"
                          onClick={() => onDropHotel(hotel.id)}
                          className="text-stone-400 hover:text-rose-600"
                        >
                          {zh ? '移出比选' : 'Dismiss'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-stone-100 bg-stone-50 px-5 py-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            {zh ? '关闭比选' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
