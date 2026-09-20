/**
 * Empty-state reason for the candidate pool.
 *
 * "No candidates at all" and "filters or search hid every candidate" look
 * identical once the grid is empty, but they need different copy and actions
 * (import vs. clear filters). Resolving the reason as a pure value keeps the
 * distinction testable and prevents the two cases from collapsing into one
 * misleading message.
 */

export type PoolEmptyReason = 'empty' | 'filtered';

export function resolvePoolEmptyReason(
  totalCandidates: number,
  visibleCandidates: number,
): PoolEmptyReason | null {
  if (visibleCandidates > 0) return null;
  return totalCandidates === 0 ? 'empty' : 'filtered';
}
