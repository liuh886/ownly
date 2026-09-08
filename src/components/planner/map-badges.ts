import { plannerTripLegId, type PlannerTripLeg } from '@/domain/planner';

export interface BadgePoint {
  placeId: string;
  x: number;
  y: number;
}

export interface BadgeMarker {
  x: number;
  y: number;
  radius: number;
}

export interface SegmentBadge {
  key: string;
  x: number;
  y: number;
  text: string;
}

/** Half-width estimate for the 9.5px time pill, used for overlap skipping. */
const BADGE_HALF_WIDTH = 26;
/** Extra clearance between a badge pill and any marker. */
const BADGE_CLEARANCE = 4;

function badgeText(
  leg: PlannerTripLeg,
  zh: boolean,
): string | null {
  if (!Number.isFinite(leg.duration_minutes) || leg.duration_minutes <= 0) return null;
  const suffix = leg.source !== 'openrouteservice' && leg.mode === 'transit'
    ? (zh ? ' 估' : ' est.')
    : '';
  return `${leg.duration_minutes}${zh ? ' 分' : ' min'}${suffix}`;
}

/**
 * Builds one time pill per consecutive stop pair from persisted legs.
 * Pure function: missing legs, non-positive durations and marker overlaps
 * produce no badge rather than fabricated numbers.
 */
export function buildSegmentBadges(
  points: BadgePoint[],
  legByPair: Map<string, PlannerTripLeg>,
  tripId: string,
  markers: BadgeMarker[],
  modes: { zh: boolean },
): SegmentBadge[] {
  const badges: SegmentBadge[] = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const leg = legByPair.get(plannerTripLegId(tripId, from.placeId, to.placeId));
    if (!leg) continue;
    const text = badgeText(leg, modes.zh);
    if (!text) continue;
    const x = (from.x + to.x) / 2;
    const y = (from.y + to.y) / 2;
    const overlapped = markers.some(
      (marker) => Math.hypot(marker.x - x, marker.y - y) < marker.radius + BADGE_HALF_WIDTH + BADGE_CLEARANCE,
    );
    if (overlapped) continue;
    badges.push({ key: leg.id, x, y, text });
  }
  return badges;
}
