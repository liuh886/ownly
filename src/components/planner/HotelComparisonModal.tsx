'use client';

import { useMemo, useState } from 'react';
import type { PlannerScheduledPlace, PlannerTripPlace } from '@/domain/planner';
import {
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
  formatPlacePriceInTripCurrency,
  getPlaceConvertedNumericPrice,
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

  // Stay Slot & Range Selection (填空式槽位)
  const [stayStartIndex, setStayStartIndex] = useState<number>(activeDayIndex);
  const [stayEndIndex, setStayEndIndex] = useState<number>(activeDayIndex);
  const [isFullTripStay, setIsFullTripStay] = useState<boolean>(false);

  // Existing scheduled stays map per date
  const scheduledStaysByDate = useMemo(() => {
    const map = new Map<string, PlannerScheduledPlace>();
    Object.entries(placesByDate).forEach(([date, places]) => {
      const stay = places.find((p) => p.kind === 'stay');
      if (stay) map.set(date, stay);
    });
    return map;
  }, [placesByDate]);

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
    const start = Math.min(Math.max(stayStartIndex, 0), totalDays - 1);
    const end = Math.min(Math.max(stayEndIndex, start), totalDays - 1);
    return tripDates.length > 0 ? tripDates.slice(start, end + 1) : [activeDate];
  }, [isFullTripStay, tripDates, stayStartIndex, stayEndIndex, totalDays, activeDate]);

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
        const pa = getPlaceConvertedNumericPrice(a, tripCurrency, fxRates)?.avg ?? 99999999;
        const pb = getPlaceConvertedNumericPrice(b, tripCurrency, fxRates)?.avg ?? 99999999;
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
  }, [candidateHotels, selectedCity, searchQuery, sortBy, hotelCityMap, multiDayMetricsMap, tripCurrency, fxRates]);

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

          {/* Fill-in-the-Blank Stay Slots Strip */}
          {totalDays > 0 ? (
            <div className="mt-2.5 rounded-xl bg-white p-2.5 border border-stone-200 shadow-2xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                  <span>🗓️</span>
                  <span>{zh ? '行程住宿槽位填空:' : 'Stay Day Slots:'}</span>
                  <span className="text-[11px] font-medium text-stone-500">
                    {zh
                      ? `当前目标: 第 ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `~${stayEndIndex + 1}` : ''} 天 (${targetStayDates.length} 晚)`
                      : `Target: Day ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `-${stayEndIndex + 1}` : ''} (${targetStayDates.length}N)`}
                  </span>
                </div>

                {/* Quick Span Helpers */}
                <div className="flex items-center gap-1 text-xs">
                  {stayEndIndex > stayStartIndex ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFullTripStay(false);
                        setStayEndIndex(stayStartIndex);
                      }}
                      className="rounded-md bg-stone-100 hover:bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-700 transition"
                    >
                      {zh ? '改住 1 晚' : '1 Night Only'}
                    </button>
                  ) : null}
                  {stayEndIndex < totalDays - 1 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFullTripStay(false);
                        setStayEndIndex((cur) => Math.min(totalDays - 1, cur + 1));
                      }}
                      className="rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 transition"
                    >
                      ➕ {zh ? '连住+1天' : '+1 Night'}
                    </button>
                  ) : null}
                  {totalDays > 2 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFullTripStay(true);
                        setStayStartIndex(0);
                        setStayEndIndex(totalDays - 1);
                      }}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                        isFullTripStay
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {zh ? `全程连住 (${totalDays}晚)` : `Full Trip (${totalDays}N)`}
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Interactive Day Slots List */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
                {tripDates.map((date, idx) => {
                  const scheduledStay = scheduledStaysByDate.get(date);
                  const isTarget = isFullTripStay || (idx >= stayStartIndex && idx <= stayEndIndex);
                  const isStart = !isFullTripStay && idx === stayStartIndex;
                  const isEnd = !isFullTripStay && idx === stayEndIndex;

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        setIsFullTripStay(false);
                        if (stayStartIndex === idx && stayEndIndex === idx) {
                          if (idx < totalDays - 1) {
                            setStayEndIndex(idx + 1);
                          }
                        } else {
                          setStayStartIndex(idx);
                          setStayEndIndex(idx);
                        }
                      }}
                      className={`flex flex-col items-start min-w-[120px] max-w-[160px] p-1.5 rounded-lg border text-left transition shadow-2xs ${
                        isTarget
                          ? 'border-emerald-600 bg-emerald-50/80 ring-2 ring-emerald-400/40 text-emerald-950'
                          : 'border-stone-200 bg-stone-50 hover:bg-white hover:border-stone-300 text-stone-700'
                      }`}
                      title={zh ? `点击选择第 ${idx + 1} 天为待填空位，再次点击可连住` : `Click Day ${idx + 1} to select`}
                    >
                      <div className="flex items-center justify-between w-full text-[11px] font-bold">
                        <span>D{idx + 1} · {date.slice(5)}</span>
                        {isTarget ? (
                          <span className="text-[10px] font-bold text-emerald-700">
                            {isStart && isEnd ? '📍 目标' : isStart ? '🚩 起始' : isEnd ? '🏁 结束' : '🔗 连住'}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[10.5px] font-medium w-full">
                        {scheduledStay ? (
                          <span className="text-stone-900" title={scheduledStay.title}>
                            🏨 {scheduledStay.title}
                          </span>
                        ) : (
                          <span className="text-stone-400 italic">⚪ 待选空位</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
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
                                <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                  {zh ? `总${stayNightsCount}晚约 ` : `${stayNightsCount}N Est: `}
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

                        {/* 3. Rating, Class & Reviews */}
                        <td className="px-3 py-3 align-top">
                          {hotel.observed_rating ? (
                            <div>
                              <div className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 font-bold text-amber-800 text-[11px]">
                                ★ {hotel.observed_rating}
                              </div>
                              {hotel.observed_review_count ? (
                                <span className="mt-0.5 block text-[10px] text-stone-400">
                                  ({hotel.observed_review_count > 999 ? `${(hotel.observed_review_count / 1000).toFixed(1)}k` : hotel.observed_review_count} {zh ? '条点评' : 'reviews'})
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-stone-400 text-[11px]">—</span>
                          )}
                          {hotel.source_category ? (
                            <div className="mt-1">
                              <span className="inline-block rounded bg-amber-50/80 px-1.5 py-0.2 text-[9.5px] font-medium text-amber-900 border border-amber-200/80">
                                🏷️ {hotel.source_category}
                              </span>
                            </div>
                          ) : null}
                          {hotel.hotel_facts?.opened_year ? (
                            <div className="mt-1">
                              <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-semibold text-emerald-800 border border-emerald-200">
                                📅 {hotel.hotel_facts.opened_year} {zh ? '开业' : 'Opened'}
                              </span>
                            </div>
                          ) : null}
                          {hotel.hotel_facts?.renovated_year ? (
                            <div className="mt-0.5">
                              <span className="inline-block rounded bg-teal-50 px-1.5 py-0.2 text-[9.5px] font-semibold text-teal-800 border border-teal-200">
                                ✨ {hotel.hotel_facts.renovated_year} {zh ? '装修' : 'Renovated'}
                              </span>
                            </div>
                          ) : null}
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

                        {/* 5. Signals, Review Topics, Risks & Why */}
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
                            {hotel.review_topics && hotel.review_topics.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {hotel.review_topics.slice(0, 3).map((topic) => (
                                  <span key={topic} className="rounded bg-sky-50 px-1.5 py-0.2 text-[9.5px] font-medium text-sky-800 border border-sky-200">
                                    💬 {topic}
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
                            title={zh ? '填入选定天' : 'Fill selected slot'}
                          >
                            ⭐ {zh ? `填入第 ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `~${stayEndIndex + 1}` : ''} 天 (${stayNightsCount} 晚)` : `Set Day ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `-${stayEndIndex + 1}` : ''} (${stayNightsCount}N)`}
                          </button>
                          {stayEndIndex < totalDays - 1 ? (
                            <button
                              type="button"
                              onClick={() => {
                                const nextEnd = Math.min(totalDays - 1, stayEndIndex + 1);
                                setStayEndIndex(nextEnd);
                                const nextDates = tripDates.slice(stayStartIndex, nextEnd + 1);
                                onSelectHotelForStaySpan(hotel, nextDates);
                              }}
                              className="mt-1 w-full rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                              title={zh ? `连住+1天（连住至第 ${stayEndIndex + 2} 天）` : `Extend +1 night`}
                            >
                              ➕ {zh ? `连住+1天 (至第${stayEndIndex + 2}天)` : `+1N (Through D${stayEndIndex + 2})`}
                            </button>
                          ) : null}
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
                            {hotel.source_category ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-medium text-amber-800 border border-amber-200">
                                🏷️ {hotel.source_category}
                              </span>
                            ) : null}
                            {hotel.hotel_facts?.opened_year ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                                📅 {hotel.hotel_facts.opened_year} {zh ? '开业' : 'Opened'}
                              </span>
                            ) : null}
                            {hotel.hotel_facts?.renovated_year ? (
                              <span className="rounded bg-teal-50 px-1.5 py-0.2 text-[10px] font-semibold text-teal-800 border border-teal-200">
                                ✨ {hotel.hotel_facts.renovated_year} {zh ? '装修' : 'Renovated'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {hotel.observed_rating ? (
                          <div className="flex flex-col items-end shrink-0">
                            <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 border border-amber-200">
                              ★ {hotel.observed_rating}
                            </div>
                            {hotel.observed_review_count ? (
                              <span className="mt-0.5 text-[9.5px] text-stone-400">
                                {hotel.observed_review_count > 999 ? `${(hotel.observed_review_count / 1000).toFixed(1)}k` : hotel.observed_review_count} {zh ? '条点评' : 'reviews'}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {/* Price & Class */}
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-stone-50 p-2.5 text-xs">
                        <span className="text-stone-500">{zh ? '抓取参考价' : 'Reference Price'}</span>
                        <div className="text-right">
                          <strong className="text-emerald-700 font-semibold block">
                            {priceFormatted || (zh ? '暂无价格' : 'N/A')}
                          </strong>
                          {isMultiNight && typeof hotel.price_min === 'number' ? (
                            <span className="mt-0.5 inline-block text-[9.5px] text-emerald-800 font-bold bg-emerald-50 px-1 rounded border border-emerald-200">
                              {zh ? `总${stayNightsCount}晚约 ` : `${stayNightsCount}N: `}
                              {formatPlacePriceInTripCurrency(
                                { ...hotel, price_min: hotel.price_min * stayNightsCount, price_max: hotel.price_max ? hotel.price_max * stayNightsCount : undefined },
                                tripCurrency,
                                fxRates,
                              )}
                            </span>
                          ) : null}
                        </div>
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

                        {hotel.review_topics && hotel.review_topics.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {hotel.review_topics.slice(0, 3).map((topic) => (
                              <span
                                key={topic}
                                className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-200"
                              >
                                💬 {topic}
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
                        className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-2 text-xs font-semibold text-white transition shadow-2xs"
                      >
                        ⭐ {zh ? `填入第 ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `~${stayEndIndex + 1}` : ''} 天 (${stayNightsCount} 晚)` : `Set Day ${stayStartIndex + 1}${stayEndIndex > stayStartIndex ? `-${stayEndIndex + 1}` : ''} (${stayNightsCount}N)`}
                      </button>

                      {stayEndIndex < totalDays - 1 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const nextEnd = Math.min(totalDays - 1, stayEndIndex + 1);
                            setStayEndIndex(nextEnd);
                            const nextDates = tripDates.slice(stayStartIndex, nextEnd + 1);
                            onSelectHotelForStaySpan(hotel, nextDates);
                          }}
                          className="w-full rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                        >
                          ➕ {zh ? `连住+1天 (至第${stayEndIndex + 2}天)` : `+1 Night (Through Day ${stayEndIndex + 2})`}
                        </button>
                      ) : null}

                      <div className="flex items-center justify-between text-[11px] mt-0.5">
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

