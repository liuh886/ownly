'use client';

import { useMemo, useState, useCallback, useRef, type WheelEvent, type MouseEvent } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useI18n } from '@/core/i18n-context';
import type { OneTimeExperienceObject } from '@/domain/types';
import { buildTravelMapPoints } from '@/domain/travel';
import worldData from '@/data/countries-110m.json';

const VIEWBOX_W = 800;
const VIEWBOX_H = 420;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.5;

export function TravelWorldMap({
  experiences,
}: {
  experiences: OneTimeExperienceObject[];
}) {
  const { t } = useI18n();
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const projection = useMemo(
    () => geoNaturalEarth1().fitSize([VIEWBOX_W, VIEWBOX_H], { type: 'Sphere' }),
    [],
  );
  const pathGenerator = useMemo(() => geoPath(projection), [projection]);

  const countries = useMemo(() => {
    const topology = worldData as unknown as Parameters<typeof topojson.feature>[0];
    return topojson.feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection;
  }, []);

  const points = useMemo(() => buildTravelMapPoints(experiences), [experiences]);
  const pointExpIds = useMemo(() => new Set(points.map((p) => p.id.split('#')[0])), [points]);
  const fallbackExperiences = useMemo(() => experiences.filter((exp) => !pointExpIds.has(exp.id)), [experiences, pointExpIds]);

  const projectedPoints = useMemo(() => {
    return points.map((point) => {
      const projected = projection([point.longitude, point.latitude]);
      return { ...point, x: projected?.[0] ?? 0, y: projected?.[1] ?? 0 };
    });
  }, [points, projection]);

  const clampTranslate = useCallback((x: number, y: number, s: number) => {
    const maxX = (VIEWBOX_W * (s - 1)) / 2;
    const maxY = (VIEWBOX_H * (s - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    setScale((prev) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * delta));
      if (next === prev) return prev;
      // Adjust translate to zoom toward cursor
      const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect();
      if (rect) {
        const svgX = ((e.clientX - rect.left) / rect.width) * VIEWBOX_W;
        const svgY = ((e.clientY - rect.top) / rect.height) * VIEWBOX_H;
        const factor = 1 - next / prev;
        setTranslate((prevT) => clampTranslate(
          prevT.x + (svgX - VIEWBOX_W / 2 - prevT.x) * factor,
          prevT.y + (svgY - VIEWBOX_H / 2 - prevT.y) * factor,
          next,
        ));
      }
      return next;
    });
  }, [clampTranslate]);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
  }, [scale, translate]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const svg = (e.target as SVGElement).closest('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleFactor = VIEWBOX_W / rect.width;
    const dx = (e.clientX - dragStart.current.x) * scaleFactor;
    const dy = (e.clientY - dragStart.current.y) * scaleFactor;
    setTranslate(clampTranslate(
      translateStart.current.x + dx,
      translateStart.current.y + dy,
      scale,
    ));
  }, [isDragging, scale, clampTranslate]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_SCALE, prev * ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const next = Math.max(MIN_SCALE, prev / ZOOM_STEP);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const canZoomIn = scale < MAX_SCALE;
  const canZoomOut = scale > MIN_SCALE;
  const isZoomed = scale > 1;

  return (
    <div className="wyqd-travel-map mt-5">
      <div className="group relative rounded-lg border border-stone-200 bg-white p-3">
        {/* Zoom controls */}
        <div className="absolute right-5 top-5 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={!canZoomIn}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={!canZoomOut}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Zoom out"
          >
            −
          </button>
          {isZoomed ? (
            <button
              type="button"
              onClick={handleReset}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-stone-200 bg-white text-[10px] font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
              aria-label="Reset zoom"
            >
              ↺
            </button>
          ) : null}
        </div>

        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full"
          style={{ minHeight: 200, cursor: isZoomed ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          role="img"
          aria-label={t('travelInsights')}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${VIEWBOX_W / 2 + translate.x}, ${VIEWBOX_H / 2 + translate.y}) scale(${scale}) translate(${-VIEWBOX_W / 2}, ${-VIEWBOX_H / 2})`}>
            <path
              d={pathGenerator({ type: 'Sphere' }) || ''}
              fill="#f5f5f4"
              stroke="none"
            />
            {countries.features.map((feature, i) => (
              <path
                key={i}
                d={pathGenerator(feature) || ''}
                fill="#e7e5e4"
                stroke="#d6d3d1"
                strokeWidth="0.3"
              />
            ))}
            {projectedPoints.map((point) => {
              const isPlanned = point.status === 'planned';
              const fill = isPlanned ? '#d97706' : '#1c1917';
              const baseR = isPlanned ? 3.5 : 4;
              return (
                <circle
                  key={point.id}
                  cx={point.x}
                  cy={point.y}
                  r={baseR / scale}
                  fill={fill}
                  stroke="#fff"
                  strokeWidth={1.5 / scale}
                  opacity={isPlanned ? 0.8 : 1}
                >
                  <title>
                    {point.title}
                    {point.city ? ` — ${point.city}` : ''}
                    {isPlanned ? ' (planned)' : ''}
                  </title>
                </circle>
              );
            })}
          </g>
        </svg>

        {/* Zoom indicator */}
        {isZoomed ? (
          <div className="absolute left-5 top-5 rounded-md bg-stone-900/70 px-2 py-1 text-[10px] font-medium text-white tabular-nums">
            {Math.round(scale * 100)}%
          </div>
        ) : null}

        {points.length > 0 ? (
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-stone-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-stone-950" />
              {t('travelVisited')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
              {t('travelPlanned')}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-center text-sm text-stone-500">
            {t('travelNoMapPoints')}
          </p>
        )}
      </div>
      {fallbackExperiences.length > 0 ? (
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
          <div className="text-xs font-medium text-stone-500">{t('travelFallbackList')}</div>
          <ul className="mt-2 space-y-1 text-xs text-stone-600">
            {fallbackExperiences.map((experience) => (
              <li key={experience.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{experience.title}</span>
                <span className="shrink-0 text-stone-400">
                  {[experience.location?.city, experience.location?.country].filter(Boolean).join(', ') ||
                    t('travelNoLocation')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="sr-only">
        {projectedPoints.map((point) => (
          <li key={point.id}>
            {point.title}
            {point.city ? `, ${point.city}` : ''}
            {point.country_code ? ` (${point.country_code})` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
