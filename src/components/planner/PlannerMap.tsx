'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlannerTripPlace } from '@/domain/planner';
import type { PlannerScheduledPlace } from '@/domain/planner-visits';
import {
  calculateBounds,
  extractPlaceCoordinates,
  getMapPointsForFilter,
  getPlannerMapDefaultCenter,
  PLANNER_KIND_ICONS,
} from '@/domain/planner';
import { searchCities } from '@/domain/travel';

interface PlannerMapProps {
  scheduledPlaces: PlannerScheduledPlace[];
  candidatePlaces: PlannerTripPlace[];
  allPlacesByDate?: Record<string, PlannerScheduledPlace[]>;
  tripDates?: string[];
  destinations?: string[];
  activeDate?: string;
  activeDayIndex: number;
  highlightedPlaceId?: string | null;
  onSchedulePlace: (placeId: string) => void;
  onUnschedulePlace: (place: PlannerScheduledPlace) => void;
  onShelvePlace?: (placeId: string) => void;
  onDeletePlace?: (placeId: string, placeTitle?: string) => void;
  onHoverPlace?: (placeId: string | null) => void;
  visitCountByPlaceId?: Map<string, number>;
  language?: 'zh' | 'en';
}

interface Point {
  place: PlannerTripPlace | PlannerScheduledPlace;
  lat: number;
  lng: number;
  isScheduled: boolean;
  order?: number;
  dayIndex?: number;
  isActiveDay?: boolean;
}

const KIND_EMOJI = PLANNER_KIND_ICONS;

// CARTO raster tiles serve an "API key required" watermark without a key.
// Key source: GitHub repository secret CARTO_BASEMAP_KEY -> build env
// NEXT_PUBLIC_CARTO_BASEMAP_KEY (see .github/workflows/pages.yml);
// local dev override via .env.local. Attribution stays mandatory per CARTO/OSM terms.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY?.trim() || undefined;

function cartoTile(path: string, z: number, x: number, y: number): string {
  // Retina screens fetch @2x tiles so text and roads stay crisp at fractional zooms.
  const hidpi = typeof window !== 'undefined' && (window.devicePixelRatio ?? 1) > 1;
  const url = `https://basemaps.cartocdn.com/${path}/${z}/${x}/${y}${hidpi ? '@2x' : ''}.png`;
  return CARTO_KEY ? `${url}?key=${encodeURIComponent(CARTO_KEY)}` : url;
}

export type BasemapStyle = 'carto_voyager' | 'carto_voyager_nolabels' | 'carto_positron' | 'carto_dark' | 'osm_standard' | 'esri_satellite';

export interface BasemapOption {
  id: BasemapStyle;
  label: { zh: string; en: string };
  icon: string;
  getUrl: (z: number, x: number, y: number) => string;
  fallbackUrl?: (z: number, x: number, y: number) => string;
  bgColor: string;
}

export const BASEMAP_OPTIONS: BasemapOption[] = [
  {
    id: 'carto_voyager',
    label: { zh: '淡彩旅行', en: 'Voyager' },
    icon: '🧭',
    getUrl: (z, x, y) => cartoTile('rastertiles/voyager', z, x, y),
    fallbackUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    bgColor: '#e5e7eb',
  },
  {
    id: 'carto_voyager_nolabels',
    label: { zh: '纯净无字', en: 'No Labels' },
    icon: '◻️',
    getUrl: (z, x, y) => cartoTile('rastertiles/voyager_nolabels', z, x, y),
    fallbackUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    bgColor: '#e5e7eb',
  },
  {
    id: 'carto_positron',
    label: { zh: '极简浅灰', en: 'Positron' },
    icon: '⚪',
    getUrl: (z, x, y) => cartoTile('light_all', z, x, y),
    fallbackUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    bgColor: '#f3f4f6',
  },
  {
    id: 'carto_dark',
    label: { zh: '深邃夜景', en: 'Dark' },
    icon: '🌑',
    getUrl: (z, x, y) => cartoTile('dark_all', z, x, y),
    fallbackUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    bgColor: '#18181b',
  },
  {
    id: 'osm_standard',
    label: { zh: '开源标准', en: 'OSM' },
    icon: '🗺️',
    getUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    fallbackUrl: (z, x, y) => cartoTile('rastertiles/voyager', z, x, y),
    bgColor: '#e5e7eb',
  },
  {
    id: 'esri_satellite',
    label: { zh: '卫星实景', en: 'Satellite' },
    icon: '🛰️',
    getUrl: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    fallbackUrl: (z, x, y) => cartoTile('rastertiles/voyager', z, x, y),
    bgColor: '#1c1917',
  },
];

// One identity color per trip day (cycles every 8 days) for markers and routes.
export const PLANNER_DAY_COLORS = ['#047857', '#0284c7', '#b45309', '#7c3aed', '#e11d48', '#0f766e', '#ea580c', '#4f46e5'];

export function plannerDayColor(dayIndex?: number): string {
  const index = dayIndex ?? 0;
  return PLANNER_DAY_COLORS[((index % PLANNER_DAY_COLORS.length) + PLANNER_DAY_COLORS.length) % PLANNER_DAY_COLORS.length];
}

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

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const ZOOM_STEP_BUTTON = 1;
const ZOOM_STEP_WHEEL = 0.5;

// Native tooltip shows the place name on line 1 and the recommendation reason (why) on line 2.
function markerTitle(firstLine: string, why?: string): string {
  const reason = (why ?? '').trim().replace(/\s+/g, ' ');
  if (!reason) return firstLine;
  const short = reason.length > 80 ? `${reason.slice(0, 80)}…` : reason;
  return `${firstLine}\n${short}`;
}

export function PlannerMap({
  scheduledPlaces,
  candidatePlaces,
  allPlacesByDate,
  tripDates,
  destinations,
  activeDate,
  activeDayIndex,
  highlightedPlaceId,
  onSchedulePlace,
  onUnschedulePlace,
  onShelvePlace,
  onDeletePlace,
  onHoverPlace,
  visitCountByPlaceId,
  language = 'zh',
}: PlannerMapProps) {
  const zh = language === 'zh';
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'candidates' | 'scheduled' | 'all_routes'>('all');
  const [basemapStyle, setBasemapStyle] = useState<BasemapStyle>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('ownly_planner_basemap_style') as BasemapStyle | null;
        if (saved && BASEMAP_OPTIONS.some((opt) => opt.id === saved)) {
          return saved;
        }
      } catch {}
    }
    return 'carto_positron';
  });

  const handleBasemapChange = useCallback((newStyle: BasemapStyle) => {
    setBasemapStyle(newStyle);
    try {
      localStorage.setItem('ownly_planner_basemap_style', newStyle);
    } catch {}
  }, []);

  const activeBasemap = useMemo(
    () => BASEMAP_OPTIONS.find((opt) => opt.id === basemapStyle) ?? BASEMAP_OPTIONS[0],
    [basemapStyle],
  );

  // Multi-day points across all trip dates
  const multiDayPoints = useMemo<Point[]>(() => {
    if (!allPlacesByDate || !tripDates || tripDates.length === 0) return [];
    const result: Point[] = [];

    tripDates.forEach((date, dIdx) => {
      const dayPlaces = allPlacesByDate[date] || [];
      const isActiveDay = date === activeDate || dIdx === activeDayIndex;

      dayPlaces.forEach((place, index) => {
        const coords = extractPlaceCoordinates(place);
        if (coords) {
          result.push({
            place,
            lat: coords.lat,
            lng: coords.lng,
            isScheduled: true,
            order: index + 1,
            dayIndex: dIdx,
            isActiveDay,
          });
        }
      });
    });

    return result;
  }, [allPlacesByDate, tripDates, activeDate, activeDayIndex]);

  const allScheduledCount = useMemo(() => {
    if (!allPlacesByDate) return scheduledPlaces.length;
    return Object.values(allPlacesByDate).reduce((sum, list) => sum + list.length, 0);
  }, [allPlacesByDate, scheduledPlaces.length]);

  // Extract valid geo points based on filter mode
  const points = useMemo<Point[]>(() => {
    if (filterMode === 'all_routes' && multiDayPoints.length > 0) {
      const result = [...multiDayPoints];
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
    }

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
          dayIndex: activeDayIndex,
          isActiveDay: true,
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
  }, [filterMode, multiDayPoints, scheduledPlaces, candidatePlaces, activeDayIndex]);

  // Default center based on active day schedule (last scheduled point) or candidate pool (last imported point)
  const defaultCenter = useMemo(
    () => getPlannerMapDefaultCenter(scheduledPlaces, candidatePlaces),
    [scheduledPlaces, candidatePlaces],
  );

  // Initial bounds
  const initial = useMemo(() => calculateBounds(points), [points]);
  const [center, setCenter] = useState<{ lat: number; lng: number }>(() => defaultCenter ?? initial.center);
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
    const activePoints = getMapPointsForFilter(points, filterMode);
    if (activePoints.length === 0) return;
    const computed = calculateBounds(activePoints);
    setCenter(defaultCenter ?? computed.center);
    setZoom(computed.zoom);
  }, [filterMode, points, defaultCenter]);

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
  // Auto-fit only when necessary so user panning is never yanked away:
  // first load, active day change, filter change, or new points outside view.
  const lastPointsCountRef = useRef<number>(0);
  const lastActiveDayRef = useRef<number>(activeDayIndex);
  const lastFilterModeRef = useRef<string>(filterMode);

  useEffect(() => {
    if (points.length === 0) return;
    const dayChanged = lastActiveDayRef.current !== activeDayIndex;
    const filterChanged = lastFilterModeRef.current !== filterMode;
    const pointsAppeared = lastPointsCountRef.current === 0 && points.length > 0;

    let needFit = pointsAppeared || dayChanged || filterChanged;
    if (!needFit && points.length !== lastPointsCountRef.current) {
      const width = containerSize.width || 400;
      const height = containerSize.height || 300;
      const cx = projectLngToX(center.lng, zoom);
      const cy = projectLatToY(center.lat, zoom);
      needFit = points.some((p) => {
        const x = projectLngToX(p.lng, zoom) - cx + width / 2;
        const y = projectLatToY(p.lat, zoom) - cy + height / 2;
        return x < -20 || x > width + 20 || y < -20 || y > height + 20;
      });
    }

    if (needFit) {
      const activePoints = getMapPointsForFilter(points, filterMode);
      const pointsToFit = activePoints.length > 0 ? activePoints : points;
      const computed = calculateBounds(pointsToFit);
      setCenter(defaultCenter ?? computed.center);
      setZoom(computed.zoom);
    }

    lastPointsCountRef.current = points.length;
    lastActiveDayRef.current = activeDayIndex;
    lastFilterModeRef.current = filterMode;
  }, [points, activeDayIndex, filterMode, defaultCenter, center, zoom, containerSize]);
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

  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const rect = containerRef.current?.getBoundingClientRect();
    const point = { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    activePointers.current.set(e.pointerId, point);
    // Do not steal pointer capture from markers / interactive controls:
    // capturing to the container retargets pointerup and breaks child onClick,
    // so the popover intermittently fails to open (especially on double-click).
    const target = e.target as HTMLElement | null;
    const isInteractiveTarget = !!target?.closest?.('[data-map-marker],button,a,select,input,textarea');
    if (!isInteractiveTarget) {
      try {
        containerRef.current?.setPointerCapture(e.pointerId);
      } catch {}
    }

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
      if (pointerDownPosRef.current) {
        const dist = Math.hypot(e.clientX - pointerDownPosRef.current.x, e.clientY - pointerDownPosRef.current.y);
        if (dist < 6 && (e.target === containerRef.current || (e.target as HTMLElement).tagName === 'IMG' || (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'polyline')) {
          setSelectedPlaceId(null);
        }
      }
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

  // Scheduled route points for line rendering (active day)
  const scheduledRoutePoints = useMemo(() => {
    return points
      .filter((p) => p.isScheduled && p.isActiveDay !== false)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => {
        const x = projectLngToX(p.lng, zoom) - centerX + containerSize.width / 2;
        const y = projectLatToY(p.lat, zoom) - centerY + containerSize.height / 2;
        return { ...p, x, y };
      });
  }, [points, zoom, centerX, centerY, containerSize.width, containerSize.height]);

  // Multi-day route polylines for line rendering
  const allDaysRoutes = useMemo(() => {
    if (!allPlacesByDate || !tripDates || tripDates.length === 0) return [];

    return tripDates
      .map((date, dIdx) => {
        const dayPlaces = allPlacesByDate[date] || [];
        const isActiveDay = date === activeDate || dIdx === activeDayIndex;
        const screenPoints: Array<{ x: number; y: number; place: PlannerScheduledPlace; order: number }> = [];

        dayPlaces.forEach((place, index) => {
          const coords = extractPlaceCoordinates(place);
          if (coords) {
            const x = projectLngToX(coords.lng, zoom) - centerX + containerSize.width / 2;
            const y = projectLatToY(coords.lat, zoom) - centerY + containerSize.height / 2;
            screenPoints.push({ x, y, place, order: index + 1 });
          }
        });

        return {
          date,
          dayIndex: dIdx,
          isActiveDay,
          screenPoints,
        };
      })
      .filter((r) => r.screenPoints.length >= 2);
  }, [allPlacesByDate, tripDates, activeDate, activeDayIndex, zoom, centerX, centerY, containerSize.width, containerSize.height]);

  const selectedPoint = useMemo(() => points.find((point) => point.place.id === selectedPlaceId) ?? null, [points, selectedPlaceId]);
  const selectedPlace = selectedPoint?.place ?? null;
  const selectedScheduledPlace = useMemo(() => {
    if (!selectedPoint?.isScheduled) return null;
    if (selectedPoint.isActiveDay === false) return null;
    return selectedPoint.place as PlannerScheduledPlace;
  }, [selectedPoint]);

  const selectedPointScreen = useMemo(() => {
    if (!selectedPoint) return null;
    const x = projectLngToX(selectedPoint.lng, zoom) - centerX + containerSize.width / 2;
    const y = projectLatToY(selectedPoint.lat, zoom) - centerY + containerSize.height / 2;
    return { x, y };
  }, [selectedPoint, zoom, centerX, centerY, containerSize.width, containerSize.height]);

  // Scale bar: pick the largest 1/2/5-step distance fitting ~80px.
  const scaleBar = useMemo(() => {
    const metersPerPixel = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, zoom);
    if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return null;
    const raw = metersPerPixel * 80;
    const exp = Math.floor(Math.log10(raw));
    const base = raw / Math.pow(10, exp);
    const niceBase = base >= 5 ? 5 : base >= 2 ? 2 : 1;
    const distance = niceBase * Math.pow(10, exp);
    return {
      widthPx: Math.round(distance / metersPerPixel),
      label: distance >= 1000 ? `${distance / 1000} km` : `${distance} m`,
    };
  }, [center.lat, zoom]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs">
      {/* Map Controls */}
      <div className="flex flex-wrap items-center justify-end gap-1.5 border-b border-stone-100 bg-stone-50/80 px-3 py-2">
        {/* Basemap Style Selector */}
        <div className="relative inline-flex items-center">
          <select
            value={basemapStyle}
            onChange={(e) => handleBasemapChange(e.target.value as BasemapStyle)}
            className="rounded-full border border-stone-200 bg-white py-0.5 pl-2 pr-6 text-[10px] font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 focus:border-stone-400 focus:outline-hidden cursor-pointer"
            title={zh ? '切换免费底图样式' : 'Switch Basemap Style'}
          >
            {BASEMAP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.icon} {opt.label[language]}
              </option>
            ))}
          </select>
        </div>

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
        {allPlacesByDate && tripDates && tripDates.length > 1 ? (
          <button
            type="button"
            onClick={() => setFilterMode('all_routes')}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${filterMode === 'all_routes' ? 'bg-indigo-700 text-white shadow-xs' : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'}`}
          >
            🌐 {zh ? '显示所有路线' : 'All Routes'} ({allScheduledCount})
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setFilterMode('candidates')}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${filterMode === 'candidates' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100'}`}
        >
          🔵 {zh ? '候选池' : 'Pool'} ({candidatePlaces.length})
        </button>
      </div>

      {/* Map Viewport Area */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative flex-1 cursor-grab overflow-hidden select-none active:cursor-grabbing"
        style={{ minHeight: '300px', background: activeBasemap.bgColor, touchAction: 'none' }}
      >
        {/* Dynamic Basemap Tiles */}
        <div className="absolute inset-0 pointer-events-none">
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${basemapStyle}/${t.key}`}
              src={activeBasemap.getUrl(intZoom, t.x, t.y)}
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
                if (img.dataset.fallback || !activeBasemap.fallbackUrl) return;
                img.dataset.fallback = '1';
                img.src = activeBasemap.fallbackUrl(intZoom, t.x, t.y);
              }}
            />
          ))}
        </div>

        {/* Connecting Polyline Route SVG overlay */}
        {filterMode === 'all_routes' ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {/* Other days' polylines (rendered first, in the background with soft/dimmed styling) */}
            {allDaysRoutes
              .filter((r) => !r.isActiveDay)
              .map((r) => (
                <polyline
                  key={r.date}
                  points={r.screenPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={plannerDayColor(r.dayIndex)}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="5,4"
                  opacity="0.45"
                />
              ))}

            {/* Active day's polyline (rendered on top with the day identity color) */}
            {allDaysRoutes
              .filter((r) => r.isActiveDay)
              .map((r) => (
                <polyline
                  key={r.date}
                  points={r.screenPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={plannerDayColor(r.dayIndex)}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="6,4"
                  opacity="0.95"
                />
              ))}
          </svg>
        ) : scheduledRoutePoints.length >= 2 && (filterMode === 'all' || filterMode === 'scheduled') ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <polyline
              points={scheduledRoutePoints.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={plannerDayColor(activeDayIndex)}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6,4"
              className="opacity-85"
            />
          </svg>
        ) : null}

        {/* POI Markers */}
        {visiblePoints.map((p, pIdx) => {
          const x = projectLngToX(p.lng, zoom) - centerX + containerSize.width / 2;
          const y = projectLatToY(p.lat, zoom) - centerY + containerSize.height / 2;

          // Out of viewport cull
          if (x < -40 || x > containerSize.width + 40 || y < -40 || y > containerSize.height + 40) {
            return null;
          }

          const isHighlighted = highlightedPlaceId === p.place.id || selectedPlaceId === p.place.id;
          const isOtherDayStop = p.isScheduled && p.isActiveDay === false;
          const dayColor = plannerDayColor(p.dayIndex ?? activeDayIndex);
          // Candidates already scheduled on some day get a light-green marker to stand out from plain white ones.
          const scheduledCount = visitCountByPlaceId?.get(p.place.id) ?? 0;

          return (
            <div
              key={`${p.place.id}_${p.dayIndex ?? ''}_${p.order ?? ''}_${pIdx}`}
              data-map-marker="true"
              onClick={(e) => {
                e.stopPropagation();
                if (Date.now() - lastPinchEndRef.current < 350) return;
                setSelectedPlaceId(p.place.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setSelectedPlaceId(p.place.id);
              }}
              onMouseEnter={() => onHoverPlace?.(p.place.id)}
              onMouseLeave={() => onHoverPlace?.(null)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-transform duration-150"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                zIndex: isHighlighted ? 40 : p.isScheduled ? (p.isActiveDay !== false ? 30 : 25) : 20,
                transform: isHighlighted ? 'translate(-50%, -50%) scale(1.2)' : 'translate(-50%, -50%) scale(1)',
              }}
            >
              {p.isScheduled ? (
                isOtherDayStop ? (
                  // Other Day Stop Marker (day identity color, dimmed)
                  <div
                    className={`flex h-5 items-center justify-center rounded-full border border-white/90 px-1.5 shadow-xs text-[9.5px] font-semibold text-white transition-all hover:brightness-110 ${
                      isHighlighted ? 'ring-2 ring-white scale-110' : ''
                    }`}
                    style={{ backgroundColor: `${dayColor}CC` }}
                    title={markerTitle(`Day ${(p.dayIndex ?? 0) + 1} #${p.order}. ${p.place.title}`, p.place.why)}
                  >
                    D{(p.dayIndex ?? 0) + 1}·{p.order}
                  </div>
                ) : (
                  // Numbered Scheduled Marker (day identity color)
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white shadow-md text-xs font-bold text-white transition-all"
                    style={{
                      backgroundColor: dayColor,
                      boxShadow: isHighlighted ? `0 0 0 3px ${dayColor}66, 0 4px 6px -1px rgb(0 0 0 / 0.3)` : undefined,
                    }}
                    title={markerTitle(`${p.order}. ${p.place.title}`, p.place.why)}
                  >
                    {p.order}
                  </div>
                )
              ) : (
                // Candidate POI Marker (light green when already scheduled on some day)
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-md text-[11px] transition-all ${
                    scheduledCount > 0
                      ? `border-emerald-300 bg-emerald-50 ${isHighlighted ? 'ring-3 ring-emerald-400 scale-110' : 'hover:scale-110'}`
                      : `border-white bg-white ${isHighlighted ? 'ring-3 ring-blue-400 scale-110' : 'hover:scale-110'}`
                  }`}
                  title={markerTitle(
                    scheduledCount > 0 ? `${p.place.title} (已排 ${scheduledCount} 次)` : p.place.title,
                    p.place.why,
                  )}
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
            aria-label={zh ? '放大' : 'Zoom In'}
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
            aria-label={zh ? '缩小' : 'Zoom Out'}
          >
            −
          </button>
          <button
            type="button"
            onClick={fitBounds}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white/95 text-xs font-bold text-stone-800 shadow-sm hover:bg-stone-50"
            title={zh ? '视野居中所有点' : 'Fit All Points'}
            aria-label={zh ? '视野居中所有点' : 'Fit All Points'}
          >
            ⊙
          </button>
        </div>

        {/* Scale Bar */}
        {scaleBar ? (
          <div className="pointer-events-none absolute bottom-2 left-2 z-30 rounded bg-white/85 px-1.5 py-0.5 shadow-xs backdrop-blur-sm">
            <div className="text-[9px] font-semibold text-stone-600">{scaleBar.label}</div>
            <div className="border-b-2 border-l-2 border-r-2 border-stone-600" style={{ width: `${scaleBar.widthPx}px`, height: '4px' }} />
          </div>
        ) : null}

        {/* Anchored Mini Popover on Clicked Marker with 3 Emoji Actions */}
        {selectedPlace && selectedPointScreen && selectedPointScreen.x >= -60 && selectedPointScreen.x <= containerSize.width + 60 && selectedPointScreen.y >= -60 && selectedPointScreen.y <= containerSize.height + 60 && (
          <div
            className="absolute z-50 rounded-xl border border-stone-200/95 bg-white/95 p-2.5 shadow-xl backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95 select-text"
            style={{
              left: `${Math.max(130, Math.min(containerSize.width - 130, selectedPointScreen.x))}px`,
              top: selectedPointScreen.y > 170 ? `${selectedPointScreen.y - 12}px` : `${selectedPointScreen.y + 26}px`,
              transform: selectedPointScreen.y > 170 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              width: 'max-content',
              maxWidth: `${Math.min(300, containerSize.width - 24)}px`,
              minWidth: '220px',
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Popover Header */}
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <span className="text-sm shrink-0">{KIND_EMOJI[selectedPlace.kind] || '📍'}</span>
                <h4 className="truncate text-xs font-bold text-stone-900 leading-snug" title={selectedPlace.title}>
                  {selectedPlace.title}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaceId(null)}
                className="shrink-0 rounded p-0.5 text-stone-400 hover:text-stone-700 transition cursor-pointer"
                title={zh ? '关闭' : 'Close'}
              >
                ✕
              </button>
            </div>

            {/* Popover Metadata Subtitle */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500">
              {selectedPlace.area ? (
                <span className="rounded bg-stone-100 px-1.5 py-0.2 font-medium text-stone-600">
                  {selectedPlace.area}
                </span>
              ) : null}
              {selectedPlace.observed_rating ? <span>★ {selectedPlace.observed_rating}</span> : null}
              {selectedPlace.observed_price ? <span>💰 {selectedPlace.observed_price}</span> : null}
              {selectedPlace.duration_minutes ? <span>⏱️ {selectedPlace.duration_minutes}m</span> : null}
              {selectedPlace.source_url ? (
                <a
                  href={selectedPlace.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:underline inline-flex items-center gap-0.5 ml-auto text-[10px] font-medium"
                  title={zh ? '在 Google Maps 中查看' : 'View on Maps'}
                >
                  🗺️ {zh ? '地图' : 'Maps'}
                </a>
              ) : null}
            </div>

            {/* 3 Emoji Actions: 添加操作 | 不考虑操作 | 删除操作 */}
            <div className="mt-2 grid grid-cols-3 gap-1.5 pt-2 border-t border-stone-100">
              {/* 1. 添加 / 移出当天操作 */}
              {selectedScheduledPlace ? (
                <button
                  type="button"
                  onClick={() => {
                    onUnschedulePlace(selectedScheduledPlace);
                  }}
                  className="flex flex-col items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 py-1.5 px-1 text-center hover:bg-emerald-100 hover:border-emerald-400 transition shadow-2xs group cursor-pointer"
                  title={zh ? '已排入当天日程，点击移出（回到待安排候选池）' : 'Scheduled on active day. Click to remove'}
                >
                  <span className="text-base transition group-hover:scale-115">✕</span>
                  <span className="mt-0.5 text-[9.5px] font-bold text-emerald-800">{zh ? '已排当天' : 'Scheduled'}</span>
                </button>
              ) : (visitCountByPlaceId?.get(selectedPlace.id) ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    onSchedulePlace(selectedPlace.id);
                  }}
                  className="flex flex-col items-center justify-center rounded-lg border border-emerald-400 bg-emerald-100/90 py-1.5 px-1 text-center hover:bg-emerald-200 transition shadow-2xs group cursor-pointer"
                  title={zh ? `已在行程中排入 ${visitCountByPlaceId?.get(selectedPlace.id)} 次，点击再次加入第 ${activeDayIndex + 1} 天` : `Scheduled ${visitCountByPlaceId?.get(selectedPlace.id)}x. Click to add to Day ${activeDayIndex + 1}`}
                >
                  <span className="text-base transition group-hover:scale-115">➕</span>
                  <span className="mt-0.5 text-[9.5px] font-bold text-emerald-900">{zh ? '已排 (加当天)' : 'Add Stop'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onSchedulePlace(selectedPlace.id);
                  }}
                  className="flex flex-col items-center justify-center rounded-lg border border-stone-200 bg-stone-50 py-1.5 px-1 text-center hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition shadow-2xs group cursor-pointer"
                  title={zh ? `排入第 ${activeDayIndex + 1} 天路线` : `Add to Day ${activeDayIndex + 1}`}
                >
                  <span className="text-base transition group-hover:scale-115">➕</span>
                  <span className="mt-0.5 text-[9.5px] font-bold text-stone-700 group-hover:text-emerald-800">{zh ? '加入当天' : 'Add Stop'}</span>
                </button>
              )}

              {/* 2. 不考虑操作 */}
              <button
                type="button"
                onClick={() => {
                  if (onShelvePlace) {
                    onShelvePlace(selectedPlace.id);
                    setSelectedPlaceId(null);
                  }
                }}
                className="flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 py-1.5 px-1 text-center hover:bg-amber-100 hover:border-amber-300 transition shadow-2xs group cursor-pointer"
                title={zh ? '设为暂不考虑（可在待考虑池查看）' : 'Shelve (drop) place'}
              >
                <span className="text-base transition group-hover:scale-115">🙈</span>
                <span className="mt-0.5 text-[9.5px] font-bold text-amber-900">{zh ? '暂不考虑' : 'Shelve'}</span>
              </button>

              {/* 3. 删除操作 */}
              <button
                type="button"
                onClick={() => {
                  if (onDeletePlace) {
                    onDeletePlace(selectedPlace.id, selectedPlace.title);
                    setSelectedPlaceId(null);
                  }
                }}
                className="flex flex-col items-center justify-center rounded-lg border border-rose-200 bg-rose-50 py-1.5 px-1 text-center hover:bg-rose-100 hover:border-rose-300 transition shadow-2xs group cursor-pointer"
                title={zh ? '彻底删除地点' : 'Delete place'}
              >
                <span className="text-base transition group-hover:scale-115">🗑️</span>
                <span className="mt-0.5 text-[9.5px] font-bold text-rose-800">{zh ? '彻底删除' : 'Delete'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Helper */}
      <div className="border-t border-stone-100 bg-stone-50 px-3 py-1.5 text-[10.5px] text-stone-500">
        <div>
          💡 {zh ? '顺路排程技巧：在地图上沿动线依次点击候选点 🔵 即可按地理最优顺序加入当天路线。' : 'Tip: Click candidate markers 🔵 in sequence along your route to add them to your day schedule in optimal order.'}
        </div>
        <div className="mt-0.5 text-[9px] text-stone-400">
          © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:underline">OpenStreetMap</a> · © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" className="hover:underline">CARTO</a>
        </div>
      </div>
    </div>
  );
}
