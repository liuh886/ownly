'use client';

import { useI18n } from '@/core/i18n-context';
import type { OneTimeExperienceObject } from '@/domain/types';
import { buildTravelMapPoints } from '@/domain/travel';

const VIEWBOX_W = 800;
const VIEWBOX_H = 400;

function latLngToSvg(lat: number, lng: number): [number, number] {
  const x = ((lng + 180) / 360) * VIEWBOX_W;
  const y = ((90 - lat) / 180) * VIEWBOX_H;
  return [x, y];
}

const WORLD_OUTLINE = 'M135,105 L145,95 L160,90 L175,88 L190,92 L205,88 L215,82 L225,80 L240,82 L255,78 L270,80 L280,85 L285,80 L290,75 L295,72 L300,68 L310,65 L320,68 L325,72 L330,70 L340,68 L350,72 L355,70 L360,68 L370,70 L380,75 L390,72 L400,70 L410,72 L415,68 L420,65 L425,62 L430,60 L435,62 L440,65 L445,68 L450,70 L460,68 L470,65 L475,60 L470,55 L465,50 L460,48 L455,50 L450,52 L445,50 L440,48 L435,45 L430,42 L425,40 L420,38 L415,35 L410,32 L405,30 L400,28 L395,25 L390,22 L385,20 L380,18 L370,15 L360,12 L350,10 L340,8 L330,10 L320,12 L310,15 L300,18 L290,22 L285,25 L280,28 L275,30 L270,32 L265,35 L260,38 L255,40 L250,42 L245,45 L240,48 L235,50 L230,52 L225,55 L220,58 L215,60 L210,62 L205,65 L200,68 L195,70 L190,72 L185,75 L180,78 L175,80 L170,82 L165,85 L160,88 L155,90 L150,92 L145,95 L140,98 L138,102 Z M220,120 L230,115 L240,118 L250,115 L260,112 L270,110 L280,108 L290,110 L300,112 L310,115 L320,118 L330,120 L340,118 L350,115 L360,112 L370,110 L380,108 L390,110 L400,112 L410,115 L420,118 L425,120 L420,125 L415,128 L410,130 L405,132 L400,135 L395,138 L390,140 L385,142 L380,145 L375,148 L370,150 L365,152 L360,155 L355,158 L350,160 L345,162 L340,165 L335,168 L330,170 L325,172 L320,175 L315,178 L310,180 L305,182 L300,185 L295,188 L290,190 L285,192 L280,195 L275,198 L270,200 L265,202 L260,205 L255,208 L250,210 L245,212 L240,215 L235,218 L230,220 L225,222 L220,225 L215,228 L210,230 L205,232 L200,235 L195,238 L190,240 L185,242 L180,245 L175,248 L170,250 L165,252 L160,255 L155,258 L150,260 L145,262 L140,265 L135,268 L130,270 L125,272 L120,275 L115,278 L110,280 L108,285 L110,290 L115,295 L120,300 L125,305 L130,310 L135,315 L140,320 L145,325 L150,330 L155,335 L160,340 L165,345 L170,348 L175,345 L180,342 L185,340 L190,338 L195,335 L200,332 L205,330 L210,328 L215,325 L220,322 L225,320 L230,318 L235,315 L240,312 L245,310 L250,308 L255,305 L260,302 L265,300 L270,298 L275,295 L280,292 L285,290 L290,288 L295,285 L300,282 L305,280 L310,278 L315,275 L320,272 L325,270 L330,268 L335,265 L340,262 L345,260 L350,258 L355,255 L360,252 L365,250 L370,248 L375,245 L380,242 L385,240 L390,238 L395,235 L400,232 L405,230 L410,228 L415,225 L420,222 L425,220 L430,218 L435,215 L440,212 L445,210 L450,208 L455,205 L460,202 L465,200 L470,198 L475,195 L480,192 L485,190 L490,188 L495,185 L500,182 L505,180 L510,178 L515,175 L520,172 L525,170 L530,168 L535,165 L540,162 L545,160 L550,158 L555,155 L560,152 L565,150 L570,148 L575,145 L580,142 L585,140 L590,138 L595,135 L600,132 L605,130 L610,128 L615,125 L620,122 L625,120 L630,118 L635,115 L640,112 L645,110 L650,108 L660,110 L670,112 L680,115 L690,118 L700,120 L710,118 L720,115 L725,112 L730,108 L735,105 L740,102 L745,100 L750,98 L755,95 L760,92 L765,90 L770,88 L775,85 L778,82 L775,80 L770,78 L765,75 L760,72 L755,70 L750,68 L745,65 L740,62 L735,60 L730,58 L725,55 L720,52 L715,50 L710,48 L705,45 L700,42 L695,40 L690,38 L685,35 L680,32 L675,30 L670,28 L665,25 L660,22 L655,20 L650,18 L645,15 L640,12 L635,10 L630,8 L625,5 L620,2 L615,0 L610,2 L605,5 L600,8 L595,10 L590,12 L585,15 L580,18 L575,20 L570,22 L565,25 L560,28 L555,30 L550,32 L545,35 L540,38 L535,40 L530,42 L525,45 L520,48 L515,50 L510,52 L505,55 L500,58 L495,60 L490,62 L485,65 L480,68 L475,70 L470,72 L465,75 L460,78 L455,80 L450,82 L445,85 L440,88 L435,90 L430,92 L425,95 L420,98 L415,100 L410,102 L405,105 L400,108 L395,110 L390,112 L385,115 L380,118 L375,120 L370,122 L365,125 L360,128 L355,130 L350,132 L345,135 L340,138 L335,140 L330,142 L325,145 L320,148 L315,150 L310,152 L305,155 L300,158 L295,160 L290,162 L285,165 L280,168 L275,170 L270,172 L265,175 L260,178 L255,180 L250,182 L245,185 L240,188 L235,190 L230,192 L225,195 L220,198 L215,200 L210,202 L205,205 L200,208 L195,210 L190,212 L185,215 L180,218 L175,220 L170,222 L165,225 L160,228 L155,230 L150,232 L145,235 L140,238 L135,240 L130,242 L125,245 L120,248 L115,250 L110,252 L105,255 L100,258 L95,260 L90,262 L85,265 L80,268 L75,270 L70,272 L65,275 L60,278 L55,280 L50,282 L45,285 L40,288 L35,290 L30,292 L25,295 L20,298 L15,300 L10,302 L5,305 L0,308 L0,400 L800,400 L800,0 L0,0 Z';

export function TravelWorldMap({
  experiences,
}: {
  experiences: OneTimeExperienceObject[];
}) {
  const { t } = useI18n();
  const points = buildTravelMapPoints(experiences);
  const pointIds = new Set(points.map((point) => point.id));
  const fallbackExperiences = experiences.filter((experience) => !pointIds.has(experience.id));

  return (
    <div className="wyqd-travel-map mt-5">
      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <svg
          viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
          className="w-full"
          role="img"
          aria-label={t('travelInsights')}
        >
          <path
            d={WORLD_OUTLINE}
            fill="#f5f5f4"
            stroke="#d6d3d1"
            strokeWidth="0.5"
          />
          {points.map((point) => {
            const [cx, cy] = latLngToSvg(point.latitude, point.longitude);
            return (
              <circle
                key={point.id}
                cx={cx}
                cy={cy}
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
            );
          })}
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
        {points.map((point) => (
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
