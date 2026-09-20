/**
 * Pure stay-span resolution for the hotel comparison modal.
 *
 * The selected check-in/check-out indices can drift out of range when the trip
 * dates change or the active day moves, so the span must be clamped and always
 * ordered (check-out never before check-in). Extracted so the clamping rule is
 * testable independently of the modal's rendering.
 */

export interface HotelStaySpanInput {
  isFullTripStay: boolean;
  tripDates: string[];
  stayStartIndex: number;
  stayEndIndex: number;
  activeDate: string;
}

export function resolveHotelStayDates(input: HotelStaySpanInput): string[] {
  const { isFullTripStay, tripDates, stayStartIndex, stayEndIndex, activeDate } = input;
  if (isFullTripStay && tripDates.length > 0) return [...tripDates];
  if (tripDates.length === 0) return [activeDate];

  const lastIndex = tripDates.length - 1;
  const start = Math.min(Math.max(stayStartIndex, 0), lastIndex);
  const end = Math.min(Math.max(stayEndIndex, start), lastIndex);
  return tripDates.slice(start, end + 1);
}
