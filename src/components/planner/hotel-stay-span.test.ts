import { describe, expect, it } from 'vitest';
import { resolveHotelStayDates } from './hotel-stay-span';

const DATES = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];

describe('resolveHotelStayDates', () => {
  it('returns the whole trip for a full-trip stay', () => {
    expect(
      resolveHotelStayDates({ isFullTripStay: true, tripDates: DATES, stayStartIndex: 0, stayEndIndex: 0, activeDate: DATES[0] }),
    ).toEqual(DATES);
  });

  it('slices an inclusive span between check-in and check-out', () => {
    expect(
      resolveHotelStayDates({ isFullTripStay: false, tripDates: DATES, stayStartIndex: 1, stayEndIndex: 2, activeDate: DATES[0] }),
    ).toEqual(['2026-10-06', '2026-10-07']);
  });

  it('clamps check-out to check-in when the range is inverted', () => {
    expect(
      resolveHotelStayDates({ isFullTripStay: false, tripDates: DATES, stayStartIndex: 3, stayEndIndex: 1, activeDate: DATES[0] }),
    ).toEqual(['2026-10-08']);
  });

  it('clamps out-of-range indices to the trip bounds', () => {
    expect(
      resolveHotelStayDates({ isFullTripStay: false, tripDates: DATES, stayStartIndex: -5, stayEndIndex: 99, activeDate: DATES[0] }),
    ).toEqual(DATES);
  });

  it('falls back to the active date when the trip has no dates', () => {
    expect(
      resolveHotelStayDates({ isFullTripStay: false, tripDates: [], stayStartIndex: 0, stayEndIndex: 0, activeDate: '2026-10-05' }),
    ).toEqual(['2026-10-05']);
  });
});
