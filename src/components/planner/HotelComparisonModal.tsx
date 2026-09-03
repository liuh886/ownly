'use client';

import { useMemo, useState } from 'react';
import type { PlannerScheduledPlace, PlannerTripPlace } from '@/domain/planner';
import {
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
  formatPlacePriceInTripCurrency,
  inferPlaceCity,
} from '@/domain/planner';

interface HotelComparisonModalProps {
  open: boolean;
  onClose: () => void;
  candidateHotels: PlannerTripPlace[];
  scheduledPlaces: PlannerScheduledPlace[];
  placesByDate?: Record<string, PlannerScheduledPlace[]>;
  tripDates?: string[];
  activeDate: string;
  activeDayIndex: number;
  destinations?: string[];
  tripCurrency?: string;
  fxRates?: Record<string, number>;
  onSelectHotelForStaySpan: (hotel: PlannerTripPlace, stayDates: string[]) => void;
  onDropHotel: (hotelId: string) => void;
  onHoverHotel?: (hotelId: string | null) => void;
  language?: 'zh' | 'en';
}

type HotelSortOption = 'proximity' | 'price' | 'rating' | 'title';
type HotelViewMode = 'table' | 'cards';

export function HotelComparisonModal({
  open,
  onClose,
  candidateHotels,
  scheduledPlaces,
  placesByDate = {},
  tripDates = [],
  activeDate,
  activeDayIndex,
  destinations = [],
  tripCurrency = 'CNY',
  fxRates,
  onSelectHotelForStaySpan,
  onDropHotel,
  onHoverHotel,
  language = 'zh',
}: HotelComparisonModalProps) {
  const zh = language === 'zh';
  const totalDays = tripDates.length || 1;

  // Stay Range Selection
  const [stayEndIndex, setStayEndIndex] = useState<number>(activeDayIndex);
  const [isFullTripStay, setIsFullTripStay] = useState<boolean>(false);

  // Filters, Search & View Controls
  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<HotelSortOption>('proximity');
  const [viewMode, setViewMode] = useState<HotelViewMode>('table');

  // Derive target stay dates
  const targetStayDates = useMemo(() => {
    if (isFullTripStay && tripDates.length > 0) {
      return tripDates;
    }
    const end = Math.min(Math.max(stayEndIndex, activeDayIndex), totalDays - 1);
    return tripDates.length > 0 ? tripDates.slice(activeDayIndex, end + 1) : [activeDate];
  }, [isFullTripStay, tripDates, stayEndIndex, activeDayIndex, totalDays, activeDate]);

  const stayNightsCount = targetStayDates.length;
  const isMultiNight = stayNightsCount > 1;

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

  // City mapping for all candidate hotels
  const hotelCityMap = useMemo(() => {
    const map = new Map<string, string>();
    candidateHotels.forEach((hotel) => {
      map.set(hotel.id, inferPlaceCity(hotel, destinations));
    });
    return map;
  }, [candidateHotels, destinations]);

  // Grouping statistics by city
  const cityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    candidateHotels.forEach((hotel) => {
      const city = hotelCityMap.get(hotel.id) || '未分类城市';
      counts.set(city, (counts.get(city) || 0) + 1);
    });
    return counts;
  }, [candidateHotels, hotelCityMap]);

  const uniqueCities = useMemo(() => Array.from(cityCounts.keys()), [cityCounts]);

  // Filtered & Sorted Hotels
  const processedHotels = useMemo(() => {
    let list = [...candidateHotels];

    // 1. City Filter
    if (selectedCity !== 'ALL') {
      list = list.filter((h) => hotelCityMap.get(h.id) === selectedCity);
    }

    // 2. Text Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((h) => {
        const title = (h.title || '').toLowerCase();
        const area = (h.area || '').toLowerCase();
        const address = (h.address || '').toLowerCase();
        const why = (h.why || '').toLowerCase();
        const notes = (h.notes || '').toLowerCase();
        const tags = (h.tags || []).join(' ').toLowerCase();
        return title.includes(q) || area.includes(q) || address.includes(q) || why.includes(q) || notes.includes(q) || tags.includes(q);
      });
    }

    // 3. Sorting
    list.sort((a, b) => {
      if (sortBy === 'proximity') {
        const ma = multiDayMetricsMap.get(a.id);
        const mb = multiDayMetricsMap.get(b.id);
        const da = ma?.hasCoordinates ? ma.combinedAvgKm : 9999;
        const db = mb?.hasCoordinates ? mb.combinedAvgKm : 9999;
        return da - db;
      }
      if (sortBy === 'price') {
        const pa = typeof a.price_min === 'number' ? a.price_min : (typeof a.price_max === 'number' ? a.price_max : 999999);
        const pb = typeof b.price_min === 'number' ? b.price_min : (typeof b.price_max === 'number' ? b.price_max : 999999);
        return pa - pb;
      }
      if (sortBy === 'rating') {
        const ra = a.observed_rating ?? 0;
        const rb = b.observed_rating ?? 0;
        return rb - ra;
      }
      return a.title.localeCompare(b.title);
    });

    return list;
  }, [candidateHotels, selectedCity, searchQuery, sortBy, hotelCityMap, multiDayMetricsMap]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-2 sm:p-4 backdrop-blur-xs animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="border-b border-stone-100 bg-stone-50/90 px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏨</span>
              <div>
                <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <span>{zh ? '住宿比选与连住排期' : 'Hotel Comparison & Stay Span'}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-xs font-bold text-emerald-800">
                    {candidateHotels.length} {zh ? '家备选' : 'candidates'}
                  </span>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Switch */}
              <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    viewMode === 'table' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  📊 {zh ? '全景表格' : 'Table'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    viewMode === 'cards' ? 'bg-stone-900 text-white shadow-xs' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  🗂️ {zh ? '卡片模式' : 'Cards'}
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stay Range Selector */}
          {totalDays > 1 ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 border border-stone-200 shadow-2xs">
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
                {zh ? `第 ${activeDayIndex + 1} 天 (${targetStayDates[0]} 1晚)` : `Day ${activeDayIndex + 1} (1N)`}
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
                        : `Through Day ${targetIdx + 1} (${nights}N)`}
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
                  {zh ? `全程连住 (${totalDays} 晚)` : `Full Trip (${totalDays}N)`}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* City / Destination Filter Bar + Search + Sort */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
            {/* City Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-0.5">
              <span className="text-xs font-semibold text-stone-500 mr-0.5">🏙️ {zh ? '城市分组:' : 'City:'}</span>
              <button
                type="button"
                onClick={() => setSelectedCity('ALL')}
                className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${
                  selectedCity === 'ALL'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {zh ? '全部城市' : 'All Cities'} ({candidateHotels.length})
              </button>
              {uniqueCities.map((city) => {
                const count = cityCounts.get(city) || 0;
                const isSelected = selectedCity === city;
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setSelectedCity(city)}
                    className={`rounded-full px-3 py-0.5 text-xs font-medium transition ${
                      isSelected
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {city} ({count})
                  </button>
                );
              })}
            </div>

            {/* Quick Search & Sort */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={zh ? '🔍 搜索酒店、区域或亮点…' : '🔍 Search hotel/highlights…'}
                className="h-7 w-44 sm:w-56 rounded-lg border border-stone-200 bg-white px-2.5 text-xs text-stone-800 placeholder-stone-400 focus:border-emerald-500 focus:outline-none"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as HotelSortOption)}
                className="h-7 rounded-lg border border-stone-200 bg-white px-2 text-xs font-medium text-stone-700 focus:border-emerald-500 focus:outline-none"
              >
                <option value="proximity">🎯 {zh ? '顺路通勤优先' : 'Closest First'}</option>
                <option value="price">💰 {zh ? '价格从低到高' : 'Price: Low to High'}</option>
                <option value="rating">⭐ {zh ? '评分从高到低' : 'Rating: High to Low'}</option>
                <option value="title">🔤 {zh ? '按名称排序' : 'By Name'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
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
          ) : processedHotels.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-stone-200 px-6 py-12 text-center text-stone-400">
              <span className="text-3xl">🔍</span>
              <p className="mt-2 text-xs text-stone-500">
                {zh ? '未找到符合当前城市或搜索条件的酒店' : 'No hotels match the current filter or search'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCity('ALL');
                  setSearchQuery('');
                }}
                className="mt-3 rounded-md bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200"
              >
                {zh ? '重置筛选条件' : 'Reset Filters'}
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* ========================================================================= */
            /* 1. Enhanced Table View (Full Fact Matrix)                                 */
            /* ========================================================================= */
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-2xs">
              <table className="min-w-full divide-y divide-stone-200 text-left text-xs">
                <thead className="bg-stone-50 text-stone-600 font-bold sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="px-3.5 py-2.5 min-w-[200px]">
                      {zh ? '🏨 酒店与城市区域' : 'Hotel & Area'}
                    </th>
                    <th scope="col" className="px-3 py-2.5 min-w-[130px]">
                      {zh ? '💰 参考房价 (本币折算)' : 'Price (Trip Currency)'}
                    </th>
                    <th scope="col" className="px-3 py-2.5 min-w-[100px]">
                      {zh ? '⭐ 评分口碑' : 'Rating & Reviews'}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 min-w-[210px]">
                      {zh ? `🎯 ${isMultiNight ? `${stayNightsCount}晚综合通勤` : '当日行程通勤'}` : 'Commute / Proximity'}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 min-w-[200px]">
                      {zh ? '💡 特色亮点 / 避坑提示' : 'Highlights & Risks'}
                    </th>
                    <th scope="col" className="px-3 py-2.5 min-w-[110px]">
                      {zh ? '🔗 渠道与信息' : 'Channels'}
                    </th>
                    <th scope="col" className="px-3.5 py-2.5 text-right min-w-[140px]">
                      {zh ? '⚡ 决策排期' : 'Action'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {processedHotels.map((hotel) => {
                    const multiMetrics = multiDayMetricsMap.get(hotel.id);
                    const singleMetrics = singleDayMetricsMap.get(hotel.id);
                    const city = hotelCityMap.get(hotel.id);
                    const priceFormatted = formatPlacePriceInTripCurrency(hotel, tripCurrency, fxRates);

                    return (
                      <tr
                        key={hotel.id}
                        onMouseEnter={() => onHoverHotel?.(hotel.id)}
                        onMouseLeave={() => onHoverHotel?.(null)}
                        className="hover:bg-emerald-50/40 transition-colors"
                      >
                        {/* 1. Hotel Title & City / Area */}
                        <td className="px-3.5 py-3 align-top">
                          <div className="font-bold text-stone-900 text-[13px] leading-tight flex items-start gap-1">
                            <span>{hotel.title}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                            {city ? (
                              <span className="rounded bg-sky-50 px-1.5 py-0.2 font-medium text-sky-800 border border-sky-200">
                                🏙️ {city}
                              </span>
                            ) : null}
                            {hotel.area && hotel.area !== city ? (
                              <span className="rounded bg-stone-100 px-1.5 py-0.2 font-medium text-stone-600">
                                📍 {hotel.area}
                              </span>
                            ) : null}
                            {hotel.source_category ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 font-medium text-amber-800 border border-amber-200">
                                🏷️ {hotel.source_category}
                              </span>
                            ) : null}
                          </div>
                          {hotel.address ? (
                            <p className="mt-1 text-[10px] text-stone-400 line-clamp-1 max-w-[260px]" title={hotel.address}>
                              {hotel.address}
                            </p>
                          ) : null}
                        </td>

                        {/* 2. Price & Stay Span Total Estimate */}
                        <td className="px-3 py-3 align-top">
                          {priceFormatted ? (
                            <div>
                              <strong className="text-emerald-700 font-bold text-[12px] block">
                                {priceFormatted}
                              </strong>
                              {isMultiNight && typeof hotel.price_min === 'number' ? (
                                <span className="mt-0.5 inline-block text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded font-medium">
                                  {zh ? `${stayNightsCount}晚预估: ` : `${stayNightsCount}N Est: `}
                                  {formatPlacePriceInTripCurrency(
                                    { ...hotel, price_min: hotel.price_min * stayNightsCount, price_max: hotel.price_max ? hotel.price_max * stayNightsCount : undefined },
                                    tripCurrency,
                                    fxRates,
                                  )}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-stone-400 text-xs italic">{zh ? '暂无价格' : 'N/A'}</span>
                          )}
                        </td>

                        {/* 3. Rating & Reviews */}
                        <td className="px-3 py-3 align-top">
                          {hotel.observed_rating ? (
                            <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-800 text-[11px]">
                              ★ {hotel.observed_rating}
                            </div>
                          ) : (
                            <span className="text-stone-400 text-[11px]">—</span>
                          )}
                        </td>

                        {/* 4. Proximity & Commute */}
                        <td className="px-3.5 py-3 align-top">
                          {multiMetrics && multiMetrics.hasCoordinates ? (
                            <div>
                              <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                                <span>{isMultiNight ? `${multiMetrics.combinedAvgKm} km` : `${singleMetrics?.avgDistanceKm ?? multiMetrics.combinedAvgKm} km`}</span>
                                <span
                                  className={`rounded px-1.5 py-0.2 text-[9.5px] font-bold ${
                                    multiMetrics.combinedAvgKm < 2.5
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : multiMetrics.combinedAvgKm < 6
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-stone-200 text-stone-700'
                                  }`}
                                >
                                  {multiMetrics.combinedAvgKm < 2.5
                                    ? (zh ? '🟢 极近顺路' : '🟢 Close')
                                    : multiMetrics.combinedAvgKm < 6
                                    ? (zh ? '🟡 适中' : '🟡 Moderate')
                                    : (zh ? '🔴 较远' : '🔴 Far')}
                                </span>
                              </div>

                              {/* Multi-day breakdown badges */}
                              {isMultiNight ? (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {multiMetrics.dayDetails.map((day) => (
                                    <span
                                      key={day.date}
                                      className="rounded bg-stone-50 px-1 py-0.2 text-[9.5px] text-stone-600 border border-stone-200"
                                      title={zh ? `第 ${day.dayIndex + 1} 天 (${day.date}): ${day.spotCount} 个景点，平均距离 ${day.avgKm} km` : `Day ${day.dayIndex + 1}: ${day.avgKm}km`}
                                    >
                                      D{day.dayIndex + 1}: {day.spotCount > 0 ? `${day.avgKm}k` : '—'}
                                    </span>
                                  ))}
                                </div>
                              ) : singleMetrics?.closestPlaceTitle ? (
                                <p className="mt-0.5 text-[10px] text-stone-500 line-clamp-1" title={singleMetrics.closestPlaceTitle}>
                                  {zh ? '距最近' : 'Closest'}: {singleMetrics.closestPlaceTitle} ({singleMetrics.minDistanceKm}km)
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 italic">{zh ? '未解析坐标' : 'No coords'}</span>
                          )}
                        </td>

                        {/* 5. Signals, Risks & Why */}
                        <td className="px-3.5 py-3 align-top">
                          <div className="space-y-1 max-w-[240px]">
                            {hotel.signals.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {hotel.signals.slice(0, 3).map((sig) => (
                                  <span key={sig} className="rounded bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-medium text-emerald-800 border border-emerald-200">
                                    ✓ {sig}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {hotel.risks.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {hotel.risks.slice(0, 2).map((risk) => (
                                  <span key={risk} className="rounded bg-rose-50 px-1.5 py-0.2 text-[9.5px] font-medium text-rose-800 border border-rose-200">
                                    ⚠️ {risk}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                            {hotel.why || hotel.notes ? (
                              <p className="text-[10.5px] text-stone-600 line-clamp-2 bg-stone-50 p-1.5 rounded" title={hotel.why || hotel.notes}>
                                💡 {hotel.why || hotel.notes}
                              </p>
                            ) : null}
                          </div>
                        </td>

                        {/* 6. Channels / Links */}
                        <td className="px-3 py-3 align-top">
                          <div className="flex flex-col gap-1 text-[11px]">
                            {hotel.source_url ? (
                              <a
                                href={hotel.source_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-emerald-700 hover:underline flex items-center gap-0.5"
                              >
                                🗺️ <span>Maps</span>
                              </a>
                            ) : null}
                            {hotel.reservation_url ? (
                              <a
                                href={hotel.reservation_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-amber-800 hover:underline flex items-center gap-0.5"
                              >
                                🎟️ <span>{zh ? '预订' : 'Book'}</span>
                              </a>
                            ) : null}
                            {hotel.phone ? (
                              <a
                                href={`tel:${hotel.phone}`}
                                className="text-stone-500 hover:text-stone-800 flex items-center gap-0.5"
                                title={hotel.phone}
                              >
                                📞 <span className="truncate max-w-[80px]">{hotel.phone}</span>
                              </a>
                            ) : null}
                          </div>
                        </td>

                        {/* 7. Decision Actions */}
                        <td className="px-3.5 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectHotelForStaySpan(hotel, targetStayDates);
                              onClose();
                            }}
                            className="w-full rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-800 transition"
                          >
                            ⭐ {isMultiNight ? (zh ? `连住 ${stayNightsCount} 晚` : `${stayNightsCount}N Stay`) : (zh ? '设为入住' : 'Select')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDropHotel(hotel.id)}
                            className="mt-1.5 text-[10px] text-stone-400 hover:text-rose-600 transition"
                          >
                            {zh ? '暂不考虑' : 'Shelve'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* ========================================================================= */
            /* 2. Card View Mode                                                         */
            /* ========================================================================= */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {processedHotels.map((hotel) => {
                const singleMetrics = singleDayMetricsMap.get(hotel.id);
                const multiMetrics = multiDayMetricsMap.get(hotel.id);
                const city = hotelCityMap.get(hotel.id);
                const priceFormatted = formatPlacePriceInTripCurrency(hotel, tripCurrency, fxRates);

                return (
                  <div
                    key={hotel.id}
                    onMouseEnter={() => onHoverHotel?.(hotel.id)}
                    onMouseLeave={() => onHoverHotel?.(null)}
                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-xs transition-all hover:border-emerald-400 hover:shadow-md"
                  >
                    <div>
                      {/* Title & City/Area */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-stone-900 text-sm">{hotel.title}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {city ? (
                              <span className="rounded bg-sky-50 px-1.5 py-0.2 text-[10px] font-medium text-sky-800 border border-sky-200">
                                🏙️ {city}
                              </span>
                            ) : null}
                            {hotel.area && hotel.area !== city ? (
                              <span className="rounded bg-stone-100 px-1.5 py-0.2 text-[10px] font-medium text-stone-600">
                                📍 {hotel.area}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {hotel.observed_rating ? (
                          <div className="flex items-center gap-1 shrink-0 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                            ★ {hotel.observed_rating}
                          </div>
                        ) : null}
                      </div>

                      {/* Price & Class */}
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 p-2.5 text-xs">
                        <span className="text-stone-500">{zh ? '抓取参考价' : 'Reference Price'}</span>
                        <strong className="text-emerald-700 font-semibold">
                          {priceFormatted || (zh ? '暂无价格' : 'N/A')}
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
                          className="text-stone-400 hover:text-rose-600 transition"
                          title={zh ? '设为暂不考虑，可随时在候选池折叠区中重新考虑' : 'Shelve this hotel, recoverable anytime in Research Pool'}
                        >
                          {zh ? '暂不考虑' : 'Shelve'}
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
        <div className="border-t border-stone-100 bg-stone-50 px-5 py-2.5 flex items-center justify-between text-xs text-stone-500">
          <div>
            {zh ? `当前显示 ${processedHotels.length} / ${candidateHotels.length} 家住宿` : `Showing ${processedHotels.length} / ${candidateHotels.length} hotels`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-4 py-1.5 font-semibold text-stone-700 hover:bg-stone-100"
          >
            {zh ? '关闭比选' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}

