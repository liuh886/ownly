'use client';

import { useMemo } from 'react';
import type { PlannerTripPlace } from '@/domain/planner';
import { calculateHotelProximity } from '@/domain/planner';

interface HotelComparisonModalProps {
  open: boolean;
  onClose: () => void;
  candidateHotels: PlannerTripPlace[];
  scheduledPlaces: PlannerTripPlace[];
  activeDate: string;
  activeDayIndex: number;
  onSelectHotelForDay: (hotel: PlannerTripPlace) => void;
  onDropHotel: (hotelId: string) => void;
  onHoverHotel?: (hotelId: string | null) => void;
  language?: 'zh' | 'en';
}

export function HotelComparisonModal({
  open,
  onClose,
  candidateHotels,
  scheduledPlaces,
  activeDate,
  activeDayIndex,
  onSelectHotelForDay,
  onDropHotel,
  onHoverHotel,
  language = 'zh',
}: HotelComparisonModalProps) {
  const zh = language === 'zh';

  // Compute proximity metrics for each candidate hotel
  const hotelMetrics = useMemo(() => {
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
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/90 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🏨</span>
              <h3 className="text-base font-bold text-stone-900">
                {zh ? '酒店多维比选 (Hotel Comparison Matrix)' : 'Hotel Comparison Matrix'}
              </h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                {candidateHotels.length} {zh ? '家备选' : 'candidates'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              {zh
                ? `针对 第 ${activeDayIndex + 1} 天 (${activeDate}) 游玩景点群的地理就近度、预算与口碑多维决策`
                : `Compare candidate stays against Day ${activeDayIndex + 1} (${activeDate}) itinerary for proximity, budget & amenities`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
          >
            ✕
          </button>
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
                const metrics = hotelMetrics.get(hotel.id);
                const hasSpots = scheduledPlaces.length > 0;

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
                          <span>🎯 {zh ? '距当日景点群距离' : 'Proximity to Day Stops'}</span>
                          {metrics && metrics.hasCoordinates && hasSpots ? (
                            <span
                              className={`rounded-full px-1.5 py-0.2 text-[9.5px] font-bold ${
                                metrics.centerDistanceKm < 2.5
                                  ? 'bg-emerald-600 text-white'
                                  : metrics.centerDistanceKm < 6
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-stone-400 text-white'
                              }`}
                            >
                              {metrics.centerDistanceKm < 2.5
                                ? (zh ? '🟢 极近顺路' : '🟢 Close')
                                : metrics.centerDistanceKm < 6
                                ? (zh ? '🟡 适中' : '🟡 Moderate')
                                : (zh ? '🔴 较远' : '🔴 Far')}
                            </span>
                          ) : null}
                        </div>

                        {hasSpots && metrics && metrics.hasCoordinates ? (
                          <div className="mt-1 space-y-1 text-[10.5px] text-stone-600">
                            <div className="flex justify-between">
                              <span className="text-stone-400">{zh ? '距景点中心:' : 'To Centroid:'}</span>
                              <span className="font-semibold text-stone-800">{metrics.centerDistanceKm} km</span>
                            </div>
                            {metrics.closestPlaceTitle ? (
                              <div className="flex justify-between truncate">
                                <span className="text-stone-400">{zh ? '距最近点' : 'Closest'} ({metrics.closestPlaceTitle}):</span>
                                <span className="font-semibold text-stone-800">{metrics.minDistanceKm} km</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between">
                              <span className="text-stone-400">{zh ? '平均直线:' : 'Avg Distance:'}</span>
                              <span className="font-semibold text-stone-800">{metrics.avgDistanceKm} km</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-stone-400 italic">
                            {hasSpots
                              ? (zh ? '未解析到经纬度' : 'No coordinates')
                              : (zh ? '当天暂无安排景点，无法计算距离' : 'Add spots to active day to compute distance')}
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
                          onSelectHotelForDay(hotel);
                          onClose();
                        }}
                        className="w-full rounded-lg bg-stone-950 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800 transition"
                      >
                        ⭐ {zh ? `选定为第 ${activeDayIndex + 1} 天住宿` : `Select for Day ${activeDayIndex + 1}`}
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
