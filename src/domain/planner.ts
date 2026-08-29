export type PlannerTripStatus = 'planning' | 'active' | 'completed';
export type PlannerPlaceState = 'candidate' | 'scheduled' | 'done' | 'dropped';
export type PlannerPlacePriority = 'must' | 'want' | 'optional';
export type PlannerReservationStatus = 'none' | 'needed' | 'booked';
export type PlannerPriceUnit = 'person' | 'night' | 'item' | 'level' | 'unknown';
export type PlannerPlaceKind =
  | 'attraction'
  | 'food'
  | 'cafe'
  | 'stay'
  | 'shopping'
  | 'transit'
  | 'experience'
  | 'other';

export interface PlannerTrip {
  schema_version: '0.1';
  type: 'trip';
  id: string;
  title: string;
  status: PlannerTripStatus;
  start_date: string;
  end_date: string;
  destinations: string[];
  tags?: string[];
  saved_list_name?: string;
  currency?: string;
  transport_mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  travel_preferences?: string[];
  /** AA ledger participants, persisted so the ledger survives browsers/devices. */
  members?: string[];
  /** User-verified conversion overrides: fx_rates[FROM] = how many trip-currency per 1 FROM. */
  fx_rates?: Record<string, number>;
  created_at: string;
  updated_at?: string;
}

export type PlannerPlaceSourceProvider =
  | 'google_maps'
  | 'tabelog'
  | 'xiaohongshu'
  | 'booking'
  | 'other';

export interface PlannerTripPlace {
  schema_version: '0.1';
  type: 'trip_place';
  id: string;
  trip_id: string;
  title: string;
  source_provider: PlannerPlaceSourceProvider;
  source_url: string;
  source_place_id?: string;
  kind: PlannerPlaceKind;
  area?: string;
  priority?: PlannerPlacePriority;
  tags: string[];
  why?: string;
  signals: string[];
  risks: string[];
  notes?: string;
  /** Raw source facts retained at full fidelity for downstream comparison. */
  source_category?: string;
  observed_rating?: number;
  observed_review_count?: number;
  observed_price?: string;
  price_currency?: string;
  price_min?: number;
  price_max?: number;
  price_unit?: PlannerPriceUnit;
  price_level?: number;
  observed_at?: string;
  preferred_window?: string;
  duration_minutes?: number;
  open_hours?: string;
  is_anchor?: boolean;
  anchor_type?: 'flight' | 'stay_checkin' | 'stay_checkout' | 'transit' | 'reservation';
  address?: string;
  coordinates?: { lat: number; lng: number };
  reservation_status: PlannerReservationStatus;
  state: PlannerPlaceState;
  scheduled_date?: string;
  sort_order?: number;
  locked?: boolean;
  /** Contact & structured extras captured from Google Maps. */
  phone?: string;
  plus_code?: string;
  menu_url?: string;
  reservation_url?: string;
  review_topics?: string[];
  /** Google taxonomy types, e.g. ["lodging","restaurant","tourist_attraction"]. */
  types?: string[];
  created_at: string;
  updated_at?: string;
}

export interface CaptureContext {
  tripId: string;
  title: string;
  currency?: string;
  tags?: string[];
}

export interface OwnlyCaptureState {
  version: 2;
  activeContext: CaptureContext | null;
  pendingPlaces: PlannerTripPlace[];
}

export const EMPTY_CAPTURE_STATE: OwnlyCaptureState = {
  version: 2,
  activeContext: null,
  pendingPlaces: [],
};

export function acknowledgeCapturedPlaces(state: OwnlyCaptureState, placeIds: string[]): OwnlyCaptureState {
  const ids = new Set(placeIds);
  return { ...state, pendingPlaces: state.pendingPlaces.filter((place) => !ids.has(place.id)) };
}

export function asCaptureCandidate(place: PlannerTripPlace): PlannerTripPlace {
  return {
    ...place,
    reservation_status: place.reservation_status ?? 'none',
    state: 'candidate',
    scheduled_date: undefined,
    sort_order: undefined,
    locked: undefined,
  };
}

/**
 * Merge a panel snapshot with the freshest inbox. The background worker owns
 * activeContext; the panel only edits pending candidates. Tombstones prevent a
 * concurrent quick-capture merge from resurrecting a user deletion.
 */
export function mergeCaptureState(
  fresh: OwnlyCaptureState,
  local: OwnlyCaptureState,
  locallyDeletedIds?: ReadonlySet<string>,
): OwnlyCaptureState {
  const tombstones = locallyDeletedIds;
  const localPlaces = (tombstones
    ? local.pendingPlaces.filter((place) => !tombstones.has(place.id))
    : local.pendingPlaces).map(asCaptureCandidate);
  const localPlaceIds = new Set(localPlaces.map((place) => place.id));
  const backgroundOnly = fresh.pendingPlaces.filter(
    (place) => !localPlaceIds.has(place.id) && !(tombstones && tombstones.has(place.id)),
  );
  return {
    version: 2,
    activeContext: fresh.activeContext,
    pendingPlaces: [...localPlaces, ...backgroundOnly],
  };
}

/**
 * Reorders a visible subset of places (e.g. the filtered candidate pool) while
 * keeping every hidden entry pinned to its original slot.
 */
export function reorderPendingPlaces(
  pendingPlaces: PlannerTripPlace[],
  orderedVisibleIds: string[],
): PlannerTripPlace[] {
  const visibleIds = orderedVisibleIds.filter((id) => pendingPlaces.some((p) => p.id === id));
  if (visibleIds.length === 0) return [...pendingPlaces];
  const slots: number[] = [];
  pendingPlaces.forEach((place, index) => {
    if (visibleIds.includes(place.id)) slots.push(index);
  });
  const next = [...pendingPlaces];
  visibleIds.forEach((id, i) => {
    const source = pendingPlaces.find((p) => p.id === id)!;
    next[slots[i]] = source;
  });
  return next;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date;
}

function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function listTripDates(startDate: string, endDate: string, maxDays = 90): string[] {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const result: string[] = [];
  const cursor = new Date(start.getTime());
  while (cursor.getTime() <= end.getTime() && result.length < maxDays) {
    result.push(formatDateOnly(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function sortPlannerPlaces(places: PlannerTripPlace[]): PlannerTripPlace[] {
  return [...places].sort((left, right) => {
    const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.title.localeCompare(right.title);
  });
}

export function mergeCapturedPlaceResearch(
  existing: PlannerTripPlace,
  captured: PlannerTripPlace,
): PlannerTripPlace {
  const mergedTypes = new Set<string>([...(captured.types ?? []), ...(existing.types ?? [])]);
  const hasContent = (val?: string | null): boolean => typeof val === 'string' && val.trim().length > 0;

  return {
    ...existing,
    id: existing.id,
    title: hasContent(captured.title) ? captured.title : existing.title,
    source_provider: captured.source_provider ?? existing.source_provider,
    source_url: captured.source_url ?? existing.source_url,
    source_place_id: captured.source_place_id ?? existing.source_place_id,

    // Planner-owned decisions intentionally stay on the canonical record:
    kind: existing.kind,
    area: existing.area,
    priority: existing.priority,
    tags: existing.tags,
    why: existing.why,
    signals: existing.signals,
    risks: existing.risks,
    notes: existing.notes,
    preferred_window: existing.preferred_window,
    duration_minutes: existing.duration_minutes,

    // Capture may refresh observed/source facts:
    source_category: hasContent(captured.source_category) ? captured.source_category : existing.source_category,
    observed_rating: (typeof captured.observed_rating === 'number' && Number.isFinite(captured.observed_rating))
      ? captured.observed_rating
      : existing.observed_rating,
    observed_review_count: (typeof captured.observed_review_count === 'number' && Number.isFinite(captured.observed_review_count))
      ? captured.observed_review_count
      : existing.observed_review_count,
    observed_price: hasContent(captured.observed_price) ? captured.observed_price : existing.observed_price,
    price_currency: hasContent(captured.price_currency) ? captured.price_currency : existing.price_currency,
    price_min: (typeof captured.price_min === 'number' && Number.isFinite(captured.price_min)) ? captured.price_min : existing.price_min,
    price_max: (typeof captured.price_max === 'number' && Number.isFinite(captured.price_max)) ? captured.price_max : existing.price_max,
    price_unit: captured.price_unit ?? existing.price_unit,
    price_level: (typeof captured.price_level === 'number' && Number.isFinite(captured.price_level)) ? captured.price_level : existing.price_level,
    observed_at: hasContent(captured.observed_at) ? captured.observed_at : existing.observed_at,
    address: hasContent(captured.address) ? captured.address : existing.address,
    coordinates: captured.coordinates ?? existing.coordinates,
    open_hours: hasContent(captured.open_hours) ? captured.open_hours : existing.open_hours,
    phone: hasContent(captured.phone) ? captured.phone : existing.phone,
    plus_code: hasContent(captured.plus_code) ? captured.plus_code : existing.plus_code,
    menu_url: hasContent(captured.menu_url) ? captured.menu_url : existing.menu_url,
    reservation_url: hasContent(captured.reservation_url) ? captured.reservation_url : existing.reservation_url,
    review_topics: (captured.review_topics && captured.review_topics.length > 0) ? captured.review_topics : existing.review_topics,
    types: mergedTypes.size > 0 ? [...mergedTypes] : undefined,
    updated_at: captured.updated_at || new Date().toISOString(),
  };
}

function canonicalizePlaceName(value: string): string {
  return value.replace(/\+/g, ' ').trim().toLowerCase();
}

function roundedCoordinateIdentity(coordinates?: { lat: number; lng: number }): string | null {
  if (!coordinates) return null;
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) return null;
  return `${coordinates.lat.toFixed(5)},${coordinates.lng.toFixed(5)}`;
}

export function normalizePlaceIdentity(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    const isGoogleMaps = host === 'maps.google.com' || /(^|\.)google\.[a-z.]{2,}$/.test(host);
    if (isGoogleMaps) {
      const explicitPlaceId = parsed.searchParams.get('query_place_id') || parsed.searchParams.get('cid');
      if (explicitPlaceId) return `g:pid:${explicitPlaceId.toLowerCase()}`;

      const placeMatch = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
      let placeName = '';
      if (placeMatch?.[1]) {
        try { placeName = decodeURIComponent(placeMatch[1]); } catch { placeName = placeMatch[1]; }
      }
      const coordinateMatch = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(`${parsed.pathname}${parsed.hash}`);
      if (coordinateMatch) {
        const lat = Number(coordinateMatch[1]);
        const lng = Number(coordinateMatch[2]);
        const geo = roundedCoordinateIdentity({ lat, lng });
        if (geo) return `g:${canonicalizePlaceName(placeName || 'place')}@${geo}`;
      }

      const query = parsed.searchParams.get('query') || parsed.searchParams.get('q');
      if (query) return `g:name:${canonicalizePlaceName(query)}`;
      if (placeName) return `g:name:${canonicalizePlaceName(placeName)}`;
    }
    parsed.hash = '';
    return `u:${parsed.hostname.toLowerCase()}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {}
  return `u:${trimmed.toLowerCase()}`;
}

export function placeIdentityKey(tripId: string, sourceUrl: string): string {
  return `${tripId}::${normalizePlaceIdentity(sourceUrl)}`;
}

export function findExistingTripPlace(
  places: PlannerTripPlace[],
  tripId: string,
  sourceUrl: string,
  sourcePlaceId?: string,
  coordinates?: { lat: number; lng: number },
): PlannerTripPlace | undefined {
  const tripPlaces = places.filter((place) => place.trip_id === tripId);

  if (sourcePlaceId) {
    const byPlaceId = tripPlaces.find((place) =>
      place.source_provider === inferSourceProvider(sourceUrl) && place.source_place_id === sourcePlaceId
    );
    if (byPlaceId) return byPlaceId;
  }

  const coordinateIdentity = roundedCoordinateIdentity(coordinates);
  if (coordinateIdentity) {
    const byCoordinates = tripPlaces.find((place) => roundedCoordinateIdentity(place.coordinates) === coordinateIdentity);
    if (byCoordinates) return byCoordinates;
  }

  const identity = normalizePlaceIdentity(sourceUrl);
  return tripPlaces.find((place) => normalizePlaceIdentity(place.source_url) === identity)
    ?? tripPlaces.find((place) => place.source_url === sourceUrl);
}

function escapeCdata(text: string): string {
  return text.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function getTripAreaCounts(places: PlannerTripPlace[]): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>();
  for (const place of places) {
    const area = place.area?.trim();
    if (!area) continue;
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((left, right) => right.count - left.count || left.area.localeCompare(right.area));
}

function directionsUrl(stops: PlannerTripPlace[], travelMode: PlannerTrip['transport_mode']): string {
  if (stops.length === 0) return '';
  if (stops.length === 1) {
    const query = encodeURIComponent(stops[0].title);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  const waypoints = stops.slice(1, -1).map((place) => place.title).join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: stops[0].title,
    destination: stops[stops.length - 1].title,
    travelmode: travelMode ?? 'transit',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsDirectionsSegments(
  places: PlannerTripPlace[],
  travelMode: PlannerTrip['transport_mode'] = 'transit',
): string[] {
  const scheduled = sortPlannerPlaces(places).filter((place) => place.state === 'scheduled');
  if (scheduled.length === 0) return [];
  if (scheduled.length <= 5) return [directionsUrl(scheduled, travelMode)];

  const segments: string[] = [];
  for (let index = 0; index < scheduled.length - 1; index += 4) {
    const slice = scheduled.slice(index, Math.min(index + 5, scheduled.length));
    if (slice.length >= 2) segments.push(directionsUrl(slice, travelMode));
  }
  return segments;
}

export function normalizeDelimitedText(value: string): string[] {
  return value
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export function inferPlaceKind(category?: string): PlannerPlaceKind {
  if (!category || !category.trim()) return 'attraction';
  const lower = category.toLowerCase();

  // 0. Special compound disambiguations:
  // e.g. "hotel restaurant", "hotel bar", "hotel cafe", "ski resort", "food court"
  if (/\b(?:hotel\s*restaurant|hotel\s*dining|hotel\s*bistro|hotel\s*bar|food\s*court|hawker\s*centre|hawker\s*center)\b|酒店餐厅|饭店餐厅|美食广场|大食代/i.test(lower)) {
    return 'food';
  }
  if (/\b(?:hotel\s*cafe|hotel\s*coffee|hotel\s*bakery|hotel\s*lounge)\b|酒店咖啡|酒店下午茶/i.test(lower)) {
    return 'cafe';
  }
  if (/\b(?:ski\s*resort|golf\s*resort|spa\s*resort)\b|滑雪场|滑雪度假村|温泉度假区/i.test(lower)) {
    return 'experience';
  }

  // 1. Cafes, Bakeries, Coffee, Dessert, Tea (Checked before general dining so coffee shops don't get swallowed into generic food)
  if (
    /\b(?:cafe|café|coffee|roastery|espresso|boba|bubble\s*tea|milk\s*tea|matcha|patisserie|pâtisserie|chocolatier|gelateria|gelato|waffle|pancake|crepe|crêpe|creperie|crêperie|tea\s*house|tea\s*room|tea\s*salon|salon\s*de\s*thé|dessert|bakery|boulangerie|ice\s*cream|pastry|donut|doughnut|bagel|juice\s*bar|smoothie|acai|arabica|starbucks|blue\s*bottle|doutor|komeda|tully'?s|luckin|cotti|manner|seesaw|heytea|nayuki|chagee|gong\s*cha|koi\s*th[eé]|mixue|châteraisé|chateraise|ladur[eé]e|pierre\s*herm[eé]|harbs|after\s*you)\b|คาเฟ่|กาแฟ|ชา|ขนม|เบเกอรี่|ไอศกรีม|ร้านกาแฟ|ชานม|ร้านเค้ก|カフェ|喫茶|喫茶店|コーヒー|珈琲|スイーツ|ベーカリー|ケーキ|洋菓子|和菓子|甘味処|茶屋|パン屋|咖啡|甜品|奶茶|面包|烘焙|茶室|茶馆|茶饮|冰淇淋|冰品|蛋糕|糕点|点心局|下午茶|糖水|糖水铺|饮品|咖啡馆|咖啡厅|手冲|烘焙坊|甜品店|星巴克|瑞幸|库迪|霸王茶姬|喜茶|奈雪|一点点|蜜雪冰城|茶颜悦色|古茗|茶百道|tiệm\s*cà\s*phê|quán\s*trà/i.test(lower)
  ) {
    return 'cafe';
  }

  // 2. Food, Dining, Restaurants, Bars, Street Food, Cuisines
  if (
    /\b(?:restaurant|cuisine|dining|food|kitchen|eatery|diner|ramen|sushi|izakaya|bar|pub|bistro|steak|steakhouse|grill|bbq|barbecue|noodle|noodles|buffet|tavern|pizzeria|pizza|burger|burgers|tacos|taqueria|taquería|trattoria|osteria|brasserie|cucina|seafood|hotpot|hot\s*pot|brunch|curry|tabelog|gastropub|brewery|microbrewery|yakitori|tempura|tonkatsu|shabu|shabu-shabu|udon|soba|dim\s*sum|dumpling|dumplings|tapas|bento|skewer|skewers|poke|ceviche|rotisserie|warung|kopitiam|hawker|canteen|chophouse|fondue|cantina|churrascaria|shawarma|kebab|falafel|pho|banh\s*mi|pad\s*thai|som\s*tum|tom\s*yum|sukiyaki|yakiniku|kaiseki|kappo|omakase|teppanyaki|robatayaki|chirashi|gyoza|bao|donburi|yakisoba|unagi|kushikatsu|bodega)\b|wine\s*bar|cocktail|cantonese|sichuan|thai\s*food|street\s*food|night\s*market\s*food|fine\s*dining|casual\s*dining|ethnic\s*cuisine|local\s*cuisine|regional\s*cuisine|ร้านอาหาร|อาหาร|ก๋วยเตี๋ยว|ข้าวมันไก่|ส้มตำ|บาร์|ข้าวซอย|ต้มยำ|ผัดไทย|หมูกระทะ|ชาบู|ปิ้งย่าง|อาหารไทย|ซีฟู้ด|ร้านเหล้า|ラーメン|焼肉|寿司|うどん|そば|天ぷら|割烹|食堂|定食|居酒屋|焼き鳥|焼鸟|鍋|懐石|会席|おでん|立ち飲み|中華|洋食|和食|海鮮|とんかつ|串カツ|すき焼き|しゃぶしゃぶ|鉄板焼|うなぎ|蕎麦|餐厅|餐馆|料理|美食|小吃|拉面|米线|面馆|火锅|烧烤|烤肉|酒吧|居酒屋|酒场|快餐|大排档|早茶|熟食|排档|海鲜|日料|韩料|泰餐|西餐|粤菜|川菜|湘菜|鲁菜|淮扬菜|浙菜|闽菜|徽菜|家常菜|烤鸭|刺身|烧鸟|铁板烧|串烧|居食屋|私房菜|茶餐厅|酒馆|饭店|宵夜|夜市美食|烧腊|汤包|生煎|抄手|串串|冒菜|烤鱼|肉骨茶|砂锅|大排挡|馄饨|饺子|卤味|烧鹅|鳗鱼饭|quán\s*ăn|nhà\s*hàng|quán\s*nhậu|restaurante|ristorante/i.test(lower)
  ) {
    return 'food';
  }

  // 3. Lodging & Stays (Hotels, Resorts, Villas, Hostels, Ryokans, Brands like IHG/Marriott/UHG, etc.)
  if (
    /\b(?:hotel|resort|hostel|inn|ryokan|stay|motel|poshtel|chalet|lodge|cabin|glamping|pension|aparthotel|minshuku|ihg|uhg|marriott|hilton|hyatt|accor|sheraton|kempinski|intercontinental|novotel|ibis|mercure|aman|capella|rosewood|anantara|fairmont|peninsula|pullman|sofitel|aloft|moxy|atour|hanting|ji\s*hotel|citadines|somerset|ascott|dusit|six\s*senses|belmond|outrigger|centara|centre\s*point|chatrium|sindhorn|salil|asai|the\s*quarter|quarter\s*hotel|holiday\s*inn|crowne\s*plaza|doubletree|waldorf\s*astoria|conrad|curio|canopy|tapestry|mgallery|swissotel|adagio|oakwood|pan\s*pacific|parkroyal|fraser|mandarin\s*oriental|shangri-la|four\s*seasons|ritz-carlton|st\.\s*regis|w\s*hotel|westin|radisson|banyan\s*tree|m[oö]venpick|le\s*m[eé]ridien|guesthouse|guest\s*house|lodging|accommodation|suites?|villas?|residence|homestay|serviced\s*apartment|b&b|bed\s*(&|and)\s*breakfast|capsule\s*hotel|love\s*hotel|machiya|hanok|riad|agriturismo|campground|rv\s*park)\b|โรงแรม|ที่พัก|รีสอร์ท|โฮสเทล|เกสต์เฮาส์|วิลล่า|บังกะโล|ม่านรูด|ホテル|旅館|民宿|宿|ペンション|ゲストハウス|カプセルホテル|湯宿|坊|酒店|旅馆|民宿|客栈|青旅|青年旅舍|度假村|度假酒店|温泉旅馆|公寓式酒店|星级酒店|精品酒店|宾馆|别馆|营地|庄园|驿站|招待所|万豪|希尔顿|凯悦|洲际|喜来登|香格里拉|四季酒店|丽思卡尔顿|瑞吉|文华东方|半岛酒店|悦榕庄|安纳塔拉|亚朵|全季|汉庭|如家|锦江之星|桔子酒店|khách\s*sạn|hôtel|albergue|posada|parador|pousada|albergo/i.test(lower)
  ) {
    return 'stay';
  }

  // 4. Shopping, Malls, Supermarkets, Markets, Boutiques
  if (
    /\b(?:store|mall|shopping\s*mall|shopping\s*center|shopping\s*centre|market|supermarket|bazaar|outlet|outlet\s*mall|plaza|boutique|grocer|grocery|vintage|thrift|department\s*store|gift\s*shop|souvenir|bookstore|book\s*shop|pharmacy|drugstore|convenience\s*store|duty\s*free|flea\s*market|night\s*market|weekend\s*market|emporium|galleria|arcade|retail|don\s*quijote|donki|matsumoto\s*kiyoshi|bic\s*camera|yodobashi|daiso|muji|uniqlo)\b|ตลาด|ห้าง|ซูเปอร์มาร์เก็ต|ตลาดนัด|ตลาดกลางคืน|ร้านค้า|ร้านขายยา|モール|ショッピング|百貨店|デパート|スーパー|市場|商店街|ドラッグストア|薬局|本屋|書店|免税店|ドン・キホーテ|マツモトキヨシ|アウトレット|ビッグカメラ|ヨドバシ|ダイソー|無印良品|ユニクロ|商场|购物中心|超市|购物|市场|百货|商店|奥特莱斯|免税店|便利店|书店|药妆|药妆店|药局|夜市|集市|市集|杂货|杂货店|商业街|专卖店|步行街|批发市场|堂吉诃德|唐吉诃德|松本清|大国药妆|无印良品|优衣库|文具店|杂物社|chợ|siêu\s*thị|tienda|mercado|centro\s*comercial|grand\s*magasin/i.test(lower)
  ) {
    return 'shopping';
  }

  // 5. Transit & Transportation
  if (
    /\b(?:station|subway|metro|train|railway|bus|bus\s*stop|bus\s*terminal|airport|terminal|ferry|transit|pier|port|tram|heliport|harbor|harbour|dock|cable\s*car|ropeway|funicular|monorail|interchange|jetty|depot)\b|สถานี|ท่าเรือ|สนามบิน|รถไฟฟ้า|สถานีรถไฟ|ป้ายรถเมล์|ขนส่ง|駅|地下鉄|空港|港|バスターミナル|乗り場|フェリー|ロープウェイ|ケーブルカー|车站|地铁|地铁站|机场|码头|火车站|公交|公交站|客运|缆车|中转|口岸|轮渡|渡轮|航站楼|站台|渡口|高铁站|轻轨|客运站|乘车点|bến\s*xe|nhà\s*ga|sân\s*bay|bến\s*tàu|gare|estación|aeroporto|stazione|flughafen/i.test(lower)
  ) {
    return 'transit';
  }

  // 6. Experience, Wellness, Sports, Activities
  if (
    /\b(?:spa|massage|onsen|sauna|wellness|foot\s*massage|thai\s*massage|diving|scuba|snorkeling|ski|skiing|snowboard|surfing|climbing|bouldering|hiking|trekking|rafting|karting|go-kart|safari|workshop|class|cooking\s*class|pottery|tour|boat\s*tour|cruise|dinner\s*cruise|kayak|kayaking|canoeing|paragliding|zipline|skydive|skydiving|bungee|bowling|golf|gym|fitness|yoga|camp|camping|experience|activity|hot\s*spring|bathhouse|sento|jimjilbang|amusement\s*park|theme\s*park|water\s*park|escape\s*room|board\s*game|shooting\s*range|archery|horse\s*riding|atv|quad\s*bike|disney|disneyland|disneysea|universal\s*studios|usj|warner\s*bros|legoland|fuji-q|lotte\s*world|everland)\b|สปา|นวด|นวดแผนไทย|ออนเซ็น|ดำน้ำ|กิจกรรม|สวนสนุก|สวนน้ำ|温泉|銭湯|露天風呂|スパ|マッサージ|サウナ|体験|スキー|ダイビング|ツアー|遊園地|アクティビティ|教室|体验|活动|按摩|水疗|温泉|足浴|足疗|泰式按摩|盲人按摩|日归温泉|钱汤|汗蒸|潜水|冲浪|滑雪|徒步|漂流|游乐园|主题公园|水上乐园|工坊|课程|手作|烹饪课|陶艺|卡丁车|密室|密室逃脱|剧本杀|游船|跳伞|滑翔伞|热气球|射击|骑马|越野|丛林飞跃|蹦极|高尔夫|健身|瑜伽|采摘|研学|迪士尼|环球影城|乐高乐园|富士急|bains\s*thermaux|balneario/i.test(lower)
  ) {
    return 'experience';
  }

  // 7. Attractions, Sightseeing, Heritage, Culture, Nature
  if (
    /\b(?:museum|temple|shrine|church|cathedral|mosque|synagogue|pagoda|monastery|wat|park|national\s*park|attraction|tourist\s*attraction|monument|landmark|castle|palace|imperial\s*palace|royal\s*palace|garden|botanical\s*garden|tower|tourist|historic|historical|heritage|unesco|ruins|gallery|art\s*gallery|beach|viewpoint|lookout|observatory|observation\s*deck|skydeck|waterfall|island|lake|mountain|peak|canyon|gorge|cave|plaza|square|scenic|statue|bridge|zoo|safari\s*park|aquarium|botanical|sanctuary|nature\s*reserve|historic\s*site|old\s*town|ancient\s*town)\b|วัด|พิพิธภัณฑ์|พระราชวัง|สวน|สวนสาธารณะ|อุทยานแห่งชาติ|หาด|ภูเขา|น้ำตก|จุดชมวิว|ปราสาท|โบราณสถาน|寺院|神社|城|庭園|公園|展望台|滝|島|湖|山|渓谷|水族館|動物園|美術館|博物館|名所|史跡|旧跡|鳥居|天守|景点|景区|寺|寺庙|庙|禅寺|神社|鸟居|教堂|大教堂|博物馆|纪念馆|展览馆|公园|国立公园|国家公园|观光|古迹|遗址|城堡|城址|天守阁|皇宫|宫殿|行宫|塔|电视塔|钟楼|鼓楼|美术馆|艺术馆|沙滩|海滩|海湾|观景台|展望台|天空之镜|瀑布|岛|海岛|湖|湖泊|山|峡谷|地标|广场|风景区|动物园|水族馆|植物园|大桥|胜地|故居|陵园|古镇|老街|古城|名胜|chùa|đền|bảo\s*tàng|công\s*viên|bãi\s*biển|thác\s*nước|château|musée|cathédrale|plage|mirador|palazzo|duomo|monument/i.test(lower)
  ) {
    return 'attraction';
  }

  // Default to attraction for unclassified POIs
  return 'attraction';
}

export function inferSourceProvider(url: string): PlannerPlaceSourceProvider {
  if (/google\.[a-z.]+\/maps|maps\.google\./i.test(url)) return 'google_maps';
  if (/tabelog\.com/i.test(url)) return 'tabelog';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xiaohongshu';
  if (/booking\.com/i.test(url)) return 'booking';
  return 'other';
}

export function checkOpeningHoursCollision(
  openHours?: string,
  scheduledDate?: string,
  preferredWindow?: string,
): { isCollision: boolean; reason?: string } {
  if (!openHours) return { isCollision: false };

  // 1. Day of week collision
  if (scheduledDate) {
    const date = parseDateOnly(scheduledDate);
    if (date) {
      const dayIndex = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
      const dayNamesEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayNamesZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

      const currentDayEn = dayNamesEn[dayIndex];
      const currentDayZh = dayNamesZh[dayIndex];
      const lowerHours = openHours.toLowerCase();

      const isMonClosed = dayIndex === 1 && (/mon(day)?:\s*(closed|休)|周一(闭馆|休息|休)|星期一(闭馆|休息|休)|定休日[：:]?\s*月/i.test(lowerHours));
      const isTueClosed = dayIndex === 2 && (/tue(sday)?:\s*(closed|休)|周二(闭馆|休息|休)|星期二(闭馆|休息|休)|定休日[：:]?\s*火/i.test(lowerHours));
      const isWedClosed = dayIndex === 3 && (/wed(nesday)?:\s*(closed|休)|周三(闭馆|休息|休)|星期三(闭馆|休息|休)|定休日[：:]?\s*水/i.test(lowerHours));
      const isThuClosed = dayIndex === 4 && (/thu(rsday)?:\s*(closed|休)|周四(闭馆|休息|休)|星期四(闭馆|休息|休)|定休日[：:]?\s*木/i.test(lowerHours));
      const isFriClosed = dayIndex === 5 && (/fri(day)?:\s*(closed|休)|周五(闭馆|休息|休)|星期五(闭馆|休息|休)|定休日[：:]?\s*金/i.test(lowerHours));
      const isSatClosed = dayIndex === 6 && (/sat(urday)?:\s*(closed|休)|周六(闭馆|休息|休)|星期六(闭馆|休息|休)|定休日[：:]?\s*土/i.test(lowerHours));
      const isSunClosed = dayIndex === 0 && (/sun(day)?:\s*(closed|休)|周日(闭馆|休息|休)|星期日(闭馆|休息|休)|定休日[：:]?\s*日/i.test(lowerHours));

      if (isMonClosed || isTueClosed || isWedClosed || isThuClosed || isFriClosed || isSatClosed || isSunClosed) {
        return {
          isCollision: true,
          reason: `${currentDayZh}通常休息 (${currentDayEn} Closed)`,
        };
      }
    }
  }

  // 2. Preferred window vs Open Hours time conflict
  if (preferredWindow) {
    const lowerWindow = preferredWindow.toLowerCase().trim();
    const lowerHours = openHours.toLowerCase();

    // Check evening/night window collision when hours indicate closing early (<= 17:30)
    if (lowerWindow === 'night' || lowerWindow === 'evening' || /晚上|夜间|傍晚/.test(lowerWindow)) {
      const closingMatch = /(?:~|-|至|到)\s*(0?\d|1[0-7]):([0-5]\d)/.exec(lowerHours);
      if (closingMatch && !/(?:2[0-4]|1[8-9]):[0-5]\d/.test(lowerHours) && !/24小时|24\s*hours/i.test(lowerHours)) {
        return {
          isCollision: true,
          reason: `地点约 ${closingMatch[1]}:${closingMatch[2]} 闭馆，傍晚/夜间不开放`,
        };
      }
    }

    // Check morning window collision when hours indicate opening late (>= 16:00)
    if (lowerWindow === 'morning' || /上午|早晨/.test(lowerWindow)) {
      const openingMatch = /(?:从|open|营业|:\s*)?\s*(1[6-9]|2[0-3]):([0-5]\d)\s*(?:~|-|至|到)/.exec(lowerHours);
      if (openingMatch && !/24小时|24\s*hours/i.test(lowerHours)) {
        return {
          isCollision: true,
          reason: `地点约 ${openingMatch[1]}:${openingMatch[2]} 开始营业，上午不开放`,
        };
      }
    }
  }

  return { isCollision: false };
}

export interface DayScheduleCollisionSummary {
  hasCollision: boolean;
  placeCollisions: Record<string, { isCollision: boolean; reason?: string }>;
  totalDurationMinutes: number;
  isOverloaded: boolean;
  overloadReason?: string;
  longTransits: Array<{ fromTitle: string; toTitle: string; distanceKm: number; warning: string }>;
}

export function checkDayScheduleCollisions(
  places: PlannerTripPlace[],
  date: string,
): DayScheduleCollisionSummary {
  const scheduled = sortPlannerPlaces(places).filter((p) => p.scheduled_date === date && p.state === 'scheduled');
  const placeCollisions: Record<string, { isCollision: boolean; reason?: string }> = {};
  let hasCollision = false;
  let totalDurationMinutes = 0;

  scheduled.forEach((p) => {
    const col = checkOpeningHoursCollision(p.open_hours, date, p.preferred_window);
    if (col.isCollision) {
      placeCollisions[p.id] = col;
      hasCollision = true;
    }
    totalDurationMinutes += p.duration_minutes || 60;
  });

  const isOverloaded = totalDurationMinutes > 600; // > 10 hours
  const overloadReason = isOverloaded
    ? `单日预估活动耗时约 ${(totalDurationMinutes / 60).toFixed(1)} 小时，日程可能过紧`
    : undefined;
  if (isOverloaded) hasCollision = true;

  const longTransits: Array<{ fromTitle: string; toTitle: string; distanceKm: number; warning: string }> = [];
  for (let i = 0; i < scheduled.length - 1; i++) {
    const c1 = extractPlaceCoordinates(scheduled[i]);
    const c2 = extractPlaceCoordinates(scheduled[i + 1]);
    if (c1 && c2) {
      const dist = haversineDistanceKm(c1, c2);
      if (dist > 20) {
        longTransits.push({
          fromTitle: scheduled[i].title,
          toTitle: scheduled[i + 1].title,
          distanceKm: dist,
          warning: `跨区移动距离较远 (${dist.toFixed(1)} km)，建议合理安排交通`,
        });
        hasCollision = true;
      }
    }
  }

  return {
    hasCollision,
    placeCollisions,
    totalDurationMinutes,
    isOverloaded,
    overloadReason,
    longTransits,
  };
}

export function buildGoogleMapsRouteUrl(
  stops: PlannerTripPlace[],
  travelMode: PlannerTrip['transport_mode'] = 'transit',
): string {
  if (stops.length === 0) return '';
  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0].address || stops[0].title)}`;
  }
  const origin = encodeURIComponent(stops[0].address || stops[0].title);
  const destination = encodeURIComponent(stops[stops.length - 1].address || stops[stops.length - 1].title);
  const waypoints = stops.slice(1, -1).map((p) => encodeURIComponent(p.address || p.title)).join('|');

  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${travelMode}`;
  if (waypoints) {
    url += `&waypoints=${waypoints}`;
  }
  return url;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function exportPlacesToKML(tripTitle: string, dateOrDay: string, places: PlannerTripPlace[]): string {
  const placemarks = places.map((place, index) => {
    const description = escapeCdata(`
        <p><b>类别:</b> ${escapeXml(place.kind)}</p>
        ${place.observed_rating ? `<p><b>评分:</b> ★ ${place.observed_rating}</p>` : ''}
        ${place.observed_price ? `<p><b>人均:</b> ${escapeXml(place.observed_price)}</p>` : ''}
        ${place.why ? `<p><b>理由:</b> ${escapeXml(place.why)}</p>` : ''}
        ${place.notes ? `<p><b>备注:</b> ${escapeXml(place.notes)}</p>` : ''}
        ${place.address ? `<p><b>地址:</b> ${escapeXml(place.address)}</p>` : ''}
        ${place.phone ? `<p><b>电话:</b> ${escapeXml(place.phone)}</p>` : ''}
        ${place.plus_code ? `<p><b>Plus Code:</b> ${escapeXml(place.plus_code)}</p>` : ''}
        ${place.menu_url ? `<p><b>菜单:</b> ${escapeXml(place.menu_url)}</p>` : ''}
        ${place.reservation_url ? `<p><b>预订:</b> ${escapeXml(place.reservation_url)}</p>` : ''}
        ${place.source_url ? `<p><a href="${escapeXml(place.source_url)}">Google Maps 链接</a></p>` : ''}
      `);
    return `
    <Placemark>
      <name>${index + 1}. ${escapeXml(place.title)}</name>
      <description><![CDATA[${description}]]></description>
      ${place.address ? `<address>${escapeXml(place.address)}</address>` : ''}
    </Placemark>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(tripTitle)} - ${escapeXml(dateOrDay)}</name>
    <description>Ownly Travel Planner Route Export</description>
    ${placemarks}
  </Document>
</kml>`;
}

export function exportPlacesToCSV(places: PlannerTripPlace[]): string {
  const headers = ['Order', 'Title', 'Kind', 'Rating', 'Price', 'Address', 'Why', 'Notes', 'Tags', 'Google_Maps_URL', 'Phone', 'Plus_Code', 'Menu_URL', 'Reservation_URL'];
  const cell = (value: string) => `"${csvSafeCell(value.replace(/"/g, '""'))}"`;
  const rows = places.map((p, i) => [
    i + 1,
    cell(p.title || ''),
    `"${p.kind}"`,
    p.observed_rating ?? '',
    cell(p.observed_price || ''),
    cell(p.address || ''),
    cell(p.why || ''),
    cell(p.notes || ''),
    cell((p.tags || []).join(';')),
    cell(p.source_url || ''),
    cell(p.phone || ''),
    cell(p.plus_code || ''),
    cell(p.menu_url || ''),
    cell(p.reservation_url || ''),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}

export type ResearchChipCategory = 'risk' | 'signal' | 'tag';

export interface ResearchChipDefinition {
  id: string;
  label: string;
  category: ResearchChipCategory;
}

const KNOWN_RISK_KEYWORDS = [
  'queue', 'rain', 'advance', 'cash', 'wait', 'busy', 'crowded', 'booking', 'reservation',
  '排队', '雨', '预约', '现金', '拥挤', '避雷', '避开', '不宜',
];

export function classifyResearchChip(chipText: string): ResearchChipCategory {
  const normalized = chipText.trim().toLowerCase();
  if (KNOWN_RISK_KEYWORDS.some((kw) => normalized.includes(kw))) {
    return 'risk';
  }
  return 'signal';
}

export const STANDARD_RESEARCH_CHIPS: Record<'zh' | 'en', ResearchChipDefinition[]> = {
  zh: [
    { id: 'must_go', label: '必去', category: 'signal' },
    { id: 'must_eat', label: '必吃', category: 'signal' },
    { id: 'need_queue', label: '需排队', category: 'risk' },
    { id: 'advise_booking', label: '建议预约', category: 'risk' },
    { id: 'night_view', label: '绝美夜景', category: 'signal' },
    { id: 'sunset_spot', label: '日落机位', category: 'signal' },
    { id: 'avoid_rain', label: '避开雨天', category: 'risk' },
    { id: 'convenient_transit', label: '交通便利', category: 'signal' },
    { id: 'cash_only', label: '只收现金', category: 'risk' },
    { id: 'quiet_cozy', label: '安静惬意', category: 'signal' },
  ],
  en: [
    { id: 'must_go', label: 'Must Go', category: 'signal' },
    { id: 'must_eat', label: 'Must Eat', category: 'signal' },
    { id: 'long_queue', label: 'Long Queue', category: 'risk' },
    { id: 'book_in_advance', label: 'Book in Advance', category: 'risk' },
    { id: 'scenic_view', label: 'Scenic View', category: 'signal' },
    { id: 'sunset_spot', label: 'Sunset Spot', category: 'signal' },
    { id: 'avoid_rainy_days', label: 'Avoid Rainy Days', category: 'risk' },
    { id: 'convenient_transit', label: 'Convenient Transit', category: 'signal' },
    { id: 'cash_only', label: 'Cash Only', category: 'risk' },
    { id: 'quiet_cozy', label: 'Quiet & Cozy', category: 'signal' },
  ],
};

export function extractPlaceCoordinates(
  place: Partial<PlannerTripPlace> | string | null | undefined,
): { lat: number; lng: number } | null {
  if (!place) return null;
  if (typeof place === 'object' && place.coordinates && Number.isFinite(place.coordinates.lat) && Number.isFinite(place.coordinates.lng)) {
    return { lat: place.coordinates.lat, lng: place.coordinates.lng };
  }

  const url = typeof place === 'string' ? place : place.source_url || '';
  if (!url) return null;

  // 1. @lat,lng e.g. @13.7437,100.4888 or @13.7437,100.4888,15z
  const atMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2. !3dlat!4dlng (Google Maps place data protobuf serialization)
  const dMatch = /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  if (dMatch) {
    const lat = parseFloat(dMatch[1]);
    const lng = parseFloat(dMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 3. query=lat,lng or q=lat,lng or ll=lat,lng
  const queryMatch = /[?&](?:query|q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

export function haversineDistanceKm(
  c1: { lat: number; lng: number },
  c2: { lat: number; lng: number },
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((c2.lat - c1.lat) * Math.PI) / 180;
  const dLng = ((c2.lng - c1.lng) * Math.PI) / 180;
  const lat1 = (c1.lat * Math.PI) / 180;
  const lat2 = (c2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const clampedA = Math.min(1, Math.max(0, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(Math.max(0, 1 - clampedA)));
  return Math.round(R * c * 100) / 100;
}

export function calculateTotalRouteDistanceKm(places: PlannerTripPlace[]): number {
  if (places.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < places.length - 1; i++) {
    const c1 = extractPlaceCoordinates(places[i]);
    const c2 = extractPlaceCoordinates(places[i + 1]);
    if (c1 && c2) {
      total += haversineDistanceKm(c1, c2);
    }
  }
  return Math.round(total * 100) / 100;
}

export interface RouteOptimizationResult {
  places: PlannerTripPlace[];
  originalKm: number;
  optimizedKm: number;
  savedKm: number;
  improved: boolean;
}

export interface RouteOptimizationOptions {
  fixStart?: boolean;
  fixEnd?: boolean;
  /** Treat locked:true and coordinate-less stops as immovable pins at their slots. */
  respectLocked?: boolean;
}

function buildPinnedOrder(base: PlannerTripPlace[], movableSlots: number[], movableItems: PlannerTripPlace[]): PlannerTripPlace[] {
  const next = [...base];
  movableSlots.forEach((slot, k) => {
    next[slot] = movableItems[k];
  });
  return next;
}

export function optimizeStopsSequence(
  places: PlannerTripPlace[],
  options: RouteOptimizationOptions = {},
): RouteOptimizationResult {
  const { fixStart = true, fixEnd = false, respectLocked = false } = options;
  const currentList = [...places];
  if (currentList.length <= 2) {
    const d = calculateTotalRouteDistanceKm(currentList);
    return { places: currentList.map((p, i) => ({ ...p, sort_order: i })), originalKm: d, optimizedKm: d, savedKm: 0, improved: false };
  }

  const originalKm = calculateTotalRouteDistanceKm(currentList);
  const validCoordsCount = currentList.filter((p) => extractPlaceCoordinates(p) !== null).length;
  if (validCoordsCount < 2) {
    return { places: currentList, originalKm, optimizedKm: originalKm, savedKm: 0, improved: false };
  }

  // Determine pinned vs movable positions. Pins keep their exact slot.
  // Stay anchors are schedule fixtures (check-in placeholders) — they must
  // never participate in reordering, regardless of options.
  const pinnedSlots = new Set<number>();
  currentList.forEach((p, i) => {
    if (!extractPlaceCoordinates(p)) pinnedSlots.add(i);
    else if (p.is_anchor) pinnedSlots.add(i);
    else if (respectLocked && p.locked) pinnedSlots.add(i);
  });
  // fixStart/fixEnd are independent of respectLocked: locking user-pinned
  // stops should not silently unlock the route endpoints.
  if (fixStart) pinnedSlots.add(0);
  if (fixEnd) pinnedSlots.add(currentList.length - 1);

  const movableSlots: number[] = [];
  const movableItems: PlannerTripPlace[] = [];
  currentList.forEach((p, i) => {
    if (!pinnedSlots.has(i)) {
      movableSlots.push(i);
      movableItems.push(p);
    }
  });

  let bestMovable = [...movableItems];
  let minDistance = calculateTotalRouteDistanceKm(buildPinnedOrder(currentList, movableSlots, bestMovable));
  const originalBest = minDistance;

  const m = movableItems.length;
  if (m >= 2) {
    if (m <= 8) {
      const permute = (arr: PlannerTripPlace[], l: number, r: number) => {
        if (l === r) {
          const dist = calculateTotalRouteDistanceKm(buildPinnedOrder(currentList, movableSlots, arr));
          if (dist < minDistance - 0.01) {
            minDistance = dist;
            bestMovable = [...arr];
          }
          return;
        }
        for (let i = l; i <= r; i++) {
          [arr[l], arr[i]] = [arr[i], arr[l]];
          permute(arr, l + 1, r);
          [arr[l], arr[i]] = [arr[i], arr[l]];
        }
      };
      permute([...bestMovable], 0, m - 1);
    } else {
      let current = [...bestMovable];
      let improved = true;
      let iterations = 0;
      while (improved && iterations < 60) {
        improved = false;
        iterations++;
        for (let i = 0; i < m - 1; i++) {
          for (let k = i + 1; k < m; k++) {
            const candidate = [
              ...current.slice(0, i),
              ...current.slice(i, k + 1).reverse(),
              ...current.slice(k + 1),
            ];
            const dist = calculateTotalRouteDistanceKm(buildPinnedOrder(currentList, movableSlots, candidate));
            if (dist < minDistance - 0.01) {
              minDistance = dist;
              bestMovable = candidate;
              current = candidate;
              improved = true;
            }
          }
        }
      }
    }
  }

  const optimizedKm = Math.round(minDistance * 100) / 100;
  const savedKm = Math.max(0, Math.round((originalBest - optimizedKm) * 100) / 100);

  const finalOrder = buildPinnedOrder(currentList, movableSlots, bestMovable);
  const resultPlaces = finalOrder.map((place, index) => ({
    ...place,
    sort_order: index,
  }));

  return {
    places: resultPlaces,
    originalKm,
    optimizedKm,
    savedKm,
    improved: savedKm > 0.05,
  };
}

export interface HotelProximityMetrics {
  hasCoordinates: boolean;
  avgDistanceKm: number;
  minDistanceKm: number;
  centerDistanceKm: number;
  closestPlaceTitle?: string;
}

export function calculateHotelProximity(
  hotel: PlannerTripPlace,
  scheduledPlaces: PlannerTripPlace[],
): HotelProximityMetrics {
  const hotelCoords = extractPlaceCoordinates(hotel);
  if (!hotelCoords) {
    return { hasCoordinates: false, avgDistanceKm: 0, minDistanceKm: 0, centerDistanceKm: 0 };
  }

  const validStops = scheduledPlaces
    .map((p) => ({ place: p, coords: extractPlaceCoordinates(p) }))
    .filter((item): item is { place: PlannerTripPlace; coords: { lat: number; lng: number } } => item.coords !== null && item.place.kind !== 'stay');

  if (validStops.length === 0) {
    return { hasCoordinates: true, avgDistanceKm: 0, minDistanceKm: 0, centerDistanceKm: 0 };
  }

  let totalDist = 0;
  let minDist = Infinity;
  let closestTitle = '';
  let sumLat = 0;
  let sumLng = 0;

  validStops.forEach(({ place, coords }) => {
    const d = haversineDistanceKm(hotelCoords, coords);
    totalDist += d;
    if (d < minDist) {
      minDist = d;
      closestTitle = place.title;
    }
    sumLat += coords.lat;
    sumLng += coords.lng;
  });

  const centerLat = sumLat / validStops.length;
  const centerLng = sumLng / validStops.length;
  const centerDist = haversineDistanceKm(hotelCoords, { lat: centerLat, lng: centerLng });

  return {
    hasCoordinates: true,
    avgDistanceKm: Math.round((totalDist / validStops.length) * 100) / 100,
    minDistanceKm: Math.round(minDist * 100) / 100,
    closestPlaceTitle: closestTitle,
    centerDistanceKm: centerDist,
  };
}

export interface MultiDayHotelProximityResult {
  hasCoordinates: boolean;
  combinedAvgKm: number;
  dayDetails: Array<{
    date: string;
    dayIndex: number;
    avgKm: number;
    centerKm: number;
    spotCount: number;
  }>;
}

export function calculateMultiDayHotelProximity(
  hotel: PlannerTripPlace,
  placesByDate: Record<string, PlannerTripPlace[]>,
  stayDates: string[],
): MultiDayHotelProximityResult {
  const hotelCoords = extractPlaceCoordinates(hotel);
  if (!hotelCoords) {
    return {
      hasCoordinates: false,
      combinedAvgKm: 0,
      dayDetails: stayDates.map((date, index) => ({
        date,
        dayIndex: index,
        avgKm: 0,
        centerKm: 0,
        spotCount: 0,
      })),
    };
  }

  let totalDistSum = 0;
  let totalValidSpots = 0;

  const dayDetails = stayDates.map((date, index) => {
    const dayPlaces = placesByDate[date] || [];
    const validSpots = dayPlaces
      .map((p) => ({ place: p, coords: extractPlaceCoordinates(p) }))
      .filter(
        (item): item is { place: PlannerTripPlace; coords: { lat: number; lng: number } } =>
          item.coords !== null && item.place.kind !== 'stay',
      );

    if (validSpots.length === 0) {
      return {
        date,
        dayIndex: index,
        avgKm: 0,
        centerKm: 0,
        spotCount: 0,
      };
    }

    let dayDist = 0;
    let sumLat = 0;
    let sumLng = 0;

    validSpots.forEach(({ coords }) => {
      const d = haversineDistanceKm(hotelCoords, coords);
      dayDist += d;
      sumLat += coords.lat;
      sumLng += coords.lng;
    });

    totalDistSum += dayDist;
    totalValidSpots += validSpots.length;

    const centerLat = sumLat / validSpots.length;
    const centerLng = sumLng / validSpots.length;
    const centerDist = haversineDistanceKm(hotelCoords, { lat: centerLat, lng: centerLng });

    return {
      date,
      dayIndex: index,
      avgKm: Math.round((dayDist / validSpots.length) * 10) / 10,
      centerKm: Math.round(centerDist * 10) / 10,
      spotCount: validSpots.length,
    };
  });

  const combinedAvgKm =
    totalValidSpots > 0 ? Math.round((totalDistSum / totalValidSpots) * 10) / 10 : 0;

  return {
    hasCoordinates: true,
    combinedAvgKm,
    dayDetails,
  };
}

export function generateStaySpanPlaces(
  hotel: PlannerTripPlace,
  stayDates: string[],
): PlannerTripPlace[] {
  return stayDates.map((date, index) => ({
    ...hotel,
    id: index === 0 ? hotel.id : `${hotel.id}__stay_${date}`,
    state: 'scheduled' as const,
    scheduled_date: date,
    is_anchor: true,
    anchor_type: 'stay_checkin' as const,
    locked: true,
    sort_order: 0,
    updated_at: new Date().toISOString(),
  }));
}

export interface DayHotelTransferInfo {
  date: string;
  dayIndex: number;
  isTransferDay: boolean;
  checkoutHotel?: PlannerTripPlace;
  checkinHotel?: PlannerTripPlace;
  stayHotel?: PlannerTripPlace;
  stayNightIndex?: number;
  totalStayNights?: number;
}

export function detectHotelTransferDays(
  tripPlaces: PlannerTripPlace[],
  tripDates: string[],
): Record<string, DayHotelTransferInfo> {
  const result: Record<string, DayHotelTransferInfo> = {};
  if (tripDates.length === 0) return result;

  const stayByDate: Record<string, PlannerTripPlace | undefined> = {};
  tripDates.forEach((date) => {
    const stays = tripPlaces.filter(
      (p) =>
        p.state === 'scheduled' &&
        p.scheduled_date === date &&
        (p.kind === 'stay' || (p.is_anchor && p.anchor_type === 'stay_checkin')),
    );
    stayByDate[date] = stays[0];
  });

  tripDates.forEach((date, index) => {
    const todayStay = stayByDate[date];
    const prevDate = index > 0 ? tripDates[index - 1] : null;
    const prevStay = prevDate ? stayByDate[prevDate] : null;

    if (
      prevStay &&
      todayStay &&
      normalizePlaceIdentity(prevStay.source_url || prevStay.title) !==
        normalizePlaceIdentity(todayStay.source_url || todayStay.title)
    ) {
      const baseId = normalizePlaceIdentity(todayStay.source_url || todayStay.title);
      let end = index;
      while (
        end < tripDates.length - 1 &&
        stayByDate[tripDates[end + 1]] &&
        normalizePlaceIdentity(
          stayByDate[tripDates[end + 1]]!.source_url || stayByDate[tripDates[end + 1]]!.title,
        ) === baseId
      ) {
        end++;
      }
      const totalNights = end - index + 1;

      result[date] = {
        date,
        dayIndex: index,
        isTransferDay: true,
        checkoutHotel: prevStay,
        checkinHotel: todayStay,
        stayHotel: todayStay,
        stayNightIndex: 1,
        totalStayNights: totalNights,
      };
    } else {
      let nightIndex = 1;
      let totalNights = 1;

      if (todayStay) {
        const baseId = normalizePlaceIdentity(todayStay.source_url || todayStay.title);
        let start = index;
        while (
          start > 0 &&
          stayByDate[tripDates[start - 1]] &&
          normalizePlaceIdentity(
            stayByDate[tripDates[start - 1]]!.source_url || stayByDate[tripDates[start - 1]]!.title,
          ) === baseId
        ) {
          start--;
        }
        nightIndex = index - start + 1;

        let end = index;
        while (
          end < tripDates.length - 1 &&
          stayByDate[tripDates[end + 1]] &&
          normalizePlaceIdentity(
            stayByDate[tripDates[end + 1]]!.source_url || stayByDate[tripDates[end + 1]]!.title,
          ) === baseId
        ) {
          end++;
        }
        totalNights = end - start + 1;
      }

      result[date] = {
        date,
        dayIndex: index,
        isTransferDay: false,
        stayHotel: todayStay,
        stayNightIndex: todayStay ? nightIndex : undefined,
        totalStayNights: todayStay ? totalNights : undefined,
      };
    }
  });

  return result;
}

export type TripExpenseCategory = 'stay' | 'food' | 'transit' | 'ticket' | 'shopping' | 'other';

export interface TripExpenseItem {
  id: string;
  trip_id: string;
  title: string;
  category: TripExpenseCategory;
  amount: number;
  currency: string;
  date?: string;
  paid_by: string;
  split_members: string[];
  notes?: string;
  confirmation?: string;
  created_at: string;
}

export interface MemberBalance {
  member: string;
  paidTotal: number;
  shareTotal: number;
  netBalance: number;
}

export interface CashFlowTransfer {
  from: string;
  to: string;
  amount: number;
}

export interface TripSettlementResult {
  totalExpense: number;
  memberBalances: MemberBalance[];
  transfers: CashFlowTransfer[];
  summaryText: string;
}

const SYMBOL_TO_CODE: Record<string, string> = {
  '¥': 'CNY', '￥': 'CNY', '円': 'JPY', '日元': 'JPY', '元': 'CNY', '块': 'CNY', '人民币': 'CNY',
  '$': 'USD', '€': 'EUR', '£': 'GBP', '฿': 'THB', '铢': 'THB', '泰铢': 'THB', '₩': 'KRW', '원': 'KRW', '韩元': 'KRW',
  'S$': 'SGD', 'HK$': 'HKD', 'NT$': 'TWD', 'US$': 'USD', 'A$': 'AUD', 'AU$': 'AUD', 'C$': 'CAD', 'CA$': 'CAD', 'NZ$': 'NZD',
  '₫': 'VND', '₹': 'INR', 'RM': 'MYR', 'CHF': 'CHF',
};

/**
 * Approximate reference rates used when a trip defines no explicit override:
 * value = how many USD one unit of the currency is worth. Editable defaults,
 * never a live market feed (local-first: no network, no API keys).
 */
export const DEFAULT_USD_PIVOT: Record<string, number> = {
  USD: 1, CNY: 0.14, JPY: 0.0067, THB: 0.027, HKD: 0.128, TWD: 0.031,
  KRW: 0.00073, SGD: 0.74, MYR: 0.21, EUR: 1.08, GBP: 1.27, AUD: 0.66,
  CAD: 0.73, CHF: 1.12, INR: 0.012, VND: 0.00004, NZD: 0.61, PHP: 0.018,
  IDR: 0.000062, AED: 0.27, TRY: 0.029, SEK: 0.093, NOK: 0.091, DKK: 0.145,
  PLN: 0.25, BRL: 0.18, SAR: 0.27, MOP: 0.124, EGP: 0.021, ZAR: 0.055,
};

export interface FxSettings {
  /** Trip base currency (ISO code). */
  base: string;
  /** Explicit user overrides: overrides[from] = how many BASE per 1 FROM. */
  overrides?: Record<string, number>;
  /** Pivot exchange rates against USD: pivot[code] = USD value of 1 unit of currency. */
  usdPivots?: Record<string, number>;
}

/** Effective multiplier converting 1 FROM into BASE, or null when unknown. */
export function effectiveFxRate(
  from: string | null | undefined,
  fx: FxSettings,
): number | null {
  const code = from?.trim().toUpperCase() || null;
  if (!code) return null;
  const base = fx.base.toUpperCase();
  if (code === base) return 1;

  // Direct override: how many BASE per 1 FROM
  const directOverride = fx.overrides?.[code];
  // Guard: if overrides contains 'USD: 1', it is a USD-pivot table rather than direct BASE multiplier
  const isUsdPivotTable = fx.overrides?.USD === 1 && base !== 'USD';
  if (!isUsdPivotTable && typeof directOverride === 'number' && Number.isFinite(directOverride) && directOverride > 0) {
    return directOverride;
  }

  const pivots = isUsdPivotTable ? fx.overrides : (fx.usdPivots || DEFAULT_USD_PIVOT);
  const fromUsd = pivots?.[code] ?? DEFAULT_USD_PIVOT[code];
  const baseUsd = pivots?.[base] ?? DEFAULT_USD_PIVOT[base];

  if (fromUsd && baseUsd && baseUsd > 0) {
    return fromUsd / baseUsd;
  }
  return null;
}

/** Extracts a normalized ISO-ish currency marker from a free-text price string. */
export function extractPriceCurrency(raw?: string | null): string | null {
  if (!raw) return null;
  const specificMatch = /(?:S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|SGD|HKD|TWD|USD|THB|JPY|EUR|GBP|CNY|RMB|AUD|CAD|NZD|KRW|MYR|VND|CHF|INR|\bRM\b|新台币|人民币|日元|泰铢|韩元)/i.exec(raw);
  if (specificMatch) {
    const marker = specificMatch[0].toUpperCase();
    return SYMBOL_TO_CODE[marker] ?? marker.replace(/\$$/, '');
  }

  const singleMatch = /(?:[¥￥฿$€£₩₫₹円铢元块원])/i.exec(raw);
  if (singleMatch) {
    const marker = singleMatch[0];
    return SYMBOL_TO_CODE[marker] ?? null;
  }

  return null;
}

export interface TripBudgetEstimation {
  totalEstimated: number;
  perPersonEstimated: number;
  travelerCount: number;
  categoryBreakdown: {
    stay: number;
    food: number;
    ticket: number;
    other: number;
  };
  detectedCurrency: string;
  /** Distinct currency markers found across observed prices; >1 means mixed and unconverted. */
  currencies: string[];
}

const CODE_TO_SYMBOL: Record<string, string> = {
  CNY: '¥', JPY: '¥', USD: '$', EUR: '€', GBP: '£', THB: '฿', KRW: '₩',
  SGD: 'S$', HKD: 'HK$', TWD: 'NT$', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', INR: '₹',
  MYR: 'RM', VND: '₫', NZD: 'NZ$', PHP: '₱', IDR: 'Rp ', AED: 'AED ', TRY: '₺',
  SEK: 'kr ', NOK: 'kr ', DKK: 'kr ', PLN: 'zł', MOP: 'MOP$ ', BRL: 'R$ ', SAR: 'SAR ',
};

/** Renders an ISO code (or raw symbol) as a display symbol for ledger summaries. */
export function currencySymbolFor(code?: string | null): string {
  if (!code) return '¥';
  const trimmed = code.trim().toUpperCase();
  if (CODE_TO_SYMBOL[trimmed]) return CODE_TO_SYMBOL[trimmed];
  return `${trimmed} `;
}

/** Standard minor unit decimal places per ISO 4217. */
export const CURRENCY_DECIMAL_DIGITS: Record<string, number> = {
  // 0 decimal currencies (no sub-units in common circulation)
  JPY: 0, KRW: 0, VND: 0, IDR: 0, CLP: 0, PYG: 0, HUF: 0, ISK: 0, UGX: 0, TWD: 0,
  // 3 decimal currencies
  BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3,
};

export function getCurrencyDecimals(code?: string | null): number {
  if (!code) return 2;
  const upper = code.trim().toUpperCase();
  return CURRENCY_DECIMAL_DIGITS[upper] ?? 2;
}

export const PLANNER_KIND_ICONS: Record<PlannerPlaceKind, string> = {
  attraction: '🏰',
  food: '🍜',
  cafe: '☕',
  stay: '🏨',
  shopping: '🛍️',
  transit: '🚇',
  experience: '🧗',
  other: '📍',
};

export const PLANNER_KIND_LABELS: Record<PlannerPlaceKind, { zh: string; en: string }> = {
  stay: { zh: '住宿', en: 'Stay' },
  food: { zh: '美食', en: 'Food' },
  cafe: { zh: '咖啡', en: 'Cafe' },
  attraction: { zh: '景点', en: 'Attraction' },
  experience: { zh: '体验', en: 'Experience' },
  shopping: { zh: '购物', en: 'Shopping' },
  transit: { zh: '交通', en: 'Transit' },
  other: { zh: '其它', en: 'Other' },
};

export function getPlannerKindLabel(kind: PlannerPlaceKind, lang: 'zh' | 'en' = 'zh'): string {
  return PLANNER_KIND_LABELS[kind]?.[lang] || (lang === 'zh' ? '其它' : 'Other');
}

export function ensurePlaceKindTag(
  tags: string[] = [],
  kind: PlannerPlaceKind = 'other',
  language: 'zh' | 'en' = 'zh',
): string[] {
  const kindZh = PLANNER_KIND_LABELS[kind]?.zh || '其它';
  const kindEn = PLANNER_KIND_LABELS[kind]?.en || 'Other';
  const targetTag = language === 'en' ? kindEn : kindZh;

  const rawTags = (tags || []).map((t) => (t || '').trim()).filter(Boolean);

  const isMatchThisKind = (t: string) => {
    const lower = t.toLowerCase();
    if (lower === kindZh.toLowerCase() || lower === kindEn.toLowerCase()) return true;
    if (kind === 'stay' && (lower === '酒店' || lower === '酒店住宿' || lower === 'hotel' || lower === 'stay')) return true;
    if (kind === 'food' && (lower === '餐厅' || lower === '餐厅美食' || lower === '美食' || lower === 'food' || lower === 'dining')) return true;
    if (kind === 'cafe' && (lower === '咖啡馆' || lower === '咖啡甜品' || lower === '咖啡' || lower === 'cafe' || lower === 'coffee')) return true;
    if (kind === 'attraction' && (lower === '观光景点' || lower === '景点' || lower === 'attraction' || lower === 'sightseeing')) return true;
    if (kind === 'shopping' && (lower === '购物商场' || lower === '购物' || lower === 'shopping' || lower === 'mall')) return true;
    if (kind === 'transit' && (lower === '交通中转' || lower === '交通' || lower === 'transit' || lower === 'station')) return true;
    if (kind === 'experience' && (lower === '体验活动' || lower === '体验' || lower === 'experience' || lower === 'activity')) return true;
    if (kind === 'other' && (lower === '其他' || lower === '其它' || lower === 'other')) return true;
    return false;
  };

  const hasKindTag = rawTags.some(isMatchThisKind);

  const seen = new Set<string>();
  const result: string[] = [];

  if (!hasKindTag) {
    seen.add(targetTag.toLowerCase());
    result.push(targetTag);
  }

  for (const tag of rawTags) {
    const lower = tag.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(tag);
    }
  }

  return result;
}

export function isPlausibleCustomTag(
  tag: string,
  excludedNames: Set<string> = new Set(),
): boolean {
  const trimmed = (tag || '').trim();
  if (!trimmed || trimmed.length < 1 || trimmed.length > 25) return false;
  const lower = trimmed.toLowerCase();
  if (excludedNames.has(lower)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^\d+([-\s]\d+)*$/.test(trimmed)) return false;
  if (/[0-9]+[街路巷弄号]/.test(trimmed)) return false;
  if (/^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$/.test(trimmed)) return false;
  return true;
}

/** Maps Google taxonomy types onto our place kinds; more specific wins. */
const TYPE_KIND_RULES: Array<[RegExp, PlannerPlaceKind]> = [
  [/lodging|hotel|motel|hostel|guest_house|bed_and_breakfast|ryokan|resort|accommodation|serviced_apartment|villa|extended_stay/i, 'stay'],
  [/cafe|coffee_shop|tea_house|dessert|bakery|ice_cream/i, 'cafe'],
  [/restaurant|bar\b|pub|food|meal_takeaway|meal_delivery|ramen|sushi|izakaya|bistro|steak_house/i, 'food'],
  [/transit_station|subway_station|bus_station|airport|train_station|ferry_terminal|light_rail_station/i, 'transit'],
  [/shopping_mall|department_store|store|market|bazaar|outlet|supermarket|clothing_store/i, 'shopping'],
  [/spa|gym|fitness|bowling|amusement_park|water_park|night_club|experience|diving|ski_resort|hot_spring/i, 'experience'],
  [/museum|art_gallery|tourist_attraction|place_of_worship|historical|castle|park\b|zoo|aquarium|viewpoint|beach|point_of_interest|landmark/i, 'attraction'],
];

export function inferKindFromTypes(types?: string[]): PlannerPlaceKind | null {
  if (!types || types.length === 0) return null;
  for (const [pattern, kind] of TYPE_KIND_RULES) {
    if (types.some((t) => pattern.test(t))) return kind;
  }
  return null;
}

export interface ParsedPriceDetail {
  raw: string;
  currency: string | null;
  minAmount: number;
  maxAmount: number;
  isRange: boolean;
}

export interface ConvertedPriceResult {
  sourceRaw: string;
  sourceCurrency: string | null;
  targetCurrency: string;
  rate: number;
  convertedMin: number;
  convertedMax: number;
  isRange: boolean;
  formattedTarget: string;
  rateDescription: string;
}

export function parseDetailedPrice(raw?: string | null): ParsedPriceDetail | null {
  if (!raw || typeof raw !== 'string') return null;
  const currency = extractPriceCurrency(raw);
  
  // Range check: e.g. "฿400–1,000", "¥1000 - 2000", "400 ~ 1000", "400 to 1000"
  const rangeMatch = /(\d[\d,]*(?:\.\d+)?)\s*[-–—〜~至到|/]\s*(\d[\d,]*(?:\.\d+)?)/.exec(raw);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max) && (min > 0 || max > 0)) {
      return {
        raw,
        currency,
        minAmount: min,
        maxAmount: max,
        isRange: min !== max,
      };
    }
  }

  // Single number check: e.g. "฿500", "JPY 2500", "$120.50"
  const singleMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(raw);
  if (singleMatch) {
    const val = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (Number.isFinite(val) && val > 0) {
      return {
        raw,
        currency,
        minAmount: val,
        maxAmount: val,
        isRange: false,
      };
    }
  }

  return null;
}

export interface NormalizedObservedPrice {
  currency?: string;
  min?: number;
  max?: number;
  unit: PlannerPriceUnit;
  level?: number;
}

/**
 * Turns a captured price label into comparable facts while retaining the raw
 * source text separately on PlannerTripPlace.observed_price.
 *
 * Ambiguous bare symbols use the page-currency detector as the authority:
 * "$" can therefore become SGD/HKD/AUD/etc. and "¥" can become JPY/CNY.
 */
export function normalizeObservedPrice(
  raw?: string | null,
  detectedCurrency?: string | null,
): NormalizedObservedPrice | null {
  const text = raw?.trim();
  if (!text) return null;

  const levelMatch = /^([$€£¥￥฿₩])\1{0,3}$/.exec(text);
  if (levelMatch) {
    return { unit: 'level', level: Math.min(4, text.length) };
  }

  const parsed = parseDetailedPrice(text);
  if (!parsed) return null;

  const hint = detectedCurrency?.trim().toUpperCase() || undefined;
  let currency = parsed.currency || hint;

  const hasBareDollar = text.includes('$')
    && !/(?:S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$|MOP\$|R\$)/i.test(text);
  if (hasBareDollar && hint && ['USD', 'SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'TWD'].includes(hint)) {
    currency = hint;
  }

  const hasBareYen = /[¥￥]/.test(text) && !/(?:JPY|CNY|RMB|円|日元|人民币)/i.test(text);
  if (hasBareYen && hint && ['JPY', 'CNY'].includes(hint)) {
    currency = hint;
  }

  let unit: PlannerPriceUnit = 'unknown';
  if (/(?:人均|每人|per\s*person|\/\s*person\b|\bpp\b)/i.test(text)) unit = 'person';
  else if (/(?:每晚|per\s*night|\/\s*night\b|nightly|\bnight\b|晚\/)/i.test(text)) unit = 'night';
  else if (/(?:每件|per\s*item|\/\s*item\b|\beach\b)/i.test(text)) unit = 'item';

  return {
    currency: currency || undefined,
    min: parsed.minAmount,
    max: parsed.maxAmount,
    unit,
  };
}

export function convertPriceRange(
  raw: string,
  targetCurrency = 'CNY',
  fxOverridesOrPivots?: Record<string, number> | { overrides?: Record<string, number>; usdPivots?: Record<string, number> },
  fallbackSourceCurrency?: string,
): ConvertedPriceResult | null {
  const parsed = parseDetailedPrice(raw);
  if (!parsed) return null;

  let fromCurr: string | null = parsed.currency;
  const fallback = fallbackSourceCurrency?.trim().toUpperCase();

  // Strict disambiguation:
  if (raw.includes('¥') || raw.includes('￥')) {
    if (raw.includes('円') || raw.includes('日元') || /JPY/i.test(raw) || fallback === 'JPY') {
      fromCurr = 'JPY';
    } else {
      fromCurr = 'CNY';
    }
  } else if (raw.includes('$') && !/S\$|HK\$|NT\$|US\$|AU\$|A\$|CA\$|C\$|NZ\$/i.test(raw)) {
    const validDollarCurrencies = ['SGD', 'HKD', 'AUD', 'CAD', 'NZD', 'USD', 'TWD'];
    if (fallback && validDollarCurrencies.includes(fallback)) {
      fromCurr = fallback;
    } else {
      fromCurr = 'USD';
    }
  } else if (!fromCurr) {
    fromCurr = fallback || null;
  }

  if (!fromCurr) return null;

  const target = targetCurrency.trim().toUpperCase();
  const from = fromCurr.trim().toUpperCase();

  let fx: FxSettings;
  if (fxOverridesOrPivots && typeof fxOverridesOrPivots === 'object' && ('overrides' in fxOverridesOrPivots || 'usdPivots' in fxOverridesOrPivots)) {
    const config = fxOverridesOrPivots as { overrides?: Record<string, number>; usdPivots?: Record<string, number> };
    fx = {
      base: target,
      overrides: config.overrides,
      usdPivots: config.usdPivots,
    };
  } else {
    const map = fxOverridesOrPivots as Record<string, number> | undefined;
    if (map && map.USD === 1 && target !== 'USD') {
      fx = {
        base: target,
        usdPivots: map,
      };
    } else {
      fx = {
        base: target,
        overrides: map,
      };
    }
  }

  const rate = effectiveFxRate(from, fx);
  if (!rate || rate <= 0) return null;

  const decimals = getCurrencyDecimals(target);
  const factor = Math.pow(10, decimals);
  const convertedMin = Math.round(parsed.minAmount * rate * factor) / factor;
  const convertedMax = Math.round(parsed.maxAmount * rate * factor) / factor;
  const targetSymbol = currencySymbolFor(target);

  const formatAmount = (num: number) => {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals === 0 ? 0 : (num % 1 === 0 ? 0 : decimals),
      maximumFractionDigits: decimals,
    });
  };

  const formattedTarget = parsed.isRange
    ? `${targetSymbol}${formatAmount(convertedMin)} – ${formatAmount(convertedMax)}`
    : `${targetSymbol}${formatAmount(convertedMin)}`;

  const formatRate = (r: number) => {
    if (r >= 100) return r % 1 === 0 ? r.toLocaleString() : r.toFixed(2);
    if (r >= 1) return r.toFixed(2);
    if (r >= 0.01) return r.toFixed(4);
    return r.toFixed(6);
  };

  const rateDescription = `1 ${from} ≈ ${formatRate(rate)} ${target}`;

  return {
    sourceRaw: raw,
    sourceCurrency: from,
    targetCurrency: target,
    rate,
    convertedMin,
    convertedMax,
    isRange: parsed.isRange,
    formattedTarget,
    rateDescription,
  };
}

export function parseNumericPrice(raw?: string | null): number {  if (!raw) return 0;
  // Handle ranges like "฿200-400" or "¥1,000–2,000" -> average
  const rangeMatch = /(\d[\d,]*)\s*[-–—〜~至]\s*(\d[\d,]*)/.exec(raw);
  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return Math.round((min + max) / 2);
    }
  }
  // Single number
  const singleMatch = /(\d[\d,]*)/.exec(raw);
  if (singleMatch) {
    const num = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

export function estimateTripBudget(
  scheduledPlaces: PlannerTripPlace[],
  travelerCount = 1,
  fx?: FxSettings,
): TripBudgetEstimation {
  const base = fx?.base?.trim().toUpperCase() || 'CNY';
  let stayTotal = 0;
  let foodTotal = 0;
  let ticketTotal = 0;
  let otherTotal = 0;
  let currency = '';
  const foundCurrencies = new Set<string>();

  const validTravelers = Math.max(1, travelerCount);

  scheduledPlaces.forEach((place) => {
    const price = parseNumericPrice(place.observed_price);
    let marker: string | null = null;
    if (place.observed_price) {
      marker = extractPriceCurrency(place.observed_price);
      if (marker) {
        foundCurrencies.add(marker);
        if (!currency) currency = marker;
      }
    }

    // Convert the amount into the trip base currency when a rate is known.
    // Bare numbers (no marker) are assumed to already be in base currency.
    const from = marker ?? base;
    const rate = effectiveFxRate(from, { base, overrides: fx?.overrides });
    const converted = rate !== null ? Math.round(price * rate * 100) / 100 : price;

    if (place.kind === 'stay') {
      stayTotal += converted > 0 ? converted : 0;
    } else if (place.kind === 'food' || place.kind === 'cafe') {
      foodTotal += (converted > 0 ? converted : 0) * validTravelers;
    } else if (place.kind === 'attraction' || place.kind === 'experience') {
      ticketTotal += (converted > 0 ? converted : 0) * validTravelers;
    } else {
      otherTotal += (converted > 0 ? converted : 0) * validTravelers;
    }
  });

  const totalEstimated = stayTotal + foodTotal + ticketTotal + otherTotal;
  const perPersonEstimated = Math.round(totalEstimated / validTravelers);

  return {
    totalEstimated,
    perPersonEstimated,
    travelerCount: validTravelers,
    categoryBreakdown: {
      stay: stayTotal,
      food: foodTotal,
      ticket: ticketTotal,
      other: otherTotal,
    },
    detectedCurrency: currency || base,
    currencies: [...foundCurrencies],
  };
}

export function calculateTripSettlement(
  expenses: TripExpenseItem[],
  allMembers: string[] = [],
  fx?: FxSettings,
): TripSettlementResult {
  const toBase = (amount: number, from?: string): number => {
    if (!fx) return amount;
    const rate = effectiveFxRate(from, fx);
    return rate === null ? amount : Math.round(amount * rate * 100) / 100;
  };

  const memberSet = new Set<string>(allMembers);
  expenses.forEach((exp) => {
    if (exp.paid_by?.trim()) memberSet.add(exp.paid_by.trim());
    (exp.split_members || []).forEach((m) => {
      if (m?.trim()) memberSet.add(m.trim());
    });
  });

  const members = Array.from(memberSet).filter(Boolean);
  if (members.length === 0 || expenses.length === 0) {
    return {
      totalExpense: 0,
      memberBalances: [],
      transfers: [],
      summaryText: '暂无账目流水记录。',
    };
  }

  const paidMap: Record<string, number> = {};
  const shareMap: Record<string, number> = {};
  members.forEach((m) => {
    paidMap[m] = 0;
    shareMap[m] = 0;
  });

  let totalExpense = 0;

  expenses.forEach((exp) => {
    const amt = toBase(exp.amount, exp.currency);
    totalExpense += amt;
    const payer = exp.paid_by?.trim() || members[0];
    if (paidMap[payer] !== undefined) {
      paidMap[payer] += amt;
    } else {
      paidMap[payer] = amt;
    }

    const rawSplits = (exp.split_members || []).map((m) => m?.trim()).filter(Boolean) as string[];
    const splits = rawSplits.length > 0 ? rawSplits : members;
    const perShare = amt / splits.length;
    splits.forEach((sm) => {
      if (shareMap[sm] !== undefined) {
        shareMap[sm] += perShare;
      } else {
        shareMap[sm] = perShare;
      }
    });
  });

  const memberBalances: MemberBalance[] = members.map((m) => {
    const paid = Math.round((paidMap[m] || 0) * 100) / 100;
    const share = Math.round((shareMap[m] || 0) * 100) / 100;
    const net = Math.round((paid - share) * 100) / 100;
    return {
      member: m,
      paidTotal: paid,
      shareTotal: share,
      netBalance: net,
    };
  });

  // Greedy Balance Matching (Minimum Cash Flow)
  const balances: Record<string, number> = {};
  memberBalances.forEach((mb) => {
    balances[mb.member] = mb.netBalance;
  });

  const transfers: CashFlowTransfer[] = [];

  while (true) {
    let maxCreditor: string | null = null;
    let maxCredit = 0.01;
    let maxDebtor: string | null = null;
    let maxDebt = -0.01;

    for (const [member, balance] of Object.entries(balances)) {
      if (balance > maxCredit) {
        maxCredit = balance;
        maxCreditor = member;
      }
      if (balance < maxDebt) {
        maxDebt = balance;
        maxDebtor = member;
      }
    }

    if (!maxCreditor || !maxDebtor) break;

    const transferAmount = Math.round(Math.min(maxCredit, -maxDebt) * 100) / 100;
    if (transferAmount <= 0.01) break;

    transfers.push({
      from: maxDebtor,
      to: maxCreditor,
      amount: transferAmount,
    });

    balances[maxCreditor] = Math.round((balances[maxCreditor] - transferAmount) * 100) / 100;
    balances[maxDebtor] = Math.round((balances[maxDebtor] + transferAmount) * 100) / 100;
  }

  // Build WeChat-friendly summary text
  const baseCurrency = fx?.base?.trim().toUpperCase();
  const currencySymbol = currencySymbolFor(baseCurrency ?? expenses[0]?.currency);
  const lines: string[] = [
    `✈️ 旅行费用 AA 清算账单`,
    `💰 总支出: ${currencySymbol}${totalExpense} (共 ${members.length} 人)`,
    `------------------------------`,
  ];

  if (transfers.length === 0) {
    lines.push('🎉 全员账目已完全持平，无需任何转账！');
  } else {
    transfers.forEach((t, i) => {
      lines.push(`${i + 1}. ${t.from} 👉 微信转账给 ${t.to}: ${currencySymbol}${t.amount}`);
    });
    const evenMembers = memberBalances.filter((mb) => Math.abs(mb.netBalance) <= 0.01).map((mb) => mb.member);
    if (evenMembers.length > 0) {
      lines.push(`------------------------------`);
      lines.push(`• ${evenMembers.join('、')} 账目持平，无需转账。`);
    }
  }

  return {
    totalExpense: Math.round(totalExpense * 100) / 100,
    memberBalances,
    transfers,
    summaryText: lines.join('\n'),
  };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((c) => c.replace(/^["']|["']$/g, '').trim());
}

export function parseImportPayload(rawText: string, tripId: string): PlannerTripPlace[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  const results: PlannerTripPlace[] = [];
  const now = new Date().toISOString();

  const makePlace = (partial: Partial<PlannerTripPlace> & { title: string; category?: string }): PlannerTripPlace => {
    const kind = partial.kind
      || (partial.category ? inferPlaceKind(partial.category) : undefined)
      || inferPlaceKind(partial.title);
    return {
      schema_version: '0.1',
      type: 'trip_place',
      id: partial.id || crypto.randomUUID(),
      trip_id: tripId,
      title: partial.title.trim(),
      source_provider: partial.source_provider || (partial.source_url ? inferSourceProvider(partial.source_url) : 'other'),
      source_url: partial.source_url || '',
      source_place_id: partial.source_place_id,
      kind,
      area: partial.area?.trim() || undefined,
      priority: partial.priority || 'want',
      tags: ensurePlaceKindTag(partial.tags || [], kind),
      why: partial.why?.trim() || undefined,
      signals: partial.signals || [],
      risks: partial.risks || [],
      notes: partial.notes?.trim() || undefined,
      observed_rating: typeof partial.observed_rating === 'number' ? partial.observed_rating : undefined,
      observed_price: partial.observed_price?.trim() || undefined,
      preferred_window: partial.preferred_window,
      duration_minutes: typeof partial.duration_minutes === 'number' ? partial.duration_minutes : undefined,
      open_hours: partial.open_hours?.trim() || undefined,
      address: partial.address?.trim() || undefined,
      coordinates: partial.coordinates,
      phone: partial.phone?.trim() || undefined,
      plus_code: partial.plus_code?.trim() || undefined,
      menu_url: partial.menu_url?.trim() || undefined,
      reservation_url: partial.reservation_url?.trim() || undefined,
      reservation_status: partial.reservation_status || 'none',
      state: 'candidate',
      created_at: partial.created_at || now,
      updated_at: partial.updated_at || now,
    };
  };

  // 1. Try JSON
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          const title = String(item.title || item.name || item.placeName || '').trim();
          if (!title) continue;
          const coords = item.coordinates || (
            typeof item.lat === 'number' && typeof item.lng === 'number'
              ? { lat: item.lat, lng: item.lng }
              : undefined
          );
          results.push(makePlace({
            ...item,
            title,
            coordinates: coords,
          }));
        }
      }
      if (results.length > 0) return results;
    } catch {}
  }

  // 2. Try KML
  if (trimmed.includes('<Placemark') || trimmed.includes('<kml')) {
    const placemarkRegex = /<Placemark[\s\S]*?<\/Placemark>/gi;
    let match: RegExpExecArray | null;
    while ((match = placemarkRegex.exec(trimmed)) !== null) {
      const chunk = match[0];
      const nameMatch = /<name>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/name>/i.exec(chunk);
      const title = nameMatch ? nameMatch[1].trim() : '';
      if (!title) continue;

      const descMatch = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(chunk);
      const addressMatch = /<address>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/address>/i.exec(chunk);
      const coordMatch = /<coordinates>\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(chunk);

      let coordinates: { lat: number; lng: number } | undefined;
      if (coordMatch) {
        const lng = parseFloat(coordMatch[1]);
        const lat = parseFloat(coordMatch[2]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          coordinates = { lat, lng };
        }
      }

      results.push(makePlace({
        title: title.replace(/^\d+\.\s*/, ''),
        notes: descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : undefined,
        address: addressMatch ? addressMatch[1].trim() : undefined,
        coordinates,
      }));
    }
    if (results.length > 0) return results;
  }

  // 3. Try CSV
  if (trimmed.includes(',') && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      const headerLine = lines[0].toLowerCase();
      if (headerLine.includes('title') || headerLine.includes('kind') || headerLine.includes('name') || headerLine.includes('order')) {
        const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
        const titleIdx = headers.findIndex((h) => h === 'title' || h === 'name');
        const kindIdx = headers.findIndex((h) => h === 'kind' || h === 'category');
        const addrIdx = headers.findIndex((h) => h === 'address');
        const priceIdx = headers.findIndex((h) => h === 'price' || h === 'observed_price');
        const ratingIdx = headers.findIndex((h) => h === 'rating' || h === 'observed_rating');
        const notesIdx = headers.findIndex((h) => h === 'notes' || h === 'why');
        const urlIdx = headers.findIndex((h) => h.includes('url') || h.includes('link'));

        if (titleIdx !== -1) {
          for (let i = 1; i < lines.length; i++) {
            const cells = splitCsvLine(lines[i]);
            const title = cells[titleIdx];
            if (!title) continue;
            results.push(makePlace({
              title,
              kind: kindIdx !== -1 && cells[kindIdx] ? inferPlaceKind(cells[kindIdx]) : undefined,
              address: addrIdx !== -1 ? cells[addrIdx] : undefined,
              observed_price: priceIdx !== -1 ? cells[priceIdx] : undefined,
              observed_rating: ratingIdx !== -1 && !isNaN(Number(cells[ratingIdx])) ? Number(cells[ratingIdx]) : undefined,
              notes: notesIdx !== -1 ? cells[notesIdx] : undefined,
              source_url: urlIdx !== -1 ? cells[urlIdx] : undefined,
            }));
          }
          if (results.length > 0) return results;
        }
      }
    }
  }

  // 4. Line-by-line / text & Google Maps links fallback
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^https?:\/\//i.test(line)) {
      const coords = extractPlaceCoordinates(line);
      let title = 'Saved Place';
      const placeMatch = /\/maps\/place\/([^/@?]+)/.exec(line);
      if (placeMatch?.[1]) {
        try { title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')); } catch { title = placeMatch[1]; }
      }
      results.push(makePlace({
        title,
        source_url: line,
        coordinates: coords ?? undefined,
      }));
    } else {
      const cleanTitle = line.replace(/^[-*•\d+.)\]\s]+/, '').trim();
      if (cleanTitle.length > 0) {
        results.push(makePlace({
          title: cleanTitle,
        }));
      }
    }
  }

  return results;
}

export function parsePlaceExpenseEstimate(
  place: PlannerTripPlace,
  fallbackCurrency = 'USD',
): { title: string; amount: number; currency: string; category: TripExpenseCategory } | null {
  if (!place.observed_price && !place.title) return null;

  const rawPrice = place.observed_price || '';
  const numMatch = /(?:[¥￥$€£฿₩]|NT\$|HK\$|S\$|US\$|THB|USD|CNY|JPY|EUR|GBP)?\s*([\d,]+(?:\.\d+)?)/i.exec(rawPrice);
  const amount = numMatch ? parseFloat(numMatch[1].replace(/,/g, '')) : 0;
  if (!amount || isNaN(amount) || amount <= 0) return null;

  const currency = extractPriceCurrency(rawPrice) || fallbackCurrency;

  let category: TripExpenseCategory = 'other';
  switch (place.kind) {
    case 'stay':
      category = 'stay';
      break;
    case 'food':
    case 'cafe':
      category = 'food';
      break;
    case 'attraction':
    case 'experience':
      category = 'ticket';
      break;
    case 'shopping':
      category = 'shopping';
      break;
    case 'transit':
      category = 'transit';
      break;
    default:
      category = 'other';
  }

  return {
    title: place.title,
    amount,
    currency,
    category,
  };
}

export function exportTripToMarkdown(
  trip: PlannerTrip,
  places: PlannerTripPlace[],
  expenses: TripExpenseItem[] = [],
  language: 'en' | 'zh' = 'zh',
): string {
  const zh = language === 'zh';
  const tripPlaces = places.filter((p) => p.trip_id === trip.id && p.state !== 'dropped');
  const dates = listTripDates(trip.start_date, trip.end_date);

  const lines: string[] = [
    `# ✈️ ${trip.title}`,
    ``,
    `> 📅 **${zh ? '行程日期' : 'Dates'}:** ${trip.start_date} ~ ${trip.end_date}  `,
    `> 📍 **${zh ? '目的地' : 'Destinations'}:** ${(trip.destinations || []).join(', ') || (zh ? '未设定' : 'None')}  `,
    `> 💰 **${zh ? '基础币种' : 'Currency'}:** ${trip.currency || 'USD'}  `,
    `> 👥 **${zh ? '出行成员' : 'Members'}:** ${(trip.members || [zh ? '我' : 'Me']).join(', ')}  `,
    ``,
    `---`,
    ``,
    `## 📋 ${zh ? '每日日程安排' : 'Daily Itinerary'}`,
    ``,
  ];

  dates.forEach((date, dayIdx) => {
    const dayPlaces = sortPlannerPlaces(tripPlaces.filter((p) => p.scheduled_date === date && p.state === 'scheduled'));
    lines.push(`### Day ${dayIdx + 1} (${date})`);

    if (dayPlaces.length === 0) {
      lines.push(`*${zh ? '暂未安排地点' : 'No places scheduled for this day.'}*\n`);
      return;
    }

    const routeUrl = buildGoogleMapsRouteUrl(dayPlaces, trip.transport_mode);
    if (routeUrl) {
      lines.push(`🔗 [${zh ? 'Google Maps 路线导航' : 'Google Maps Directions'}](${routeUrl})\n`);
    }

    dayPlaces.forEach((p, idx) => {
      const icon = PLANNER_KIND_ICONS[p.kind] || '📍';
      const kindLabel = getPlannerKindLabel(p.kind, language);
      const metaParts = [
        kindLabel,
        p.area,
        p.preferred_window ? (zh ? `时段: ${p.preferred_window}` : `Window: ${p.preferred_window}`) : null,
        p.duration_minutes ? (zh ? `${p.duration_minutes} 分钟` : `${p.duration_minutes} min`) : null,
        p.observed_rating ? `★ ${p.observed_rating}` : null,
        p.observed_price ? (zh ? `预估: ${p.observed_price}` : `Est: ${p.observed_price}`) : null,
      ].filter(Boolean);

      lines.push(`${idx + 1}. **${icon} ${p.title}** (${metaParts.join(' · ')})`);
      if (p.address) lines.push(`   - 📍 ${zh ? '地址' : 'Address'}: ${p.address}`);
      if (p.open_hours) lines.push(`   - ⏰ ${zh ? '营业时间' : 'Hours'}: ${p.open_hours}`);
      if (p.phone) lines.push(`   - 📞 ${zh ? '电话' : 'Phone'}: ${p.phone}`);
      if (p.why) lines.push(`   - 💡 ${zh ? '理由' : 'Why'}: ${p.why}`);
      if (p.notes) lines.push(`   - 📝 ${zh ? '备注' : 'Notes'}: ${p.notes}`);
      if (p.source_url) lines.push(`   - 🔗 [${zh ? '地点链接' : 'Place Link'}](${p.source_url})`);
    });

    lines.push(``);
  });

  const candidates = tripPlaces.filter((p) => p.state === 'candidate');
  if (candidates.length > 0) {
    lines.push(`---`, ``, `## 💡 ${zh ? '待选研究灵感池' : 'Candidate Research Pool'} (${candidates.length})`, ``);
    candidates.forEach((c) => {
      const icon = PLANNER_KIND_ICONS[c.kind] || '📍';
      lines.push(`- **${icon} ${c.title}** (${getPlannerKindLabel(c.kind, language)}${c.area ? ` · ${c.area}` : ''}${c.observed_price ? ` · ${c.observed_price}` : ''})`);
      if (c.why || c.notes) lines.push(`  *${c.why || c.notes}*`);
    });
    lines.push(``);
  }

  const tripExpenses = expenses.filter((e) => e.trip_id === trip.id);
  if (tripExpenses.length > 0) {
    lines.push(`---`, ``, `## 💰 ${zh ? '费用账本汇总' : 'Expense Summary'}`, ``);
    let total = 0;
    tripExpenses.forEach((e) => {
      total += e.amount;
      lines.push(`- **${e.date || '-'}** | ${e.title} (${e.category}): ${e.currency} ${e.amount} (${zh ? '付款人' : 'Paid by'}: ${e.paid_by})`);
    });
    lines.push(``, `**${zh ? '总支出笔数' : 'Total Entries'}:** ${tripExpenses.length} | **${zh ? '累计金额' : 'Total Amount'}:** ${total.toFixed(2)} ${trip.currency || ''}`, ``);
  }

  return lines.join('\n');
}


