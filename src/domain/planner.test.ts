import { describe, expect, it } from 'vitest';
import {
  acknowledgeCapturedPlaces,
  buildGoogleMapsDirectionsSegments,
  buildGoogleMapsRouteUrl,
  checkOpeningHoursCollision,
  checkDayScheduleCollisions,
  classifyResearchChip,
  ensurePlaceKindTag,
  exportPlacesToCSV,
  exportPlacesToKML,
  exportTripToMarkdown,
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
  normalizeObservedPrice,
  calculateHotelProximity,
  calculateMultiDayHotelProximity,
  detectHotelTransferDays,
  estimateTripBudget,
  calculateTripSettlement,
  parseNumericPrice,
  parseDetailedPrice,
  convertPriceRange,
  parseImportPayload,
  parsePlaceExpenseEstimate,
  type OwnlyCaptureState,
  type TripExpenseItem,
  type PlannerScheduledPlace,
  type PlannerTrip,
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

function scheduledPlace(
  base: PlannerTripPlace,
  date: string,
  sortOrder = 0,
  overrides: Partial<PlannerScheduledPlace> = {},
): PlannerScheduledPlace {
  return {
    ...base,
    id: `visit:${base.id}:${date}:${sortOrder}`,
    visit_id: `visit:${base.id}:${date}:${sortOrder}`,
    place_id: base.id,
    state: 'scheduled',
    scheduled_date: date,
    sort_order: sortOrder,
    locked: false,
    is_anchor: false,
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

  it('splits long Google Maps routes into overlapping mobile-safe Visit segments', () => {
    const places = Array.from({ length: 6 }, (_, index) => scheduledPlace(place(String(index + 1)), '2026-10-20', index));
    const segments = buildGoogleMapsDirectionsSegments(places, 'transit');
    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain('origin=Place+1');
    expect(segments[0]).toContain('destination=Place+5');
    expect(segments[1]).toContain('origin=Place+5');
    expect(segments[1]).toContain('destination=Place+6');
  });

  it('updates recaptured research without destroying Planner-owned research decisions', () => {
    const existing = place('stable', {
      title: 'Old title',
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
    expect(merged.area).toBe('Old area');
    expect(merged.priority).toBe('want');
    expect(merged.signals).toEqual(['old signal']);
    expect(merged.observed_rating).toBe(4.7);
    expect(merged.state).toBe('candidate');
    expect(merged.reservation_status).toBe('booked');
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

  it('preserves manually edited observed_price, notes, and tags when a bulk import has no price', () => {
    const existingHotel = place('hotel_mbs', {
      kind: 'stay',
      title: 'Marina Bay Sands',
      observed_price: 'S$850/night',
      notes: 'Booked via official site with breakfast',
      why: 'Iconic infinity pool',
      tags: ['酒店住宿', 'Luxury', 'Bay Area'],
      observed_rating: 4.8,
      duration_minutes: 60,
    });

    // Thin incoming place from a saved collection list without prices or notes:
    const incomingSavedItem = place('hotel_mbs', {
      title: 'Marina Bay Sands',
      source_provider: 'google_maps',
      source_url: 'https://maps.google.com/?cid=12345',
      kind: 'stay',
      tags: ['酒店住宿'],
      observed_price: undefined,
      notes: undefined,
      why: undefined,
    });

    const merged = mergeCapturedPlaceResearch(existingHotel, incomingSavedItem);
    expect(merged.observed_price).toBe('S$850/night');
    expect(merged.notes).toBe('Booked via official site with breakfast');
    expect(merged.why).toBe('Iconic infinity pool');
    expect(merged.observed_rating).toBe(4.8);
    expect(merged.duration_minutes).toBe(60);
    expect(merged.tags).toContain('Luxury');
    expect(merged.tags).toContain('Bay Area');
    expect(merged.tags).toContain('酒店住宿');
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

  it('normalizes captured price text into comparable source facts', () => {
    expect(normalizeObservedPrice('人均 ฿400–600', 'THB')).toEqual({
      currency: 'THB', min: 400, max: 600, unit: 'person',
    });
    expect(normalizeObservedPrice('S$1,024 night', 'SGD')).toEqual({
      currency: 'SGD', min: 1024, max: 1024, unit: 'night',
    });
    expect(normalizeObservedPrice('$$$')).toEqual({ unit: 'level', level: 3 });
    expect(normalizeObservedPrice('$50–100', 'SGD')).toEqual({
      currency: 'SGD', min: 50, max: 100, unit: 'unknown',
    });
    expect(normalizeObservedPrice('¥3,500', 'JPY')).toEqual({
      currency: 'JPY', min: 3500, max: 3500, unit: 'unknown',
    });
  });

  it('refreshes raw category, review volume and structured price without touching Planner decisions', () => {
    const existing = place('facts', { kind: 'food', priority: 'must', source_category: 'Restaurant' });
    const captured = place('facts', {
      kind: 'cafe',
      priority: 'optional',
      source_category: 'Thai restaurant',
      observed_review_count: 12480,
      observed_price: '人均 ฿400–600',
      price_currency: 'THB',
      price_min: 400,
      price_max: 600,
      price_unit: 'person',
    });
    const merged = mergeCapturedPlaceResearch(existing, captured);
    expect(merged.kind).toBe('food');
    expect(merged.priority).toBe('must');
    expect(merged.source_category).toBe('Thai restaurant');
    expect(merged.observed_review_count).toBe(12480);
    expect(merged.price_currency).toBe('THB');
    expect(merged.price_min).toBe(400);
    expect(merged.price_max).toBe(600);
    expect(merged.price_unit).toBe('person');
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

  it('converts ambiguous $59 using fallback SGD when provided', () => {
    const result = convertPriceRange('$59', 'CNY', { USD: 1, CNY: 0.14, SGD: 0.74 }, 'SGD');
    expect(result).not.toBeNull();
    expect(result!.sourceCurrency).toBe('SGD');
    expect(result!.convertedMin).toBeCloseTo(311.86, 1);
  });

  it('correctly calculates distance to last stop and sorts candidates closest first', () => {
    const lastStop = place('last_stop', {
      title: 'Marina Bay Sands',
      coordinates: { lat: 1.2838, lng: 103.8591 },
    });

    const candidateNear = place('cand_near', {
      title: 'Gardens by the Bay',
      coordinates: { lat: 1.2815, lng: 103.8636 }, // ~0.5 km
    });

    const candidateFar = place('cand_far', {
      title: 'Changi Airport',
      coordinates: { lat: 1.3644, lng: 103.9915 }, // ~16 km
    });

    const candidateNoCoords = place('cand_no_coords', {
      title: 'Unknown Cafe',
    });

    const lastCoords = extractPlaceCoordinates(lastStop)!;
    const distNear = haversineDistanceKm(lastCoords, extractPlaceCoordinates(candidateNear)!);
    const distFar = haversineDistanceKm(lastCoords, extractPlaceCoordinates(candidateFar)!);

    expect(distNear).toBeLessThan(1.0);
    expect(distFar).toBeGreaterThan(10.0);

    const candidatesList = [candidateFar, candidateNoCoords, candidateNear];
    const sorted = [...candidatesList].sort((a, b) => {
      const cA = extractPlaceCoordinates(a);
      const cB = extractPlaceCoordinates(b);
      const dA = cA ? haversineDistanceKm(lastCoords, cA) : Infinity;
      const dB = cB ? haversineDistanceKm(lastCoords, cB) : Infinity;
      return dA - dB;
    });

    expect(sorted[0].id).toBe('cand_near');
    expect(sorted[1].id).toBe('cand_far');
    expect(sorted[2].id).toBe('cand_no_coords');
  });

  it('mergeCaptureState keeps background quick-captures and honors local tombstones', () => {
    const fresh: OwnlyCaptureState = {
      version: 2,
      activeContext: { tripId: 'trip-1', title: 'Tokyo' },
      pendingPlaces: [place('bg-quick'), place('acked-gone')],
    };
    const local: OwnlyCaptureState = {
      version: 2,
      activeContext: null,
      pendingPlaces: [place('edited-local'), place('locally-deleted')],
    };
    const merged = mergeCaptureState(fresh, local, new Set(['locally-deleted', 'acked-gone']));
    expect(merged.activeContext).toEqual(fresh.activeContext);
    expect(merged.pendingPlaces.map((p) => p.id)).toEqual(['edited-local', 'bg-quick']);
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
    expect(inferPlaceKind('Oakwood Studios Sukhumvit Bangkok')).toBe('stay');
    expect(inferPlaceKind('โรงแรมโอ๊ควูด สตูดิโอ สุขุมวิท แบงค็อก')).toBe('stay');
    expect(inferPlaceKind('Oakwood Studios Sukhumvit Bangkok 4.4 (996)·5-star hotel lodging restaurant point_of_interest')).toBe('stay');
    expect(inferPlaceKind('5-star hotel')).toBe('stay');
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
    expect(inferPlaceKind('용산 드래곤힐스파 찜질방')).toBe('experience');

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
    expect(inferPlaceKind('경복궁 (Gyeongbokgung Palace)')).toBe('attraction');
    expect(inferPlaceKind('N서울타워 전망대')).toBe('attraction');
    expect(inferPlaceKind('Cathédrale Notre-Dame de Paris')).toBe('attraction');
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
    expect(normalizePlaceIdentity(searchForm)).not.toBe(normalizePlaceIdentity(placeForm));
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

    expect(findExistingTripPlace(places, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=Sensoji%20')?.id).toBe('a');
    expect(findExistingTripPlace(places, 'trip-1', 'https://maps.google.com/other-path', 'pid-1')?.id).toBe('b');

    const poisoned = [
      place('x', { source_url: 'https://www.google.com/maps/search/?api=1&query=A', source_place_id: 'same' }),
      place('y', { source_url: 'https://www.google.com/maps/search/?api=1&query=B', source_place_id: 'same' }),
    ];
    expect(findExistingTripPlace(poisoned, 'trip-1', 'https://www.google.com/maps/search/?api=1&query=a', 'same')?.id).toBe('x');
  });

  it('acknowledges captured places without touching other queue entries', () => {
    const state = {
      version: 2 as const,
      activeContext: { tripId: 'trip-1', title: 'Tokyo' },
      pendingPlaces: [place('keep'), place('drop')],
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

  it('computes hotel proximity metrics against scheduled attractions', () => {
    const hotel = place('h1', {
      title: 'City Center Hotel',
      kind: 'stay',
      coordinates: { lat: 13.7500, lng: 100.5000 },
    });
    const stop1 = place('s1', { title: 'Temple', coordinates: { lat: 13.7510, lng: 100.5010 } });
    const stop2 = place('s2', { title: 'Museum', coordinates: { lat: 13.7550, lng: 100.5050 } });

    const metrics = calculateHotelProximity(hotel, [
      scheduledPlace(stop1, '2026-10-01', 0),
      scheduledPlace(stop2, '2026-10-01', 1),
    ]);
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
      '2026-10-01': [scheduledPlace(day1Stop, '2026-10-01', 0)],
      '2026-10-02': [scheduledPlace(day2Stop, '2026-10-02', 0)],
    };

    const multi = calculateMultiDayHotelProximity(hotel, placesByDate, ['2026-10-01', '2026-10-02']);
    expect(multi.hasCoordinates).toBe(true);
    expect(multi.combinedAvgKm).toBeGreaterThan(0);
    expect(multi.dayDetails).toHaveLength(2);
    expect(multi.dayDetails[0].avgKm).toBeLessThan(multi.dayDetails[1].avgKm);
  });

  it('detects hotel transfer days and consecutive night indexes from Visit projections', () => {
    const hotelA = place('hA', { title: 'Hotel A (Old Town)', kind: 'stay' });
    const hotelB = place('hB', { title: 'Hotel B (Nimman)', kind: 'stay' });
    const hotelA1 = scheduledPlace(hotelA, '2026-10-01', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const hotelA2 = scheduledPlace(hotelA, '2026-10-02', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const hotelB3 = scheduledPlace(hotelB, '2026-10-03', 0, { is_anchor: true, anchor_type: 'stay_checkin' });
    const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const transfers = detectHotelTransferDays([hotelA1, hotelA2, hotelB3], dates);
    expect(transfers['2026-10-01'].isTransferDay).toBe(false);
    expect(transfers['2026-10-01'].stayNightIndex).toBe(1);
    expect(transfers['2026-10-01'].totalStayNights).toBe(2);
    expect(transfers['2026-10-02'].stayNightIndex).toBe(2);
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

    // Test with USD pivot table (Live market rates from background)
    const pivotTable = { USD: 1, CNY: 0.14, GBP: 1.36, EUR: 1.09, JPY: 0.0067, THB: 0.027, SGD: 0.74, PHP: 0.018, VND: 0.00004 };
    const convertedGbpWithPivot = convertPriceRange('£20', 'CNY', pivotTable);
    expect(convertedGbpWithPivot?.sourceCurrency).toBe('GBP');
    expect(convertedGbpWithPivot?.rate).toBeCloseTo(9.7143, 2);
    expect(convertedGbpWithPivot?.convertedMin).toBe(194.29);
    expect(convertedGbpWithPivot?.rateDescription).toBe('1 GBP ≈ 9.71 CNY');

    // Test Target = THB (Arbitrary Trip Currency)
    const convertedUsdToThb = convertPriceRange('$100', 'THB', pivotTable);
    expect(convertedUsdToThb?.sourceCurrency).toBe('USD');
    expect(convertedUsdToThb?.targetCurrency).toBe('THB');
    expect(convertedUsdToThb?.rate).toBeCloseTo(37.037, 2);
    expect(convertedUsdToThb?.convertedMin).toBe(3703.7);
    expect(convertedUsdToThb?.formattedTarget).toBe('฿3,703.70');
    expect(convertedUsdToThb?.rateDescription).toBe('1 USD ≈ 37.04 THB');

    const convertedCnyToThb = convertPriceRange('¥100', 'THB', pivotTable);
    expect(convertedCnyToThb?.sourceCurrency).toBe('CNY');
    expect(convertedCnyToThb?.rate).toBeCloseTo(5.1852, 2);
    expect(convertedCnyToThb?.convertedMin).toBe(518.52);
    expect(convertedCnyToThb?.formattedTarget).toBe('฿518.52');

    const convertedJpyToThb = convertPriceRange('10,000円', 'THB', pivotTable);
    expect(convertedJpyToThb?.sourceCurrency).toBe('JPY');
    expect(convertedJpyToThb?.rate).toBeCloseTo(0.2481, 2);
    expect(convertedJpyToThb?.convertedMin).toBe(2481.48);
    expect(convertedJpyToThb?.formattedTarget).toBe('฿2,481.48');

    // Test Target = USD
    const convertedThbToUsd = convertPriceRange('฿500', 'USD', pivotTable);
    expect(convertedThbToUsd?.sourceCurrency).toBe('THB');
    expect(convertedThbToUsd?.targetCurrency).toBe('USD');
    expect(convertedThbToUsd?.convertedMin).toBe(13.5);
    expect(convertedThbToUsd?.formattedTarget).toBe('$13.50');

    // Test Target = EUR
    const convertedGbpToEur = convertPriceRange('£100', 'EUR', pivotTable);
    expect(convertedGbpToEur?.sourceCurrency).toBe('GBP');
    expect(convertedGbpToEur?.targetCurrency).toBe('EUR');
    expect(convertedGbpToEur?.rate).toBeCloseTo(1.2477, 2);
    expect(convertedGbpToEur?.convertedMin).toBe(124.77);
    expect(convertedGbpToEur?.formattedTarget).toBe('€124.77');

    // Test Target = JPY (0-decimal currency)
    const convertedUsdToJpy = convertPriceRange('$10', 'JPY', pivotTable);
    expect(convertedUsdToJpy?.sourceCurrency).toBe('USD');
    expect(convertedUsdToJpy?.targetCurrency).toBe('JPY');
    expect(convertedUsdToJpy?.convertedMin).toBe(1493);
    expect(convertedUsdToJpy?.formattedTarget).toBe('¥1,493');

    // Test Target = SGD
    const convertedUsdToSgd = convertPriceRange('$100', 'SGD', pivotTable);
    expect(convertedUsdToSgd?.sourceCurrency).toBe('USD');
    expect(convertedUsdToSgd?.targetCurrency).toBe('SGD');
    expect(convertedUsdToSgd?.convertedMin).toBe(135.14);
    expect(convertedUsdToSgd?.formattedTarget).toBe('S$135.14');
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

describe('Geographic distance', () => {
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

describe('checkOpeningHoursCollision & checkDayScheduleCollisions', () => {
  it('detects day-of-week closed collision', () => {
    const col = checkOpeningHoursCollision('Monday: Closed', '2026-10-19'); // 2026-10-19 is Mon
    expect(col.isCollision).toBe(true);
    expect(col.reason).toContain('Closed');
  });

  it('detects preferred_window collision with open hours', () => {
    const nightCol = checkOpeningHoursCollision('09:00 - 17:00', '2026-10-20', 'night');
    expect(nightCol.isCollision).toBe(true);
    expect(nightCol.reason).toContain('傍晚/夜间不开放');

    const morningCol = checkOpeningHoursCollision('18:00 - 02:00', '2026-10-20', 'morning');
    expect(morningCol.isCollision).toBe(true);
    expect(morningCol.reason).toContain('上午不开放');

    const overnightNight = checkOpeningHoursCollision('18:00 - 02:00', '2026-10-20', 'night');
    expect(overnightNight.isCollision).toBe(false);

    const okCol = checkOpeningHoursCollision('09:00 - 22:00', '2026-10-20', 'afternoon');
    expect(okCol.isCollision).toBe(false);
  });

  it('detects day overload and long distance transit from Visit projections', () => {
    const p1 = scheduledPlace(place('p1', { duration_minutes: 360, coordinates: { lat: 35.6895, lng: 139.6917 } }), '2026-10-20', 0);
    const p2 = scheduledPlace(place('p2', { duration_minutes: 300, coordinates: { lat: 35.4437, lng: 139.6380 } }), '2026-10-20', 1);
    const summary = checkDayScheduleCollisions([p1, p2], '2026-10-20');
    expect(summary.hasCollision).toBe(true);
    expect(summary.isOverloaded).toBe(true);
    expect(summary.totalDurationMinutes).toBe(660);
    expect(summary.longTransits[0].distanceKm).toBeGreaterThan(20);
  });

});

describe('parseImportPayload', () => {
  it('parses JSON array of places', () => {
    const json = JSON.stringify([
      { title: 'Tokyo Tower', address: 'Minato, Tokyo', category: 'attraction', lat: 35.6586, lng: 139.7454 },
      { title: 'Tsukiji Outer Market', category: 'food', observed_price: '¥2,000' },
    ]);
    const places = parseImportPayload(json, 'trip-123');
    expect(places).toHaveLength(2);
    expect(places[0].title).toBe('Tokyo Tower');
    expect(places[0].trip_id).toBe('trip-123');
    expect(places[0].coordinates?.lat).toBe(35.6586);
    expect(places[1].title).toBe('Tsukiji Outer Market');
    expect(places[1].kind).toBe('food');
  });

  it('preserves comparable research facts from external JSON', () => {
    const json = JSON.stringify([{
      title: 'Bangkok Bistro',
      source_category: 'Thai restaurant',
      observed_review_count: 1280,
      observed_price: '฿400–600 per person',
      price_currency: 'THB',
    }]);
    const [place] = parseImportPayload(json, 'trip-123');
    expect(place.source_category).toBe('Thai restaurant');
    expect(place.observed_review_count).toBe(1280);
    expect(place.price_currency).toBe('THB');
    expect(place.price_min).toBe(400);
    expect(place.price_max).toBe(600);
    expect(place.price_unit).toBe('person');
  });

  it('parses KML placemarks', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
    <kml xmlns="http://www.opengis.net/kml/2.2">
      <Document>
        <Placemark>
          <name>1. Fushimi Inari Shrine</name>
          <description>Iconic torii gates</description>
          <address>Kyoto, Japan</address>
          <coordinates>135.7727,34.9671,0</coordinates>
        </Placemark>
      </Document>
    </kml>`;
    const places = parseImportPayload(kml, 'trip-123');
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe('Fushimi Inari Shrine');
    expect(places[0].coordinates?.lat).toBe(34.9671);
    expect(places[0].coordinates?.lng).toBe(135.7727);
  });

  it('parses CSV rows', () => {
    const csv = `Title,Kind,Rating,Price,Address\n"Ichiran Ramen",food,4.5,"¥1,200","Shinjuku, Tokyo"`;
    const places = parseImportPayload(csv, 'trip-123');
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe('Ichiran Ramen');
    expect(places[0].kind).toBe('food');
    expect(places[0].observed_price).toBe('¥1,200');
    expect(places[0].observed_rating).toBe(4.5);
  });

  it('parses line-by-line text and Google Maps URLs', () => {
    const text = `
    - Senso-ji Temple
    https://maps.google.com/?q=Tokyo+Skytree&ll=35.7100,139.8107
    * Roppongi Hills
    `;
    const places = parseImportPayload(text, 'trip-123');
    expect(places).toHaveLength(3);
    expect(places[0].title).toBe('Senso-ji Temple');
    expect(places[1].source_url).toContain('maps.google.com');
    expect(places[2].title).toBe('Roppongi Hills');
  });
});

describe('parsePlaceExpenseEstimate', () => {
  it('extracts amount, currency, and category from place observed_price', () => {
    const p1 = place('p1', {
      title: 'Grand Hotel Tokyo',
      kind: 'stay',
      observed_price: '¥25,000/晚',
    });
    const est1 = parsePlaceExpenseEstimate(p1, 'JPY');
    expect(est1).not.toBeNull();
    expect(est1?.amount).toBe(25000);
    expect(est1?.currency).toBe('JPY');
    expect(est1?.category).toBe('stay');

    const p2 = place('p2', {
      title: 'Museum Entry',
      kind: 'attraction',
      observed_price: '$35.50',
    });
    const est2 = parsePlaceExpenseEstimate(p2, 'USD');
    expect(est2?.amount).toBe(35.5);
    expect(est2?.currency).toBe('USD');
    expect(est2?.category).toBe('ticket');

    const p3 = place('p3', {
      title: 'Bangkok Dinner',
      kind: 'food',
      observed_price: '฿400–600 per person',
      price_currency: 'THB',
      price_min: 400,
      price_max: 600,
      price_unit: 'person',
    });
    const est3 = parsePlaceExpenseEstimate(p3, 'CNY');
    expect(est3?.amount).toBe(500);
    expect(est3?.minAmount).toBe(400);
    expect(est3?.maxAmount).toBe(600);
    expect(est3?.currency).toBe('THB');
    expect(est3?.unit).toBe('person');
  });

  it('returns null if observed_price has no valid number', () => {
    const p = place('p3', {
      title: 'Park Walk',
      observed_price: 'Free admission',
    });
    expect(parsePlaceExpenseEstimate(p)).toBeNull();
  });
});

describe('exportTripToMarkdown', () => {
  it('generates structured itinerary markdown', () => {
    const trip: PlannerTrip = {
      schema_version: '0.1',
      type: 'trip',
      id: 'trip-1',
      title: 'Tokyo 2026',
      status: 'planning',
      start_date: '2026-10-20',
      end_date: '2026-10-21',
      destinations: ['Tokyo'],
      currency: 'JPY',
      members: ['Alice', 'Bob'],
      fx_rates: { USD: 150 },
      created_at: '2026-08-01',
    };
    const places: PlannerTripPlace[] = [
      place('p1', { title: 'Shibuya Crossing', kind: 'attraction' }),
      place('p2', {
        title: 'Akihabara',
        kind: 'shopping',
        state: 'candidate',
      }),
    ];
    const expenses: TripExpenseItem[] = [
      {
        id: 'e1',
        trip_id: 'trip-1',
        title: 'Train Pass',
        category: 'transit',
        amount: 3000,
        currency: 'JPY',
        paid_by: 'Alice',
        split_members: ['Alice', 'Bob'],
        created_at: '2026-10-20',
      },
    ];

    expenses.push({
      id: 'e2',
      trip_id: 'trip-1',
      title: 'Museum',
      category: 'ticket',
      amount: 10,
      currency: 'USD',
      paid_by: 'Bob',
      split_members: ['Alice', 'Bob'],
      created_at: '2026-10-20',
    });

    const scheduled = [scheduledPlace(places[0], '2026-10-20', 0)];
    const md = exportTripToMarkdown(trip, places, scheduled, expenses, 'zh');
    expect(md).toContain('# ✈️ Tokyo 2026');
    expect(md).toContain('Day 1 (2026-10-20)');
    expect(md).toContain('Shibuya Crossing');
    expect(md).toContain('待选研究灵感池');
    expect(md).toContain('Akihabara');
    expect(md).toContain('费用账本汇总');
    expect(md).toContain('Train Pass');
    expect(md).toContain('已折算总额');
    expect(md).toContain('¥4500 JPY');
  });
});