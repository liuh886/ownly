import type { OneTimeExperienceObject, ReviewEntry, TravelLocation, WYQDObject } from './types';

/**
 * Convert ISO 3166-1 alpha-2 country code to flag emoji.
 * Each letter maps to a regional indicator symbol: A=U+1F1E6, B=U+1F1E7, etc.
 */
export function countryCodeToFlag(code?: string): string {
  if (!code || code.length !== 2) return ''
  const upper = code.toUpperCase()
  const a = upper.charCodeAt(0)
  const b = upper.charCodeAt(1)
  if (a < 65 || a > 90 || b < 65 || b > 90) return ''
  return String.fromCodePoint(a + 0x1F1E6 - 65, b + 0x1F1E6 - 65)
}

/**
 * Calculate the number of days between two date strings (inclusive).
 */
export function calculateDaysBetween(start?: string, end?: string): number | null {
  if (!start || !end) return null
  try {
    const s = new Date(start + (start.length === 10 ? 'T00:00:00' : ''))
    const e = new Date(end + (end.length === 10 ? 'T00:00:00' : ''))
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
    const diff = Math.abs(e.getTime() - s.getTime())
    return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)) + 1)
  } catch {
    return null
  }
}

export function getTravelExperiences(objects: WYQDObject[]): OneTimeExperienceObject[] {
  return objects.filter(
    (obj): obj is OneTimeExperienceObject =>
      obj.object_type === 'one_time_experience' &&
      obj.experience_subtype === 'travel_worldview',
  );
}

export interface TravelMapPoint {
  id: string;
  title: string;
  city?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
  status: 'planned' | 'in_progress' | 'completed' | 'reviewed';
  stopIndex?: number;
}

function isValidLocation(loc?: TravelLocation): loc is TravelLocation & { latitude: number; longitude: number } {
  return loc != null && loc.latitude != null && loc.longitude != null;
}

/**
 * Merge primary location + additional locations into a flat list of map points.
 * Each location becomes a separate point linked to the same experience.
 */
export function buildTravelMapPoints(experiences: OneTimeExperienceObject[]): TravelMapPoint[] {
  const points: TravelMapPoint[] = [];

  for (const exp of experiences) {
    const allLocations: TravelLocation[] = [];
    if (isValidLocation(exp.location)) allLocations.push(exp.location);
    if (exp.locations) {
      for (const loc of exp.locations) {
        if (isValidLocation(loc)) allLocations.push(loc);
      }
    }

    // Deduplicate by lat/lng
    const seen = new Set<string>();
    for (let i = 0; i < allLocations.length; i++) {
      const loc = allLocations[i];
      const key = `${loc.latitude!.toFixed(4)},${loc.longitude!.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({
        id: allLocations.length === 1 ? exp.id : `${exp.id}#${i}`,
        title: exp.title,
        city: loc.city,
        country_code: loc.country_code,
        latitude: loc.latitude!,
        longitude: loc.longitude!,
        status: exp.status,
        stopIndex: allLocations.length > 1 ? i : undefined,
      });
    }
  }

  return points;
}

export interface TravelReviewStats {
  avgFoodRank: number | null;
  avgSceneryRank: number | null;
  avgExperienceRank: number | null;
  totalSpend: number;
  avgSpend: number;
  reviewedCount: number;
}

export function getTravelReviewStats(
  objects: WYQDObject[],
  reviews: ReviewEntry[],
): TravelReviewStats {
  const travelExps = getTravelExperiences(objects);
  const travelIds = new Set(travelExps.map((e) => e.id));
  const travelReviews = reviews.filter(
    (r) => r.target_id && travelIds.has(r.target_id),
  );

  const foodScores = travelReviews
    .map((r) => r.food_score)
    .filter((r): r is number => r != null);
  const sceneryScores = travelReviews
    .map((r) => r.scenery_score)
    .filter((r): r is number => r != null);
  const expScores = travelReviews
    .map((r) => r.experience_score)
    .filter((r): r is number => r != null);

  const totalSpend = travelExps.reduce(
    (sum, e) => sum + (e.actual_total || e.budget_total || 0),
    0,
  );

  return {
    avgFoodRank: foodScores.length
      ? foodScores.reduce((a, b) => a + b, 0) / foodScores.length
      : null,
    avgSceneryRank: sceneryScores.length
      ? sceneryScores.reduce((a, b) => a + b, 0) / sceneryScores.length
      : null,
    avgExperienceRank: expScores.length
      ? expScores.reduce((a, b) => a + b, 0) / expScores.length
      : null,
    totalSpend,
    avgSpend: travelExps.length ? totalSpend / travelExps.length : 0,
    reviewedCount: travelReviews.length,
  };
}

export interface TravelSummary {
  countriesVisited: number;
  citiesVisited: number;
  totalTrips: number;
  totalSpend: number;
  avgSpendPerTrip: number;
  avgFoodRank: number | null;
  avgSceneryRank: number | null;
  avgExperienceRank: number | null;
  reviewedCount: number;
  countries: string[];
}

export function buildTravelSummary(
  experiences: OneTimeExperienceObject[],
  reviews: ReviewEntry[],
): TravelSummary {
  const countries = new Set<string>();
  const cities = new Set<string>();

  for (const exp of experiences) {
    if (exp.location?.country) countries.add(exp.location.country);
    if (exp.location?.city) cities.add(exp.location.city);
  }

  const stats = getTravelReviewStats(experiences, reviews);

  return {
    countriesVisited: countries.size,
    citiesVisited: cities.size,
    totalTrips: experiences.length,
    totalSpend: stats.totalSpend,
    avgSpendPerTrip: stats.avgSpend,
    avgFoodRank: stats.avgFoodRank,
    avgSceneryRank: stats.avgSceneryRank,
    avgExperienceRank: stats.avgExperienceRank,
    reviewedCount: stats.reviewedCount,
    countries: [...countries],
  };
}

// ── City Search ─────────────────────────────────────────

interface CityEntry {
  n: string;
  c: string;
  la: number;
  lo: number;
  cn?: string;
}

let _cityDatabase: CityEntry[] | null = null;

async function getCityDatabase(): Promise<CityEntry[]> {
  if (!_cityDatabase) {
    _cityDatabase = (await import('@/data/cities.json')).default as CityEntry[];
  }
  return _cityDatabase;
}

export interface CitySearchResult {
  name: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

export const COUNTRY_NAMES: Record<string, string> = {
  AD: 'Andorra', AE: 'UAE', AF: 'Afghanistan', AG: 'Antigua and Barbuda', AL: 'Albania', AM: 'Armenia', AO: 'Angola', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
  AZ: 'Azerbaijan', BA: 'Bosnia and Herzegovina', BB: 'Barbados', BD: 'Bangladesh', BE: 'Belgium', BF: 'Burkina Faso', BG: 'Bulgaria', BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin',
  BN: 'Brunei', BO: 'Bolivia', BR: 'Brazil', BS: 'Bahamas', BT: 'Bhutan', BW: 'Botswana', BY: 'Belarus', BZ: 'Belize', CA: 'Canada', CD: 'Congo',
  CF: 'Central African Republic', CG: 'Congo', CH: 'Switzerland', CI: 'Ivory Coast', CL: 'Chile', CM: 'Cameroon', CN: 'China', CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba',
  CV: 'Cape Verde', CY: 'Cyprus', CZ: 'Czech Republic', DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark', DM: 'Dominica', DO: 'Dominican Republic', DZ: 'Algeria', EC: 'Ecuador',
  EE: 'Estonia', EG: 'Egypt', ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia', FI: 'Finland', FJ: 'Fiji', FM: 'Micronesia', FR: 'France', GA: 'Gabon',
  GB: 'United Kingdom', GD: 'Grenada', GE: 'Georgia', GH: 'Ghana', GM: 'Gambia', GN: 'Guinea', GQ: 'Equatorial Guinea', GR: 'Greece', GT: 'Guatemala', GW: 'Guinea-Bissau',
  GY: 'Guyana', HN: 'Honduras', HR: 'Croatia', HT: 'Haiti', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel', IN: 'India', IQ: 'Iraq',
  IR: 'Iran', IS: 'Iceland', IT: 'Italy', JM: 'Jamaica', JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KI: 'Kiribati',
  KM: 'Comoros', KN: 'Saint Kitts and Nevis', KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KZ: 'Kazakhstan', LA: 'Laos', LB: 'Lebanon', LC: 'Saint Lucia', LI: 'Liechtenstein',
  LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MC: 'Monaco', MD: 'Moldova',
  ME: 'Montenegro', MG: 'Madagascar', MK: 'North Macedonia', ML: 'Mali', MM: 'Myanmar', MN: 'Mongolia', MR: 'Mauritania', MT: 'Malta', MU: 'Mauritius', MV: 'Maldives',
  MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia', MZ: 'Mozambique', NA: 'Namibia', NE: 'Niger', NG: 'Nigeria', NI: 'Nicaragua', NL: 'Netherlands', NO: 'Norway',
  NP: 'Nepal', NR: 'Nauru', NZ: 'New Zealand', OM: 'Oman', PA: 'Panama', PE: 'Peru', PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland',
  PT: 'Portugal', PW: 'Palau', PY: 'Paraguay', QA: 'Qatar', RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia', SB: 'Solomon Islands',
  SC: 'Seychelles', SD: 'Sudan', SE: 'Sweden', SG: 'Singapore', SI: 'Slovenia', SK: 'Slovakia', SL: 'Sierra Leone', SM: 'San Marino', SN: 'Senegal', SO: 'Somalia',
  SR: 'Suriname', SS: 'South Sudan', SV: 'El Salvador', SY: 'Syria', SZ: 'Eswatini', TD: 'Chad', TG: 'Togo', TH: 'Thailand', TJ: 'Tajikistan', TL: 'East Timor',
  TM: 'Turkmenistan', TN: 'Tunisia', TO: 'Tonga', TR: 'Turkey', TT: 'Trinidad and Tobago', TV: 'Tuvalu', TW: 'Taiwan', TZ: 'Tanzania', UA: 'Ukraine', UG: 'Uganda',
  US: 'United States', UY: 'Uruguay', UZ: 'Uzbekistan', VC: 'Saint Vincent', VE: 'Venezuela', VN: 'Vietnam', VU: 'Vanuatu', WS: 'Samoa', YE: 'Yemen', ZA: 'South Africa',
  ZM: 'Zambia', ZW: 'Zimbabwe', HK: 'Hong Kong', MO: 'Macau', PS: 'Palestine', XK: 'Kosovo',
};

export async function searchCities(query: string, limit = 10): Promise<CitySearchResult[]> {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();

  const cityDatabase = await getCityDatabase();
  const matches: Array<{ entry: CityEntry; score: number }> = [];

  for (const entry of cityDatabase) {
    let score = 0;
    const nameLower = entry.n.toLowerCase();
    const cnLower = entry.cn?.toLowerCase();

    if (nameLower === q || cnLower === q) {
      score = 100;
    } else if (nameLower.startsWith(q) || cnLower?.startsWith(q)) {
      score = 80;
    } else if (nameLower.includes(q) || cnLower?.includes(q)) {
      score = 50;
    }

    if (score > 0) {
      matches.push({ entry, score });
    }
  }

  matches.sort((a, b) => b.score - a.score || cityDatabase.indexOf(a.entry) - cityDatabase.indexOf(b.entry));

  const hasCJKQuery = /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(query);

  return matches.slice(0, limit).map(({ entry }) => {
    const country = COUNTRY_NAMES[entry.c] || entry.c;
    const displayName = hasCJKQuery && entry.cn
      ? `${entry.cn} (${entry.n}), ${entry.c}`
      : `${entry.n}, ${entry.c}`;

    return {
      name: entry.n,
      country,
      countryCode: entry.c,
      latitude: entry.la,
      longitude: entry.lo,
      displayName,
    };
  });
}
