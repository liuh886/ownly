/**
 * Hotel proximity scoring, stay span management, transfer day detection.
 * Re-exports from planner.ts — migrate imports to this module.
 */
export {
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
  detectHotelTransferDays,
  type HotelProximityMetrics,
  type MultiDayHotelProximityResult,
  type DayHotelTransferInfo,
} from './planner';