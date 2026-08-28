import { describe, expect, it } from 'vitest';
import {
  acknowledgeCapturedPlaces,
  buildGoogleMapsDirectionsSegments,
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  classifyResearchChip,
  ensurePlaceKindTag,
  exportPlacesToCSV,
  exportPlacesToKML,
  extractPlaceCoordinates,
  extractPriceCurrency,
  findExistingTripPlace,
  haversineDistanceKm,
  inferPlaceKind,
  inferSourceProvider,
  isPlausibleCustomTag,
  listTripDates,
  mergeCapturedPlaceResearch,
  mergeCaptureState,
  normalizeDelimitedText,
  normalizePlaceIdentity,
  optimizeStopsSequence,
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
  generateStaySpanPlaces,
  detectHotelTransferDays,
  estimateTripBudget,
  calculateTripSettlement,
  parseNumericPrice,
  parseDetailedPrice,
  convertPriceRange,
  placeIdentityKey,
  type OwnlyCaptureState,
  type TripExpenseItem,
  STANDARD_RESEARCH_CHIPS,
  type PlannerTripPlace,
} from './planner';
import {
  computeUrgencies,
  daysUntil as daysUntilDeparture,
  isWeatherRelevant,
  summarizeWeather,
  type OpenMeteoResponse,
} from './departure';

const NOW = new Date('2026-10-20T12:00:00Z');

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

  it('honors an explicit dropped state as a lifecycle command during recapture', () => {
    const existing = place('live', { state: 'scheduled', scheduled_date: '2026-10-07' });
    const merged = mergeCapturedPlaceResearch(existing, place('live', { state: 'dropped' }));
    expect(merged.state).toBe('dropped');
    expect(merged.scheduled_date).toBe('2026-10-07');
  });

  it('keeps structured facts when a later capture omits them (A2)', () => {
    const existing = place('rich', {
      address: '2-11-3 Meguro, Tokyo',
      coordinates: { lat: 35.6432, lng: 139.6982 },
      open_hours: '10:00-18:00',
      phone: '+81 3-5730-1531',
      plus_code: '8Q7X+MP Tokyo',
      menu_url: 'https://example.com/menu',
      reservation_url: 'https://example.com/book',
      review_topics: ['ramen', 'queue'],
      types: ['restaurant', 'cash_only'],
    });
    const merged = mergeCapturedPlaceResearch(existing, place('rich', { title: 'Renamed' }));
    expect(merged.address).toBe('2-11-3 Meguro, Tokyo');
    expect(merged.coordinates).toEqual({ lat: 35.6432, lng: 139.6982 });
    expect(merged.open_hours).toBe('10:00-18:00');
    expect(merged.phone).toBe('+81 3-5730-1531');
    expect(merged.plus_code).toBe('8Q7X+MP Tokyo');
    expect(merged.menu_url).toBe('https://example.com/menu');
    expect(merged.reservation_url).toBe('https://example.com/book');
    expect(merged.review_topics).toEqual(['ramen', 'queue']);
    expect(merged.types).toEqual(['restaurant', 'cash_only']);
  });

  it('upgrades structured facts and unions types when the new capture has them (A2)', () => {
    const existing = place('thin', { types: ['restaurant'] });
    const merged = mergeCapturedPlaceResearch(existing, place('thin', {
      coordinates: { lat: 1.35, lng: 103.82 },
      phone: '+65 6222-5555',
      types: ['tourist_attraction'],
    }));
    expect(merged.coordinates).toEqual({ lat: 1.35, lng: 103.82 });
    expect(merged.phone).toBe('+65 6222-5555');
    expect(merged.types).toEqual(['tourist_attraction', 'restaurant']);
  });

  it('normalizes prefixed dollar markers into ISO codes (B1)', () => {
    expect(extractPriceCurrency('S$25')).toBe('SGD');
    expect(extractPriceCurrency('HK$500')).toBe('HKD');
    expect(extractPriceCurrency('NT$1,200')).toBe('TWD');
    expect(extractPriceCurrency('US$9.90')).toBe('USD');
    expect(extractPriceCurrency('฿2,350')).toBe('THB');
    expect(extractPriceCurrency('¥18,000')).toBe('CNY');
    expect(extractPriceCurrency('free entry')).toBeNull();
  });

  it('converts prefixed-dollar prices into the trip base currency in budget estimates (B1)', () => {
    const est = estimateTripBudget([
      place('stay1', { kind: 'stay', observed_price: 'S$1,024' }),
      place('food1', { kind: 'food', observed_price: 'S$30' }),
    ], 2, { base: 'CNY' });
    expect(est.detectedCurrency).toBe('SGD');
    expect(est.categoryBreakdown.stay).toBeGreaterThan(0);
    expect(est.currencies).toEqual(['SGD']);
  });

  it('mergeCaptureState keeps background quick-captures and honors local tombstones', () => {
    const fresh: OwnlyCaptureState = {
      version: 1,
      trips: [],
      activeTripId: null,
      pendingPlaces: [place('bg-quick'), place('acked-gone')],
      knownPlaceIds: { 't1::u:bg': 'bg-quick' },
    };
    const local: OwnlyCaptureState = {
      version: 1,
      trips: [],
      activeTripId: null,
      pendingPlaces: [place('edited-local'), place('locally-deleted')],
      knownPlaceIds: { 't1::u:local': 'edited-local' },
    };
    const merged = mergeCaptureState(fresh, local, new Set(['locally-deleted', 'acked-gone']));
    expect(merged.trips).toBe(local.trips);
    expect(merged.pendingPlaces.map((p) => p.id)).toEqual(['edited-local', 'bg-quick']);
    expect(merged.knownPlaceIds['t1::u:bg']).toBe('bg-quick');
    expect(merged.knownPlaceIds['t1::u:local']).toBe('edited-local');
  });

  it('never moves stay anchors during route optimization (A3)', () => {
    const anchor = place('hotel', {
      kind: 'stay',
      is_anchor: true,
      anchor_type: 'stay_checkin',
      state: 'scheduled',
      coordinates: { lat: 35.6700, lng: 139.7000 },
    });
    const seq = [
      anchor,
      place('far-a', { coordinates: { lat: 35.9500, lng: 139.7500 } }),
      place('far-b', { coordinates: { lat: 35.9600, lng: 139.7600 } }),
      place('near', { coordinates: { lat: 35.6800, lng: 139.7100 } }),
    ];
    const result = optimizeStopsSequence(seq, { respectLocked: true });
    expect(result.places[0].id).toBe('hotel');
    expect(result.places[0].is_anchor).toBe(true);
  });

  it('infers place kind from Chinese, English, Japanese, and Thai across all categories', () => {
    // 1. Food & Dining (美食 / 餐厅)
    expect(inferPlaceKind('日本料理店')).toBe('food');
    expect(inferPlaceKind('Ekachan The Wisdom of Ethnic Thai Cuisine')).toBe('food');
    expect(inferPlaceKind('Thai restaurant')).toBe('food');
    expect(inferPlaceKind('ร้านอาหารไทย')).toBe('food');
    expect(inferPlaceKind('Fine Dining & Kitchen')).toBe('food');
    expect(inferPlaceKind('Hotel Restaurant & Bar')).toBe('food');
    expect(inferPlaceKind('Food Court Terminal 21')).toBe('food');
    expect(inferPlaceKind('Jay Fai Street Food')).toBe('food');
    expect(inferPlaceKind('居酒屋 鳥貴族')).toBe('food');
    expect(inferPlaceKind('Ichiran Ramen Shibuya')).toBe('food');
    expect(inferPlaceKind('Sukiyabashi Jiro Sushi')).toBe('food');
    expect(inferPlaceKind('HaiDiLao Hotpot')).toBe('food');
    expect(inferPlaceKind('全聚德烤鸭店')).toBe('food');
    expect(inferPlaceKind('陶陶居酒家 (Dim Sum)')).toBe('food');
    expect(inferPlaceKind('Din Tai Fung Dumplings')).toBe('food');

    // 2. Cafes & Desserts (咖啡 / 甜品 / 烘焙 / 茶饮)
    expect(inferPlaceKind('Coffee Shop & Roastery')).toBe('cafe');
    expect(inferPlaceKind('Factory Coffee Bangkok')).toBe('cafe');
    expect(inferPlaceKind('% Arabica Kyoto Arashiyama')).toBe('cafe');
    expect(inferPlaceKind('After You Dessert Cafe')).toBe('cafe');
    expect(inferPlaceKind('甘味処 和菓子')).toBe('cafe');
    expect(inferPlaceKind('คาเฟ่เชียงใหม่')).toBe('cafe');
    expect(inferPlaceKind('Hotel Cafe & Afternoon Tea')).toBe('cafe');
    expect(inferPlaceKind('Blue Bottle Coffee Omotesando Cafe')).toBe('cafe');
    expect(inferPlaceKind('Matcha Stand Maruni')).toBe('cafe');
    expect(inferPlaceKind('Châteraisé Pâtisserie & Bakery')).toBe('cafe');
    expect(inferPlaceKind('喜茶 奶茶店 (Heytea)')).toBe('cafe');

    // 3. Stays & Lodgings (酒店 / 住宿 / 民宿 / 度假村)
    expect(inferPlaceKind('Luxury Hotel & Resort')).toBe('stay');
    expect(inferPlaceKind('The quarter Chao Phraya by IHG')).toBe('stay');
    expect(inferPlaceKind('The Quarter Silom by UHG')).toBe('stay');
    expect(inferPlaceKind('Kimpton Maa-Lai Bangkok, an IHG Hotel')).toBe('stay');
    expect(inferPlaceKind('Four Seasons Resort Chiang Mai')).toBe('stay');
    expect(inferPlaceKind('โรงแรม แบงค็อก แมริออท มาร์คีส์ ควีนส์ปาร์ค')).toBe('stay');
    expect(inferPlaceKind('Kyoto Ryokan & Guesthouse')).toBe('stay');
    expect(inferPlaceKind('Capsule Hotel Shinjuku')).toBe('stay');
    expect(inferPlaceKind('Mandarin Oriental Tokyo')).toBe('stay');
    expect(inferPlaceKind('全季酒店 (Ji Hotel)')).toBe('stay');
    expect(inferPlaceKind('亚朵酒店 (Atour Hotel)')).toBe('stay');
    expect(inferPlaceKind('民宿·青木川客栈')).toBe('stay');

    // 4. Shopping (购物 / 商场 / 药妆 / 夜市集市)
    expect(inferPlaceKind('Outlet Shopping Mall')).toBe('shopping');
    expect(inferPlaceKind('Chatuchak Weekend Market')).toBe('shopping');
    expect(inferPlaceKind('Siam Paragon Shopping Center')).toBe('shopping');
    expect(inferPlaceKind('Don Quijote Shinjuku (ドン・キホーテ)')).toBe('shopping');
    expect(inferPlaceKind('松本清 药妆店 (Matsumoto Kiyoshi)')).toBe('shopping');
    expect(inferPlaceKind('Bic Camera Yurakucho')).toBe('shopping');
    expect(inferPlaceKind('Muji Ginza (無印良品)')).toBe('shopping');
    expect(inferPlaceKind('ตลาดนัดรถไฟ')).toBe('shopping');
    expect(inferPlaceKind('三井奥特莱斯购物城')).toBe('shopping');

    // 5. Transit & Transportation (交通 / 机场 / 车站 / 码头)
    expect(inferPlaceKind('Subway Station')).toBe('transit');
    expect(inferPlaceKind('Suvarnabhumi Airport (BKK)')).toBe('transit');
    expect(inferPlaceKind('Asakusa Pier / Ferry Terminal')).toBe('transit');
    expect(inferPlaceKind('Hakone Ropeway Cable Car')).toBe('transit');
    expect(inferPlaceKind('虹桥火车站 (Hongqiao Railway Station)')).toBe('transit');
    expect(inferPlaceKind('ท่าเรือสาทร')).toBe('transit');
    expect(inferPlaceKind('สถานีรถไฟกรุงเทพ')).toBe('transit');

    // 6. Experience & Wellness (体验 / SPA温泉 / 滑雪 / 乐园 / 游船)
    expect(inferPlaceKind('Let\'s Relax Onsen and Spa')).toBe('experience');
    expect(inferPlaceKind('Thai Massage & Wellness')).toBe('experience');
    expect(inferPlaceKind('Universal Studios Theme Park')).toBe('experience');
    expect(inferPlaceKind('Tokyo Disneyland & DisneySea')).toBe('experience');
    expect(inferPlaceKind('Niseko Ski Resort')).toBe('experience');
    expect(inferPlaceKind('Silom Thai Cooking Class')).toBe('experience');
    expect(inferPlaceKind('Similan Islands Scuba Diving & Snorkeling Tour')).toBe('experience');
    expect(inferPlaceKind('Chao Phraya Princess Dinner Cruise')).toBe('experience');
    expect(inferPlaceKind('大江户温泉物语 (Oedo Onsen)')).toBe('experience');
    expect(inferPlaceKind('นวดแผนไทย')).toBe('experience');

    // 7. Attractions & Sightseeing (观光景点 / 寺庙 / 博物馆 / 自然地标)
    expect(inferPlaceKind('Historical Temple & Museum')).toBe('attraction');
    expect(inferPlaceKind('Wat Arun Ratchawararam (Temple of Dawn)')).toBe('attraction');
    expect(inferPlaceKind('Shinjuku Gyoen National Garden')).toBe('attraction');
    expect(inferPlaceKind('Senso-ji Temple Asakusa (浅草寺)')).toBe('attraction');
    expect(inferPlaceKind('Fushimi Inari Taisha (伏见稻荷大社)')).toBe('attraction');
    expect(inferPlaceKind('Shibuya Sky Observation Deck')).toBe('attraction');
    expect(inferPlaceKind('Eiffel Tower')).toBe('attraction');
    expect(inferPlaceKind('故宫博物院 (The Palace Museum)')).toBe('attraction');
    expect(inferPlaceKind('พระบรมมหาราชวัง')).toBe('attraction');
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

  it('ensures default kind tags are attached and deduplicated cleanly', () => {
    expect(ensurePlaceKindTag(['曼谷', '必去'], 'stay', 'zh')).toEqual(['住宿', '曼谷', '必去']);
    expect(ensurePlaceKindTag(['Bangkok', 'Must'], 'stay', 'en')).toEqual(['Stay', 'Bangkok', 'Must']);
    expect(ensurePlaceKindTag(['住宿', '曼谷'], 'stay', 'zh')).toEqual(['住宿', '曼谷']);
    expect(ensurePlaceKindTag(['酒店', '曼谷'], 'stay', 'zh')).toEqual(['酒店', '曼谷']);
    expect(ensurePlaceKindTag([], 'food', 'zh')).toEqual(['美食']);
    expect(ensurePlaceKindTag([], 'cafe', 'zh')).toEqual(['咖啡']);
    expect(ensurePlaceKindTag([], 'experience', 'zh')).toEqual(['体验']);
    expect(ensurePlaceKindTag(['咖啡馆'], 'cafe', 'zh')).toEqual(['咖啡馆']);
  });

  it('filters out place titles, addresses, and invalid strings from custom tag chips', () => {
    const excluded = new Set(['浅草寺', 'tokyo, asakusa 2-3-1', '浅草']);
    expect(isPlausibleCustomTag('曼谷', excluded)).toBe(true);
    expect(isPlausibleCustomTag('绝美夜景', excluded)).toBe(true);
    expect(isPlausibleCustomTag('浅草寺', excluded)).toBe(false);
    expect(isPlausibleCustomTag('Tokyo, Asakusa 2-3-1', excluded)).toBe(false);
    expect(isPlausibleCustomTag('https://maps.google.com', excluded)).toBe(false);
    expect(isPlausibleCustomTag('100-0001', excluded)).toBe(false);
    expect(isPlausibleCustomTag('中央区银座4丁目12-15号', excluded)).toBe(false);
    expect(isPlausibleCustomTag('', excluded)).toBe(false);
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
    stops[0].phone = '+81312345678';
    const kmlAll = exportPlacesToKML('Tokyo Trip', 'Day 1', stops);
    expect(kmlAll).toContain('电话:');
    const kml = kmlAll;
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>1. 浅草寺</name>');
    expect(kml).toContain('<name>2. Blue Bottle</name>');

    const csv = exportPlacesToCSV(stops);
    expect(csv).toContain('Google_Maps_URL,Phone,Plus_Code,Menu_URL,Reservation_URL');
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

  it('extracts geographic coordinates accurately from diverse Google Maps URLs and place objects', () => {
    // 1. Direct object coordinates
    expect(extractPlaceCoordinates({ coordinates: { lat: 13.7437, lng: 100.4888 } })).toEqual({ lat: 13.7437, lng: 100.4888 });

    // 2. @lat,lng format
    expect(extractPlaceCoordinates('https://www.google.com/maps/place/Wat+Arun/@13.7437,100.4888,17z/data=...')).toEqual({ lat: 13.7437, lng: 100.4888 });

    // 3. !3dlat!4dlng format
    expect(extractPlaceCoordinates('https://www.google.com/maps/place/Sensoji/data=!4m2!3m1!1s0x0:0x0!3d35.7147!4d139.7966')).toEqual({ lat: 35.7147, lng: 139.7966 });

    // 4. query parameter format
    expect(extractPlaceCoordinates('https://www.google.com/maps/search/?api=1&query=35.6586,139.7454')).toEqual({ lat: 35.6586, lng: 139.7454 });

    // 5. Invalid / missing URLs
    expect(extractPlaceCoordinates('')).toBeNull();
    expect(extractPlaceCoordinates(null)).toBeNull();
    expect(extractPlaceCoordinates('https://example.com/not-maps')).toBeNull();
  });

  it('normalizes place identity across capture URL forms', () => {
    const searchForm = 'https://www.google.com/maps/search/?api=1&query=%E6%B5%85%E8%8D%89%E5%AF%BA';
    const placeForm = 'https://www.google.com/maps/place/%E6%B5%85%E8%8D%89%E5%AF%BA/@35.7147,139.7966,17z';
    expect(normalizePlaceIdentity(searchForm)).toBe(normalizePlaceIdentity(placeForm));
    expect(normalizePlaceIdentity('https://www.google.com/maps/search/?api=1&query=Blue+Bottle+Coffee')).toBe(
      normalizePlaceIdentity('https://maps.google.com/maps/place/Blue+Bottle+Coffee'),
    );
    expect(normalizePlaceIdentity('https://tabelog.com/tokyo/A1301/')).toMatch(/^u:/);
    expect(normalizePlaceIdentity('not a url')).toBe('u:not a url');
  });

  it('resolves stable places across capture forms with an ambiguity guard on place ids', () => {
    const places = [
      place('a', { source_url: 'https://www.google.com/maps/search/?api=1&query=Sensoji' }),
      place('b', { source_url: 'https://www.google.com/maps/place/Sensoji/@35.7,139.79', source_place_id: 'pid-1' }),
      place('c', { source_url: 'https://www.google.com/maps/search/?api=1&query=Other' }),
    ];

    expect(findExistingTripPlace({}, places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')?.id).toBe('a');
    expect(findExistingTripPlace({}, places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')?.id).toBe('b');

    const poisoned = [
      place('x', { source_url: 'https://www.google.com/maps/search/?api=1&query=A', source_place_id: 'same' }),
      place('y', { source_url: 'https://www.google.com/maps/search/?api=1&query=B', source_place_id: 'same' }),
    ];
    expect(findExistingTripPlace({}, poisoned, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=a', 'same')?.id).toBe('x');
  });

  it('acknowledges captured places without touching other queue entries', () => {
    const state = {
      version: 1 as const,
      trips: [],
      activeTripId: null,
      pendingPlaces: [place('keep'), place('drop')],
      knownPlaceIds: {},
    };
    const next = acknowledgeCapturedPlaces(state, ['drop']);
    expect(next.pendingPlaces.map((p) => p.id)).toEqual(['keep']);
    expect(state.pendingPlaces).toHaveLength(2);
  });

  it('neutralizes CDATA breakout and CSV formula injection in exports', () => {
    const sneaky = place('1', { title: 'Safe', notes: 'evil ]]><script>x</script>' });
    const kml = exportPlacesToKML('T', 'Day 1', [sneaky]);
    expect(kml).toContain('evil ]]&gt;&lt;script&gt;x&lt;/script&gt;');
    expect(kml).not.toContain('<![CDATA[' + '\n        <p><b>备注:</b> evil ]]>');

    const csv = exportPlacesToCSV([place('2', { why: '+SUM(A1)' })]);
    expect(csv).toContain("\"'+SUM(A1)\"");
  });

  it('calculates Haversine spherical distance between coordinates', () => {
    // Tokyo Tower (35.6586, 139.7454) to Sensoji (35.7147, 139.7966) is approx 7.8 km
    const dist = haversineDistanceKm(
      { lat: 35.6586, lng: 139.7454 },
      { lat: 35.7147, lng: 139.7966 },
    );
    expect(dist).toBeGreaterThan(7.0);
    expect(dist).toBeLessThan(8.5);
  });

  it('optimizes out-of-order itinerary stops into the shortest route', () => {
    // 4 stops in a linear east-west line:
    // P1 (lat 10.0, lng 100.0)
    // P2 (lat 10.0, lng 100.1)
    // P3 (lat 10.0, lng 100.2)
    // P4 (lat 10.0, lng 100.3)
    // Out of order: P1 -> P4 -> P2 -> P3 (zigzag)
    const p1 = place('1', { title: 'Stop 1', coordinates: { lat: 10.0, lng: 100.0 }, sort_order: 0 });
    const p2 = place('2', { title: 'Stop 2', coordinates: { lat: 10.0, lng: 100.1 }, sort_order: 1 });
    const p3 = place('3', { title: 'Stop 3', coordinates: { lat: 10.0, lng: 100.2 }, sort_order: 2 });
    const p4 = place('4', { title: 'Stop 4', coordinates: { lat: 10.0, lng: 100.3 }, sort_order: 3 });

    const zigzag = [p1, p4, p2, p3];
    const result = optimizeStopsSequence(zigzag, { fixStart: true });

    expect(result.improved).toBe(true);
    expect(result.savedKm).toBeGreaterThan(0);
    expect(result.places.map((p) => p.id)).toEqual(['1', '2', '3', '4']);
    expect(result.places[0].sort_order).toBe(0);
    expect(result.places[3].sort_order).toBe(3);
  });

  it('computes hotel proximity metrics against scheduled attractions', () => {
    const hotel = place('h1', {
      title: 'City Center Hotel',
      kind: 'stay',
      coordinates: { lat: 13.7500, lng: 100.5000 },
    });
    const stop1 = place('s1', { title: 'Temple', coordinates: { lat: 13.7510, lng: 100.5010 } });
    const stop2 = place('s2', { title: 'Museum', coordinates: { lat: 13.7550, lng: 100.5050 } });

    const metrics = calculateHotelProximity(hotel, [stop1, stop2]);
    expect(metrics.hasCoordinates).toBe(true);
    expect(metrics.minDistanceKm).toBeGreaterThan(0);
    expect(metrics.minDistanceKm).toBeLessThan(1.0); // very close (< 1km)
    expect(metrics.closestPlaceTitle).toBe('Temple');
  });

  it('calculates multi-day combined hotel proximity across consecutive days', () => {
    const hotel = place('h1', {
      title: 'Nimman Hotel',
      kind: 'stay',
      coordinates: { lat: 18.7960, lng: 98.9680 },
    });
    const day1Stop = place('d1', { title: 'Cafe 1', coordinates: { lat: 18.7970, lng: 98.9690 } });
    const day2Stop = place('d2', { title: 'Doi Suthep', coordinates: { lat: 18.8050, lng: 98.9210 } });

    const placesByDate = {
      '2026-10-01': [day1Stop],
      '2026-10-02': [day2Stop],
    };

    const multi = calculateMultiDayHotelProximity(hotel, placesByDate, ['2026-10-01', '2026-10-02']);
    expect(multi.hasCoordinates).toBe(true);
    expect(multi.combinedAvgKm).toBeGreaterThan(0);
    expect(multi.dayDetails).toHaveLength(2);
    expect(multi.dayDetails[0].avgKm).toBeLessThan(multi.dayDetails[1].avgKm);
  });

  it('generates multi-day stay span anchors without leaking locale text into data', () => {
    const hotel = place('hotel-1', { kind: 'stay', notes: 'Near East Gate' });
    const spans = generateStaySpanPlaces(hotel, ['2026-10-06', '2026-10-07', '2026-10-08']);
    expect(spans).toHaveLength(3);
    expect(spans.every((s) => s.is_anchor && s.anchor_type === 'stay_checkin')).toBe(true);
    expect(spans.every((s) => s.state === 'scheduled')).toBe(true);
    expect(new Set(spans.map((s) => s.scheduled_date)).size).toBe(3);
    expect(spans[0].id).toBe('hotel-1');
    expect(spans[1].id).toBe('hotel-1__stay_2026-10-07');
    spans.forEach((s) => expect(s.notes).toBe('Near East Gate'));
  });

  it('detects hotel transfer days and consecutive night indexes', () => {
    const hotelA = place('hA', {
      title: 'Hotel A (Old Town)',
      kind: 'stay',
      state: 'scheduled',
      scheduled_date: '2026-10-01',
      is_anchor: true,
      anchor_type: 'stay_checkin',
    });
    const hotelA_day2 = place('hA_2', {
      title: 'Hotel A (Old Town)',
      source_url: hotelA.source_url,
      kind: 'stay',
      state: 'scheduled',
      scheduled_date: '2026-10-02',
      is_anchor: true,
      anchor_type: 'stay_checkin',
    });
    const hotelB_day3 = place('hB_3', {
      title: 'Hotel B (Nimman)',
      kind: 'stay',
      state: 'scheduled',
      scheduled_date: '2026-10-03',
      is_anchor: true,
      anchor_type: 'stay_checkin',
    });

    const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const transfers = detectHotelTransferDays([hotelA, hotelA_day2, hotelB_day3], dates);

    expect(transfers['2026-10-01'].isTransferDay).toBe(false);
    expect(transfers['2026-10-01'].stayNightIndex).toBe(1);
    expect(transfers['2026-10-01'].totalStayNights).toBe(2);

    expect(transfers['2026-10-02'].isTransferDay).toBe(false);
    expect(transfers['2026-10-02'].stayNightIndex).toBe(2);
    expect(transfers['2026-10-02'].totalStayNights).toBe(2);

    expect(transfers['2026-10-03'].isTransferDay).toBe(true);
    expect(transfers['2026-10-03'].checkoutHotel?.title).toBe('Hotel A (Old Town)');
    expect(transfers['2026-10-03'].checkinHotel?.title).toBe('Hotel B (Nimman)');
  });

  it('parses numeric prices from diverse currency and range strings', () => {
    expect(parseNumericPrice('人均 ฿200-400')).toBe(300);
    expect(parseNumericPrice('¥1,800/晚')).toBe(1800);
    expect(parseNumericPrice('$25 per person')).toBe(25);
    expect(parseNumericPrice('')).toBe(0);
    expect(parseNumericPrice(null)).toBe(0);
  });

  it('parses detailed price ranges and currencies', () => {
    const range = parseDetailedPrice('฿400–1,000');
    expect(range).toEqual({
      raw: '฿400–1,000',
      currency: 'THB',
      minAmount: 400,
      maxAmount: 1000,
      isRange: true,
    });

    const single = parseDetailedPrice('$120.50 per night');
    expect(single).toEqual({
      raw: '$120.50 per night',
      currency: 'USD',
      minAmount: 120.5,
      maxAmount: 120.5,
      isRange: false,
    });
  });

  it('converts single and range prices into target trip currency', () => {
    const converted = convertPriceRange('฿400–1,000', 'CNY', { THB: 0.205 });
    expect(converted).not.toBeNull();
    expect(converted?.sourceCurrency).toBe('THB');
    expect(converted?.targetCurrency).toBe('CNY');
    expect(converted?.convertedMin).toBe(82);
    expect(converted?.convertedMax).toBe(205);
    expect(converted?.formattedTarget).toBe('¥82 – 205');
    expect(converted?.isRange).toBe(true);

    const convertedSingle = convertPriceRange('¥3,500', 'CNY', { JPY: 0.048 }, 'JPY');
    expect(convertedSingle?.sourceCurrency).toBe('JPY');
    expect(convertedSingle?.convertedMin).toBe(168);
    expect(convertedSingle?.formattedTarget).toBe('¥168');

    // USD should never be overwritten by THB fallback
    const convertedUsd = convertPriceRange('$100', 'CNY', { USD: 7.14 }, 'THB');
    expect(convertedUsd?.sourceCurrency).toBe('USD');
    expect(convertedUsd?.convertedMin).toBe(714);

    // EUR should be EUR
    const convertedEur = convertPriceRange('€50', 'CNY', { EUR: 7.80 }, 'THB');
    expect(convertedEur?.sourceCurrency).toBe('EUR');
    expect(convertedEur?.convertedMin).toBe(390);

    // GBP should be GBP
    const convertedGbp = convertPriceRange('£20', 'CNY', { GBP: 9.10 });
    expect(convertedGbp?.sourceCurrency).toBe('GBP');
    expect(convertedGbp?.convertedMin).toBe(182);

    // JPY with 円 symbol
    const convertedYen = convertPriceRange('10,000円', 'CNY', { JPY: 0.048 });
    expect(convertedYen?.sourceCurrency).toBe('JPY');
    expect(convertedYen?.convertedMin).toBe(480);

    // SGD, HKD, TWD, AUD, CAD
    const convertedSgd = convertPriceRange('S$25', 'CNY', { SGD: 5.40 });
    expect(convertedSgd?.sourceCurrency).toBe('SGD');
    expect(convertedSgd?.convertedMin).toBe(135);

    const convertedHkd = convertPriceRange('HK$100', 'CNY', { HKD: 0.91 });
    expect(convertedHkd?.sourceCurrency).toBe('HKD');
    expect(convertedHkd?.convertedMin).toBe(91);

    const convertedTwd = convertPriceRange('NT$500', 'CNY', { TWD: 0.22 });
    expect(convertedTwd?.sourceCurrency).toBe('TWD');
    expect(convertedTwd?.convertedMin).toBe(110);

    const convertedAud = convertPriceRange('A$50', 'CNY', { AUD: 4.65 });
    expect(convertedAud?.sourceCurrency).toBe('AUD');
    expect(convertedAud?.convertedMin).toBe(232.5);

    const convertedCad = convertPriceRange('C$50', 'CNY', { CAD: 5.20 });
    expect(convertedCad?.sourceCurrency).toBe('CAD');
    expect(convertedCad?.convertedMin).toBe(260);

    const convertedVnd = convertPriceRange('100,000₫', 'CNY', { VND: 0.00029 });
    expect(convertedVnd?.sourceCurrency).toBe('VND');
    expect(convertedVnd?.convertedMin).toBe(29);

    const convertedMyr = convertPriceRange('RM 50', 'CNY', { MYR: 1.62 });
    expect(convertedMyr?.sourceCurrency).toBe('MYR');
    expect(convertedMyr?.convertedMin).toBe(81);
  });

  it('estimates categorized trip budget based on scheduled places and traveler count', () => {
    const hotel = place('h1', { kind: 'stay', observed_price: '฿1,800/晚' });
    const restaurant = place('r1', { kind: 'food', observed_price: '人均 ฿300' });
    const museum = place('m1', { kind: 'attraction', observed_price: '฿200' });

    const estimate = estimateTripBudget([hotel, restaurant, museum], 4, { base: 'THB' });
    // stay = 1800
    // food = 300 * 4 = 1200
    // ticket = 200 * 4 = 800
    // total = 3800
    expect(estimate.totalEstimated).toBe(3800);
    expect(estimate.perPersonEstimated).toBe(950);
    expect(estimate.categoryBreakdown.stay).toBe(1800);
    expect(estimate.categoryBreakdown.food).toBe(1200);
    expect(estimate.categoryBreakdown.ticket).toBe(800);
  });

  it('computes Minimum Cash Flow settlement with greedy debt clearance', () => {
    // 3 travelers: Alice, Bob, Charlie
    // Alice paid ¥300 for dinner split by [Alice, Bob, Charlie] (¥100 each)
    // Bob paid ¥150 for taxi split by [Bob, Charlie] (¥75 each)
    // Net:
    // Alice: paid 300, share 100 -> net +200 (creditor)
    // Bob: paid 150, share 175 -> net -25 (debtor)
    // Charlie: paid 0, share 175 -> net -175 (debtor)
    // Minimum transfers:
    // Charlie -> Alice: 175
    // Bob -> Alice: 25
    const expenses: TripExpenseItem[] = [
      {
        id: 'e1',
        trip_id: 't1',
        title: 'Dinner',
        category: 'food',
        amount: 300,
        currency: '¥',
        paid_by: 'Alice',
        split_members: ['Alice', 'Bob', 'Charlie'],
        created_at: '2026-10-01',
      },
      {
        id: 'e2',
        trip_id: 't1',
        title: 'Taxi',
        category: 'transit',
        amount: 150,
        currency: '¥',
        paid_by: 'Bob',
        split_members: ['Bob', 'Charlie'],
        created_at: '2026-10-01',
      },
    ];

    const settlement = calculateTripSettlement(expenses, ['Alice', 'Bob', 'Charlie']);
    expect(settlement.totalExpense).toBe(450);
    expect(settlement.transfers).toHaveLength(2);

    const charlieTransfer = settlement.transfers.find((t) => t.from === 'Charlie');
    expect(charlieTransfer?.to).toBe('Alice');
    expect(charlieTransfer?.amount).toBe(175);

    const bobTransfer = settlement.transfers.find((t) => t.from === 'Bob');
    expect(bobTransfer?.to).toBe('Alice');
    expect(bobTransfer?.amount).toBe(25);

    expect(settlement.summaryText).toContain('Charlie 👉 微信转账给 Alice');
  });
});

describe('Route optimization pinning & budget currency', () => {
  const coord = (lat: number, lng: number) => `https://www.google.com/maps/place/X/@${lat},${lng},15z`;
  function stop(id: string, lat: number | null, overrides: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
    return place(id, {
      source_url: lat === null ? `https://www.google.com/maps/search/?api=1&query=${id}` : coord(lat, (Number(id.charCodeAt(0)) % 10) + 100),
      ...overrides,
    });
  }

  it('keeps locked and coordinate-less stops pinned at their slots', () => {
    const seq = [
      stop('a', 35.700),
      stop('locked-mid', 35.720, { locked: true }),
      stop('c', 35.740),
      stop('no-coord', null),
      stop('e', 35.680),
    ];
    const result = optimizeStopsSequence(seq, { respectLocked: true });
    expect(result.places[1].id).toBe('locked-mid');
    expect(result.places[3].id).toBe('no-coord');
    expect(result.places.filter((p) => p.id === 'no-coord')).toHaveLength(1);
  });

  it('never moves a locked stop even when it sits mid-route with big detours available', () => {
    const seq = [
      stop('start', 35.670, { locked: true }),
      stop('far-a', 35.950),
      stop('anchor', 35.675, { locked: true }),
      stop('far-b', 35.960),
      stop('tail', 35.690),
    ];
    const result = optimizeStopsSequence(seq, { respectLocked: true });
    expect(result.places[0].id).toBe('start');
    expect(result.places[2].id).toBe('anchor');
  });

  it('keeps start pinned by default even when options is passed with only respectLocked', () => {
    const seq = [
      stop('start', 35.670),
      stop('mid1', 35.800),
      stop('mid2', 35.700),
      stop('tail', 35.900),
    ];
    const result = optimizeStopsSequence(seq, { respectLocked: true });
    expect(result.places[0].id).toBe('start');
  });

  it('haversineDistanceKm calculates accurately and does not produce NaN for identical or close coords', () => {
    const c = { lat: 35.6895, lng: 139.6917 };
    expect(haversineDistanceKm(c, c)).toBe(0);
    const c2 = { lat: 35.6896, lng: 139.6918 };
    expect(haversineDistanceKm(c, c2)).toBeGreaterThan(0);
    expect(Number.isFinite(haversineDistanceKm(c, c2))).toBe(true);
  });
});
describe('daysUntil', () => {
  it('computes positive days for future dates', () => {
    expect(daysUntilDeparture('2026-10-27', NOW)).toBe(7);
  });
  it('handles ISO strings with time component', () => {
    expect(daysUntilDeparture('2026-10-27T15:30:00Z', NOW)).toBe(7);
  });
  it('returns 0 for today', () => {
    expect(daysUntilDeparture('2026-10-20', NOW)).toBe(0);
  });
});

describe('isWeatherRelevant', () => {
  it('is true within 16-day window', () => {
    expect(isWeatherRelevant('2026-10-25', NOW)).toBe(true);
  });
  it('is false outside window', () => {
    expect(isWeatherRelevant('2026-12-15', NOW)).toBe(false);
  });
});

describe('summarizeWeather', () => {
  const mock: OpenMeteoResponse = {
    daily: {
      time: ['2026-10-25', '2026-10-26'],
      temperature_2m_max: [32, 28],
      temperature_2m_min: [24, 22],
      precipitation_sum: [0, 12.5],
      weather_code: [1, 65],
    },
  };
  it('summarizes with rain detection and labels', () => {
    const r = summarizeWeather(mock);
    expect(r[0].label).toBe('🌤️');
    expect(r[1].is_rainy).toBe(true);
  });
});

describe('computeUrgencies', () => {
  const NOW = new Date('2026-10-20T12:00:00Z');
  function dp(id: string, o: Partial<PlannerTripPlace> = {}): PlannerTripPlace {
    return {
      schema_version: '0.1', type: 'trip_place', id,
      trip_id: 't1', title: id, source_provider: 'google_maps',
      source_url: `https://maps.google.com/?q=${id}`, kind: 'attraction',
      priority: 'want', tags: [], signals: [], risks: [],
      reservation_status: 'none', state: 'candidate',
      created_at: '2026-08-01', ...o,
    };
  }
  it('flags lead-time risk as urgent when past deadline', () => {
    const u = computeUrgencies([dp('r', { risks: ['需提前2周预约'], reservation_status: 'needed' })], '2026-10-30', NOW);
    expect(u.some((x) => x.severity === 'urgent')).toBe(true);
  });
  it('does not flag when plenty of time remains', () => {
    expect(computeUrgencies([dp('r', { risks: ['需提前2周预约'] })], '2026-12-19', NOW)).toHaveLength(0);
  });
});