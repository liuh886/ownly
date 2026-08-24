/**
 * Route optimization & geographic calculations.
 * Re-exports from planner.ts — migrate imports to this module.
 */
export {
  extractPlaceCoordinates,
  haversineDistanceKm,
  calculateTotalRouteDistanceKm,
  optimizeStopsSequence,
  type RouteOptimizationResult,
  type RouteOptimizationOptions,
} from './planner';