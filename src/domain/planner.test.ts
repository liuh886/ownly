import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsDirectionsSegments,
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  classifyResearchChip,
  exportPlacesToCSV,
  exportPlacesToKML,
  inferPlaceKind,
  inferSourceProvider,
  listTripDates,
  mergeCapturedPlaceResearch,
  normalizeDelimitedText,
  STANDARD_RESEARCH_CHIPS,
  type PlannerTripPlace,
} from './planner';

function place(id: string, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
  return {
    schema_version: '0.1',
    type: 'trip_place',
    id,
    trip_id: 'trip-1',
    title: `Place ${id}`,
    source_provider: 'google_maps',
    source_url: `https://www.google.com/maps/place/${id}`,
    kind: 'attraction',
    priority: 'want',
    tags: [],
    signals: [],
    risks: [],
    reservation_status: 'none',
    state: 'candidate',
    created_at: '2026-08-21T00:00:00.000Z',
    ...overrides,
  };
}

describe('Ownly Planner domain', () => {
  it('builds inclusive date-only trip days without timezone drift', () => {
    expect(listTripDates('2026-10-06', '2026-10-09')).toEqual([
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('splits long Google Maps routes into overlapping mobile-safe segments', () => {
    const places = Array.from({ length: 6 }, (_, index) => place(String(index + 1), {
      state: 'scheduled',
      sort_order: index,
    }));
    const segments = buildGoogleMapsDirectionsSegments(places, 'transit');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain('origin=Place+1');
    expect(segments[0]).toContain('destination=Place+5');
    expect(segments[1]).toContain('origin=Place+5');
    expect(segments[1]).toContain('destination=Place+6');
  });

  it('updates recaptured research without destroying the canonical schedule', () => {
    const existing = place('stable', {
      title: 'Old title',
      state: 'scheduled',
      scheduled_date: '2026-10-07',
      sort_order: 2,
      locked: true,
      reservation_status: 'booked',
      area: 'Old area',
      signals: ['old signal'],
    });
    const captured = place('stable', {
      title: 'Fresh title',
      area: 'Asakusa',
      priority: 'must',
      signals: ['early morning'],
      observed_rating: 4.7,
      state: 'candidate',
      reservation_status: 'none',
      updated_at: '2026-08-21T01:00:00.000Z',
    });

    const merged = mergeCapturedPlaceResearch(existing, captured);
    expect(merged.title).toBe('Fresh title');
    expect(merged.area).toBe('Asakusa');
    expect(merged.priority).toBe('must');
    expect(merged.signals).toEqual(['early morning']);
    expect(merged.observed_rating).toBe(4.7);
    expect(merged.state).toBe('scheduled');
    expect(merged.scheduled_date).toBe('2026-10-07');
    expect(merged.sort_order).toBe(2);
    expect(merged.locked).toBe(true);
    expect(merged.reservation_status).toBe('booked');
  });

  it('infers place kind from Chinese and English categories', () => {
    expect(inferPlaceKind('日本料理店')).toBe('food');
    expect(inferPlaceKind('Coffee Shop')).toBe('cafe');
    expect(inferPlaceKind('Luxury Hotel & Resort')).toBe('stay');
    expect(inferPlaceKind('Outlet Shopping Mall')).toBe('shopping');
    expect(inferPlaceKind('Subway Station')).toBe('transit');
    expect(inferPlaceKind('Historical Temple & Museum')).toBe('attraction');
    expect(inferPlaceKind(undefined)).toBe('attraction');
  });

  it('normalizes tags and delimited values cleanly', () => {
    expect(normalizeDelimitedText('Tokyo 2026, 美食清单， Want to go ; 浅草')).toEqual([
      'Tokyo 2026',
      '美食清单',
      'Want to go',
      '浅草',
    ]);
  });

  it('detects day-of-week opening hours collision accurately', () => {
    // 2026-10-05 is Monday
    expect(checkOpeningHoursCollision('Monday: Closed; Tue-Sun: 10:00-18:00', '2026-10-05').isCollision).toBe(true);
    expect(checkOpeningHoursCollision('周一闭馆，周二至周日正常开放', '2026-10-05').isCollision).toBe(true);
    expect(checkOpeningHoursCollision('定休日：月曜日', '2026-10-05').isCollision).toBe(true);
    // 2026-10-06 is Tuesday
    expect(checkOpeningHoursCollision('Monday: Closed; Tue-Sun: 10:00-18:00', '2026-10-06').isCollision).toBe(false);
  });

  it('builds clean multi-stop Google Maps directions URLs', () => {
    const stops = [
      place('1', { title: '浅草寺', address: 'Tokyo, Asakusa 2-3-1' }),
      place('2', { title: '东京晴空塔', address: 'Tokyo, Sumida City' }),
      place('3', { title: '银座六号', address: 'Tokyo, Ginza 6-10-1' }),
    ];
    const url = buildGoogleMapsRouteUrl(stops, 'transit');
    expect(url).toContain('travelmode=transit');
    expect(url).toContain('origin=Tokyo%2C%20Asakusa%202-3-1');
    expect(url).toContain('destination=Tokyo%2C%20Ginza%206-10-1');
    expect(url).toContain('waypoints=Tokyo%2C%20Sumida%20City');
  });

  it('exports valid KML and CSV format for Google My Maps', () => {
    const stops = [
      place('1', { title: '浅草寺', kind: 'attraction', observed_rating: 4.6, address: 'Tokyo, Asakusa' }),
      place('2', { title: 'Blue Bottle', kind: 'cafe', observed_price: '¥800', address: 'Tokyo, Shibuya' }),
    ];
    const kml = exportPlacesToKML('Tokyo Trip', 'Day 1', stops);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>1. 浅草寺</name>');
    expect(kml).toContain('<name>2. Blue Bottle</name>');

    const csv = exportPlacesToCSV(stops);
    expect(csv).toContain('Order,Title,Kind,Rating,Price,Address,Why,Notes,Tags,Google_Maps_URL');
    expect(csv).toContain('1,"浅草寺","attraction",4.6');
  });

  it('classifies research chips accurately into risks and signals', () => {
    expect(classifyResearchChip('需排队')).toBe('risk');
    expect(classifyResearchChip('建议预约')).toBe('risk');
    expect(classifyResearchChip('只收现金')).toBe('risk');
    expect(classifyResearchChip('Long queue')).toBe('risk');
    expect(classifyResearchChip('Book in advance')).toBe('risk');
    expect(classifyResearchChip('Avoid rain')).toBe('risk');

    expect(classifyResearchChip('绝美夜景')).toBe('signal');
    expect(classifyResearchChip('必吃')).toBe('signal');
    expect(classifyResearchChip('Sunset spot')).toBe('signal');
    expect(classifyResearchChip('Convenient transit')).toBe('signal');
  });

  it('exposes a consistent set of standard research chips', () => {
    expect(STANDARD_RESEARCH_CHIPS.zh.length).toBeGreaterThan(0);
    expect(STANDARD_RESEARCH_CHIPS.en.length).toBeGreaterThan(0);
    expect(STANDARD_RESEARCH_CHIPS.zh.some((c) => c.label === '需排队' && c.category === 'risk')).toBe(true);
    expect(STANDARD_RESEARCH_CHIPS.zh.some((c) => c.label === '必吃' && c.category === 'signal')).toBe(true);
    expect(STANDARD_RESEARCH_CHIPS.en.some((c) => c.label === 'Long Queue' && c.category === 'risk')).toBe(true);
  });

  it('infers source provider correctly from travel research URLs', () => {
    expect(inferSourceProvider('https://www.google.com/maps/place/Tokyo+Tower')).toBe('google_maps');
    expect(inferSourceProvider('https://tabelog.com/tokyo/A1301/A130101/13002243/')).toBe('tabelog');
    expect(inferSourceProvider('https://www.xiaohongshu.com/explore/64a1b2c3')).toBe('xiaohongshu');
    expect(inferSourceProvider('https://www.booking.com/hotel/jp/tokyo-station.html')).toBe('booking');
    expect(inferSourceProvider('https://example.com/blog/travel')).toBe('other');
  });
});
