'use client';

import { useMemo } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import * as topojson from 'topojson-client';
import { useI18n } from '@/core/i18n-context';
import type { OneTimeExperienceObject } from '@/domain/types';
import { buildTravelMapPoints } from '@/domain/travel';
import worldData from '@/data/countries-110m.json';

const VIEWBOX_W = 800;
const VIEWBOX_H = 420;

export function TravelWorldMap({
  experiences,
}: {
  experiences: OneTimeExperienceObject[];
}) {
  const { t } = useI18n();

  const projection = useMemo(
    () => geoNaturalEarth1().fitSize([VIEWBOX_W, VIEWBOX_H], { type: 'Sphere' }),
    [],
  );
  const pathGenerator = useMemo(() => geoPath(projection), [projection]);

  const countries = useMemo(() => {
    const topology = worldData as unknown as Parameters<typeof topojson.feature>[0];
    return topojson.feature(topology, topology.objects.countries) as unknown as GeoJSON.FeatureCollection;
  }, []);

  const points = buildTravelMapPoints(experiences);
  const pointIds = new Set(points.map((p) => p.id));
  const fallbackExperiences = experiences.filter((exp) => !pointIds.has(exp.id));

  const projectedPoints = useMemo(() => {
    return points.map((point) => {
      const projected = projection([point.longitude, point.latitude]);
      return { ...point, x: projected?.[0] ?? 0, y: projected?.[1] ?? 0 };
    });
  }, [points, projection]);

  return (
    <div className="wyqd-travel-map mt-5">
      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full"
          style={{ minHeight: 200 }}
          role="img"
          aria-label={t('travelInsights')}
        >
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
          {projectedPoints.map((point) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={4}
              fill="#44403c"
              stroke="#fff"
              strokeWidth={1.5}
            >
              <title>
                {point.title}
                {point.city ? ` — ${point.city}` : ''}
              </title>
            </circle>
          ))}
        </svg>
        {points.length === 0 ? (
          <p className="mt-2 text-center text-xs text-stone-400">
            {t('travelNoMapPoints')}
          </p>
        ) : null}
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
