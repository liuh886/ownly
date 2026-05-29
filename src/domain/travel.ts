import type { OneTimeExperienceObject, ReviewEntry, WYQDObject } from './types';
import citiesData from '@/data/cities.json';

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
}

export function buildTravelMapPoints(experiences: OneTimeExperienceObject[]): TravelMapPoint[] {
  return experiences
    .filter((exp) => exp.location?.latitude != null && exp.location?.longitude != null)
    .map((exp) => ({
      id: exp.id,
      title: exp.title,
      city: exp.location?.city,
      country_code: exp.location?.country_code,
      latitude: exp.location!.latitude!,
      longitude: exp.location!.longitude!,
    }));
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

  const foodRanks = travelReviews
    .map((r) => r.food_rank)
    .filter((r): r is number => r != null);
  const sceneryRanks = travelReviews
    .map((r) => r.scenery_rank)
    .filter((r): r is number => r != null);
  const expRanks = travelReviews
    .map((r) => r.experience_rank)
    .filter((r): r is number => r != null);

  const totalSpend = travelExps.reduce(
    (sum, e) => sum + (e.actual_total || e.budget_total || 0),
    0,
  );

  return {
    avgFoodRank: foodRanks.length
      ? foodRanks.reduce((a, b) => a + b, 0) / foodRanks.length
      : null,
    avgSceneryRank: sceneryRanks.length
      ? sceneryRanks.reduce((a, b) => a + b, 0) / sceneryRanks.length
      : null,
    avgExperienceRank: expRanks.length
      ? expRanks.reduce((a, b) => a + b, 0) / expRanks.length
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

export function parseTravelQuickLine(
  input: string,
): {
  title: string;
  budget?: number;
  actual?: number;
  endedAt?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
} | null {
  const parts = input
    .split(/[/，,|]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const typeKeyword = (parts[1] || '').toLowerCase();
  const isTravel = ['travel', '旅行', '旅行体验', 'travel_worldview'].includes(typeKeyword);
  if (!isTravel) return null;

  const [name, , budget, actual, endedAt, , , countryCode, lat, lng] = parts;

  return {
    title: name || '',
    budget: budget && /^\d+(\.\d+)?$/.test(budget) ? Number(budget) : undefined,
    actual: actual && /^\d+(\.\d+)?$/.test(actual) ? Number(actual) : undefined,
    endedAt: endedAt && /^\d{4}-\d{2}-\d{2}$/.test(endedAt) ? endedAt : undefined,
    countryCode: countryCode || undefined,
    latitude: lat && /^-?\d+(\.\d+)?$/.test(lat) ? Number(lat) : undefined,
    longitude: lng && /^-?\d+(\.\d+)?$/.test(lng) ? Number(lng) : undefined,
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

const cityDatabase: CityEntry[] = citiesData as CityEntry[];

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

export function searchCities(query: string, limit = 10): CitySearchResult[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();

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
