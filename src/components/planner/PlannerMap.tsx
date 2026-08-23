'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerTripPlace } from '@/domain/planner';
import { extractPlaceCoordinates } from '@/domain/planner';
import { searchCities } from '@/domain/travel';

interface PlannerMapProps {
  scheduledPlaces: PlannerTripPlace[];
  candidatePlaces: PlannerTripPlace[];
  destinations?: string[];
  activeDate?: string;
  activeDayIndex: number;
  highlightedPlaceId?: string | null;
  onSchedulePlace: (placeId: string) => void;
  onUnschedulePlace: (place: PlannerTripPlace) => void;
  onHoverPlace?: (placeId: string | null) => void;
  language?: 'zh' | 'en';
}

interface Point {
  place: PlannerTripPlace;
  lat: number;
  lng: number;
  isScheduled: boolean;
  order?: number;
}

const KIND_EMOJI: Record<string, string> = {
  attraction: '🏰',
  food: '🍜',
  cafe: '☕',
  stay: '🏨',
  shopping: '🛍️',
  transit: '🚇',
  experience: '🧗',
  other: '📍',
};

// Web Mercator projection
function projectLngToX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * Math.pow(2, zoom) * 256;
}

function projectLatToY(lat: number, zoom: number): number {
  const latRad = Math.max(-85.0511, Math.min(85.0511, lat)) * (Math.PI / 180);
  return (
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
    2 *
    Math.pow(2, zoom) *
    256
  );
}

function calculateBounds(pts: Point[]) {
  if (pts.length === 0) {
    return { center: { lat: 35.6762, lng: 139.6503 }, zoom: 13 };
  }
  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;

  pts.forEach((p) => {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  });

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const maxSpan = Math.max(maxLat - minLat, maxLng - minLng);

  let z = 14;
  if (maxSpan > 10) z = 5;
  else if (maxSpan > 5) z = 7;
  else if (maxSpan > 2) z = 9;
  else if (maxSpan > 0.8) z = 11;
  else if (maxSpan > 0.3) z = 12;
  else if (maxSpan > 0.1) z = 13;
  else if (maxSpan > 0.04) z = 14;
  else z = 15;

  return { center: { lat: centerLat, lng: centerLng }, zoom: z };
}

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const ZOOM_STEP_BUTTON = 1;
const ZOOM_STEP_WHEEL = 0.5;

export function PlannerMap({
  scheduledPlaces,
  candidatePlaces,
  destinations,
  activeDate,
  activeDayIndex,
  highlightedPlaceId,
  onSchedulePlace,
  onUnschedulePlace,
  onHoverPlace,
  language = 'zh',
}: PlannerMapProps) {
  const zh = language === 'zh';
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'candidates' | 'scheduled'>('all');

  // Extract valid geo points
  const points = useMemo<Point[]>(() => {
    const result: Point[] = [];

    scheduledPlaces.forEach((place, index) => {
      const coords = extractPlaceCoordinates(place);
      if (coords) {
        result.push({
          place,
          lat: coords.lat,
          lng: coords.lng,
          isScheduled: true,
          order: index + 1,
        });
      }
    });

    candidatePlaces.forEach((place) => {
      const coords = extractPlaceCoordinates(place);
      if (coords) {
        result.push({
          place,
          lat: coords.lat,
          lng: coords.lng,
          isScheduled: false,
        });
      }
    });

    return result;
  }, [scheduledPlaces, candidatePlaces]);

  // Initial bounds
  const initial = useMemo(() => calculateBounds(points), [points]);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(initial.center);
  const [zoom, setZoom] = useState(initial.zoom);

  // Fallback geocode destination using Ownly's cities.json database
  useEffect(() => {
    if (points.length === 0 && destinations && destinations.length > 0) {
      let active = true;
      void searchCities(destinations[0], 1).then((results) => {
        if (!active || results.length === 0) return;
        setCenter({ lat: results[0].latitude, lng: results[0].longitude });
        setZoom(13);
      });
      return () => {
        active = false;
      };
    }
  }, [destinations, points.length]);

  // Fit bounds helper on user button click
  const fitBounds = useCallback(() => {
    const activePoints = filterMode === 'scheduled'
      ? points.filter((p) => p.isScheduled)
      : points;

    if (activePoints.length === 0) return;
    const computed = calculateBounds(activePoints);
    setCenter(computed.center);
    setZoom(computed.zoom);
  }, [filterMode, points]);

  // Pan & pinch interaction (pointer events cover mouse, touch and pen)
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStartRef = useRef<{ x: number; y: number; center: { lat: number; lng: number } } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
    midX: number;
    midY: number;
    geo: { lat: number; lng: number };
  } | null>(null);
  const lastPinchEndRef = useRef(0);

  const viewRef = useRef({ center, zoom });
  useEffect(() => {
    viewRef.current = { center, zoom };
  }, [center, zoom]);

  // Dimensions
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 400, height: 350 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const clampZoom = useCallback((value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)), []);

  const viewportSize = useCallback(() => ({
    width: containerSize.width || containerRef.current?.clientWidth || 400,
    height: containerSize.height || containerRef.current?.clientHeight || 300,
  }), [containerSize.height, containerSize.width]);

  const screenToGeo = useCallback((sx: number, sy: number) => {
    const { width, height } = viewportSize();
    const view = viewRef.current;
    const scale = Math.pow(2, view.zoom) * 256;
    const wx = projectLngToX(view.center.lng, view.zoom) - width / 2 + sx;
    const wy = projectLatToY(view.center.lat, view.zoom) - height / 2 + sy;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * wy) / scale)));
    return {
      lng: Math.max(-180, Math.min(180, (wx / scale) * 360 - 180)),
      lat: Math.max(-85, Math.min(85, (latRad * 180) / Math.PI)),
    };
  }, [viewportSize]);

  // Center required so that `geo` stays under screen point (sx, sy) at zoomTo.
  const centerForAnchor = useCallback((geo: { lat: number; lng: number }, zoomTo: number, sx: number, sy: number) => {
    const { width, height } = viewportSize();
    const nextScale = Math.pow(2, zoomTo) * 256;
    const cwX = ((geo.lng + 180) / 360) * nextScale - sx + width / 2;
    const cwY = projectLatToY(geo.lat, zoomTo) - sy + height / 2;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * cwY) / nextScale)));
    return {
      lng: Math.max(-180, Math.min(180, (cwX / nextScale) * 360 - 180)),
      lat: Math.max(-85, Math.min(85, (latRad * 180) / Math.PI)),
    };
  }, [viewportSize]);

  // Keep the geographic point under (sx, sy) stationary while changing zoom.
  const applyZoomAround = useCallback((targetZoom: number, sx: number, sy: number) => {
    const zoomTo = clampZoom(targetZoom);
    if (zoomTo === viewRef.current.zoom) return;
    setCenter(centerForAnchor(screenToGeo(sx, sy), zoomTo, sx, sy));
    setZoom(zoomTo);
  }, [centerForAnchor, clampZoom, screenToGeo]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = containerRef.current?.getBoundingClientRect();
    const point = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    activePointers.current.set(e.pointerId, point);
    try {
      containerRef.current?.setPointerCapture(e.pointerId);
    } catch {}

    if (activePointers.current.size === 2) {
      dragStartRef.current = null;
      const [a, b] = [...activePointers.current.values()];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      pinchRef.current = {
        startDistance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)),
        startZoom: viewRef.current.zoom,
        midX,
        midY,
        geo: screenToGeo(midX, midY),
      };
    } else if (activePointers.current.size === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, center: { ...viewRef.current.center } };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activePointers.current.has(e.pointerId)) return;
    const rect = containerRef.current?.getBoundingClientRect();
    activePointers.current.set(e.pointerId, { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });

    if (pinchRef.current && activePointers.current.size >= 2) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const pinch = pinchRef.current;
      const zoomTo = clampZoom(pinch.startZoom + Math.log2(distance / pinch.startDistance));
      setCenter(centerForAnchor(pinch.geo, zoomTo, midX, midY));
      setZoom(zoomTo);
      return;
    }

    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const startX = projectLngToX(dragStartRef.current.center.lng, zoom);
    const startY = projectLatToY(dragStartRef.current.center.lat, zoom);

    const newX = startX - dx;
    const newY = startY - dy;

    const scale = Math.pow(2, zoom) * 256;
    const newLng = (newX / scale) * 360 - 180;
    const newLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * newY) / scale)));
    const newLat = (newLatRad * 180) / Math.PI;

    setCenter({
      lat: Math.max(-85, Math.min(85, newLat)),
      lng: Math.max(-180, Math.min(180, newLng)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (pinchRef.current && activePointers.current.size < 2) {
      pinchRef.current = null;
      lastPinchEndRef.current = Date.now();
    }
    const remaining = [...activePointers.current.values()][0];
    if (remaining) {
      setIsDragging(true);
      const rect = containerRef.current?.getBoundingClientRect();
      dragStartRef.current = {
        x: remaining.x + (rect?.left ?? 0),
        y: remaining.y + (rect?.top ?? 0),
        center: { ...viewRef.current.center },
      };
    } else {
      setIsDragging(false);
      dragStartRef.current = null;
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const step = event.deltaY < 0 ? ZOOM_STEP_WHEEL : -ZOOM_STEP_WHEEL;
      requestAnimationFrame(() => applyZoomAround(viewRef.current.zoom + step, sx, sy));
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [applyZoomAround]);

  const centerX = projectLngToX(center.lng, zoom);
  const centerY = projectLatToY(center.lat, zoom);

  // Visible tiles calculation
  const intZoom = Math.floor(zoom);
  const tileSize = 256 * Math.pow(2, zoom - intZoom);
  const numTiles = Math.pow(2, intZoom);

  const startTileX = Math.floor((centerX - containerSize.width / 2) / tileSize);
  const endTileX = Math.floor((centerX + containerSize.width / 2) / tileSize);
  const startTileY = Math.floor((centerY - containerSize.height / 2) / tileSize);
  const endTileY = Math.floor((centerY + containerSize.height / 2) / tileSize);

  const tiles = [];
  for (let tx = startTileX; tx <= endTileX; tx++) {
    for (let ty = startTileY; ty <= endTileY; ty++) {
      const wrappedX = ((tx % numTiles) + numTiles) % numTiles;
      if (ty >= 0 && ty < numTiles) {
        const left = tx * tileSize - (centerX - containerSize.width / 2);
        const top = ty * tileSize - (centerY - containerSize.height / 2);
        tiles.push({
          key: `${intZoom}/${wrappedX}/${ty}`,
          x: wrappedX,
          y: ty,
          left,
          top,
        });
      }
    }
  }

  // Filtered display points
  const visiblePoints = useMemo(() => {
    return points.filter((p) => {
      if (filterMode === 'scheduled') return p.isScheduled;
      if (filterMode === 'candidates') return !p.isScheduled;
      return true;
    });
  }, [points, filterMode]);

  // Scheduled route points for line rendering
  const scheduledRoutePoints = useMemo(() => {
    return points
      .filter((p) => p.isScheduled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => {
        const x = projectLngToX(p.lng, zoom) - centerX + containerSize.width / 2;
        const y = projectLatToY(p.lat, zoom) - centerY + containerSize.height / 2;
        return { ...p, x, y };
      });
  }, [points, zoom, centerX, centerY, containerSize.width, containerSize.height]);

  const selectedPlace = useMemo(() => {
    return points.find((p) => p.place.id === selectedPlaceId)?.place ?? null;
  }, [points, selectedPlaceId]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/80 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-stone-800">🗺️ {zh ? '空间建议地图' : 'Spatial Map'}</span>
          {activeDate ? <span className="text-[10px] text-stone-400 hidden sm:inline">({activeDate})</span> : null}
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            {points.length} {zh ? '个定位点' : 'mapped'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${filterMode === 'all' ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'}`}
          >
            {zh ? '全部' : 'All'} ({points.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('scheduled')}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${filterMode === 'scheduled' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'}`}
          >
            🟢 {zh ? `第${activeDayIndex + 1}天路线` : `Day ${activeDayIndex + 1}`} ({scheduledPlaces.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('candidates')}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${filterMode === 'candidates' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'}`}
          >
            🔵 {zh ? '候选池' : 'Pool'} ({candidatePlaces.length})
          </button>
        </div>
      </div>

      {/* Map Viewport Area */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative flex-1 cursor-grab overflow-hidden select-none active:cursor-grabbing"
        style={{ minHeight: '300px', background: '#e5e7eb', touchAction: 'none' }}
      >
        {/* OpenStreetMap Carto Positron Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={t.key}
              src={`https://basemaps.cartocdn.com/rastertiles/voyager/${t.key}.png`}
              alt=""
              className="absolute"
              style={{
                left: `${t.left}px`,
                top: `${t.top}px`,
                width: `${tileSize}px`,
                height: `${tileSize}px`,
              }}
              loading="lazy"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (img.dataset.fallback) return;
                img.dataset.fallback = '1';
                img.src = `https://tile.openstreetmap.org/${t.key}.png`;
              }}
            />
          ))}
        </div>

        {/* Connecting Polyline Route SVG overlay */}
        {scheduledRoutePoints.length >= 2 && (filterMode === 'all' || filterMode === 'scheduled') && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={scheduledRoutePoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#047857"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6,4"
              className="opacity-85"
            />
          </svg>
        )}

        {/* POI Markers */}
        {visiblePoints.map((p) => {
          const x = projectLngToX(p.lng, zoom) - centerX + containerSize.width / 2;
          const y = projectLatToY(p.lat, zoom) - centerY + containerSize.height / 2;

          // Out of viewport cull
          if (x < -40 || x > containerSize.width + 40 || y < -40 || y > containerSize.height + 40) {
            return null;
          }

          const isHighlighted = highlightedPlaceId === p.place.id || selectedPlaceId === p.place.id;

          return (
            <div
              key={p.place.id}
              onClick={(e) => {
                e.stopPropagation();
                if (Date.now() - lastPinchEndRef.current < 350) return;
                setSelectedPlaceId(p.place.id);
              }}
              onMouseEnter={() => onHoverPlace?.(p.place.id)}
              onMouseLeave={() => onHoverPlace?.(null)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform duration-150"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                zIndex: isHighlighted ? 40 : p.isScheduled ? 30 : 20,
                transform: isHighlighted ? 'translate(-50%, -50%) scale(1.2)' : 'translate(-50%, -50%) scale(1)',
              }}
            >
              {p.isScheduled ? (
                // Numbered Scheduled Marker
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-md text-xs font-bold text-white transition-all ${
                    isHighlighted ? 'bg-emerald-600 ring-3 ring-emerald-300' : 'bg-emerald-800'
                  }`}
                  title={`${p.order}. ${p.place.title}`}
                >
                  {p.order}
                </div>
              ) : (
                // Candidate POI Marker
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow-md text-[11px] transition-all ${
                    isHighlighted ? 'ring-3 ring-blue-400 scale-110' : 'hover:scale-110'
                  }`}
                  title={p.place.title}
                >
                  <span className="leading-none">{KIND_EMOJI[p.place.kind] || '📍'}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Floating Map Action Controls */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-30">
          <button
            type="button"
            onClick={() => {
              const { width, height } = viewportSize();
              applyZoomAround(viewRef.current.zoom + ZOOM_STEP_BUTTON, width / 2, height / 2);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white/95 text-xs font-bold text-stone-800 shadow-sm hover:bg-stone-50"
            title={zh ? '放大' : 'Zoom In'}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              const { width, height } = viewportSize();
              applyZoomAround(viewRef.current.zoom - ZOOM_STEP_BUTTON, width / 2, height / 2);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white/95 text-xs font-bold text-stone-800 shadow-sm hover:bg-stone-50"
            title={zh ? '缩小' : 'Zoom Out'}
          >
            −
          </button>
          <button
            type="button"
            onClick={fitBounds}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white/95 text-xs font-bold text-stone-800 shadow-sm hover:bg-stone-50"
            title={zh ? '视野居中所有点' : 'Fit All Points'}
          >
            ⊙
          </button>
        </div>

        {/* Selected Place Popup Card */}
        {selectedPlace && (
          <div
            className="absolute bottom-2 left-2 right-2 z-40 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur-xs transition-all animate-in fade-in slide-in-from-bottom-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{KIND_EMOJI[selectedPlace.kind] || '📍'}</span>
                  <h4 className="truncate text-xs font-bold text-stone-900">{selectedPlace.title}</h4>
                  {selectedPlace.area ? (
                    <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[9.5px] font-medium text-stone-600">
                      {selectedPlace.area}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-stone-500">
                  {selectedPlace.observed_rating ? <span>★ {selectedPlace.observed_rating}</span> : null}
                  {selectedPlace.observed_price ? <span>💰 {selectedPlace.observed_price}</span> : null}
                  {selectedPlace.duration_minutes ? <span>⏱️ {selectedPlace.duration_minutes}m</span> : null}
                </div>
                {selectedPlace.why || selectedPlace.notes ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-stone-600">
                    💡 {selectedPlace.why || selectedPlace.notes}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSelectedPlaceId(null)}
                className="shrink-0 rounded-md p-1 text-xs text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
              <a
                href={selectedPlace.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-emerald-700 hover:underline"
              >
                🗺️ {zh ? 'Google Maps 查看' : 'View in Google Maps'}
              </a>

              {selectedPlace.scheduled_date ? (
                <button
                  type="button"
                  onClick={() => {
                    onUnschedulePlace(selectedPlace);
                    setSelectedPlaceId(null);
                  }}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                >
                  {zh ? '移出当天' : 'Return to Pool'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onSchedulePlace(selectedPlace.id);
                    setSelectedPlaceId(null);
                  }}
                  className="rounded-md bg-stone-950 px-3 py-1 text-[11px] font-semibold text-white hover:bg-stone-800"
                >
                  + {zh ? `排入第 ${activeDayIndex + 1} 天` : `Add to Day ${activeDayIndex + 1}`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Helper */}
      <div className="border-t border-stone-100 bg-stone-50 px-3 py-1.5 text-[10.5px] text-stone-500">
        <div>
          💡 {zh ? '顺路排程技巧：在地图上沿动线依次点击候选点 🔵 即可按地理最优顺序加入当天路线。' : 'Tip: Click candidate markers 🔵 in sequence along your route to add them to your day schedule in optimal order.'}
        </div>
        <div className="mt-0.5 text-[9.5px] text-stone-400">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">OpenStreetMap</a> contributors · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" className="hover:underline">CARTO</a>
        </div>
      </div>
    </div>
  );
}
