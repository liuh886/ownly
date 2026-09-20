/**
 * Pure marker-clustering model for the planner map.
 *
 * Exact-duplicate coordinates (≈1m) collapse into a single cluster marker so
 * the same place scheduled twice — or a hotel reused across days — shows one
 * pin with a count badge instead of stacked pins. Grouping is coordinate-only
 * so every stacked place stays reachable; the per-marker badges tell kinds
 * apart. This module carries no React/DOM dependency so the projection rule is
 * unit-testable in isolation from the 1600-line map component.
 */

export interface ClusterableMarker {
  lat: number;
  lng: number;
  isScheduled: boolean;
  /** Underlying place identity; scheduled occurrences carry the visit id in `id`. */
  canonicalPlaceId: string;
}

/**
 * Map each marker position to every position sharing its coordinate cluster.
 * Markers absent from the returned map are single, unclustered pins.
 *
 * Degenerate twin handling: a scheduled stop and its own candidate-pool twin
 * (same canonical place, same coordinates) would otherwise collapse into a "2"
 * badge and swallow the sequence number. Exactly such a pair is dissolved so
 * the numbered marker stays visible; true duplicates (same place scheduled
 * twice, or distinct stacked places) still cluster.
 */
export function clusterMarkersByCoordinates(
  markers: ClusterableMarker[],
): Map<number, number[]> {
  const groups = new Map<string, number[]>();
  markers.forEach((marker, pos) => {
    const key = `${marker.lat.toFixed(5)}|${marker.lng.toFixed(5)}`;
    const list = groups.get(key);
    if (list) list.push(pos);
    else groups.set(key, [pos]);
  });

  const clustered = new Map<number, number[]>();
  for (const positions of groups.values()) {
    if (positions.length <= 1) continue;
    const [first, second] = positions;
    const isDegenerateTwin =
      positions.length === 2 &&
      markers[first].canonicalPlaceId === markers[second].canonicalPlaceId &&
      markers[first].isScheduled !== markers[second].isScheduled;
    if (isDegenerateTwin) continue;
    for (const pos of positions) clustered.set(pos, positions);
  }
  return clustered;
}
