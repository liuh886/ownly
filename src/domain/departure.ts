import type { PlannerTripPlace } from './planner';

// ── Time helpers ────────────────────────────────────────────────────────────

export function daysUntil(dateISO: string, now = new Date()): number {
  const cleanDate = dateISO.includes('T') ? dateISO.split('T')[0] : dateISO;
  const target = new Date(cleanDate + 'T00:00:00Z');
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

// ── Weather (Open-Meteo, no API key) ────────────────────────────────────────

export interface DailyForecast {
  date: string;
  temp_max: number;
  temp_min: number;
  precipitation_mm: number;
  /** WMO weather interpretation code (0=clear, 61=rain, 71=snow, etc.) */
  weather_code: number;
}

export interface WeatherSummary {
  is_relevant: boolean;
  days_ahead: number;
  forecasts: Array<DailyForecast & { is_rainy: boolean; label: string }>;
}

const WEATHER_RELEVANT_WINDOW = 16;
const WEATHER_LABELS: Record<number, string> = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌧️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '⛈️',
  71: '🌨️', 73: '🌨️', 75: '❄️', 77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export function weatherLabel(code: number): string {
  return WEATHER_LABELS[code] ?? '🌡️';
}

/** Only fetch weather when trip starts within the reliable forecast window. */
export function isWeatherRelevant(tripStartDate: string, now = new Date()): boolean {
  const d = daysUntil(tripStartDate, now);
  return d >= 0 && d <= WEATHER_RELEVANT_WINDOW;
}

export function summarizeWeather(raw: OpenMeteoResponse): WeatherSummary['forecasts'] {
  const daily = raw.daily;
  if (!daily?.time) return [];
  return daily.time.map((date, i) => ({
    date,
    temp_max: Math.round(daily.temperature_2m_max?.[i] ?? 0),
    temp_min: Math.round(daily.temperature_2m_min?.[i] ?? 0),
    precipitation_mm: daily.precipitation_sum?.[i] ?? 0,
    weather_code: daily.weather_code?.[i] ?? 0,
    is_rainy: (daily.precipitation_sum?.[i] ?? 0) > 0.5 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(daily.weather_code?.[i] ?? 0),
    label: weatherLabel(daily.weather_code?.[i] ?? 0),
  }));
}

export interface OpenMeteoResponse {
  daily?: {
    time: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
    weather_code?: number[];
  };
}

export async function fetchWeather(lat: number, lng: number, startDate: string, endDate: string): Promise<WeatherSummary['forecasts']> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code`
      + `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return summarizeWeather(await res.json());
  } catch {
    return [];
  }
}

// ── Urgency detection ───────────────────────────────────────────────────────

export interface UrgencyItem {
  place_id: string;
  title: string;
  kind: 'reservation_lead_time' | 'stale_price' | 'unbooked_stay';
  message: string;
  severity: 'urgent' | 'warning';
}

const LEAD_TIME_PATTERNS: RegExp[] = [
  /提前\s*(\d+)\s*天/,
  /advance\s*(\d+)\s*days?/i,
  /提前\s*(\d+)\s*周/,
  /(\d+)\s*weeks?\s+advance/i,
];

function extractLeadTimeDays(riskText: string): number | null {
  for (const pattern of LEAD_TIME_PATTERNS) {
    const m = pattern.exec(riskText);
    if (m) {
      const num = parseInt(m[1], 10);
      if (/周|week/i.test(m[0])) return num * 7;
      return num;
    }
  }
  // Known phrases without explicit numbers
  if (/提前预约|book.*advance|予約必要/i.test(riskText)) return 14;
  if (/排队|queue/i.test(riskText)) return null;
  return null;
}

const STALE_PRICE_DAYS = 30;

export function computeUrgencies(
  places: PlannerTripPlace[],
  tripStart: string,
  now = new Date(),
): UrgencyItem[] {
  const d = daysUntil(tripStart, now);
  if (d < 0 || d > 90) return []; // only relevant before/during trip, max 90d out

  const result: UrgencyItem[] = [];

  for (const p of places) {
    if (p.state === 'dropped') continue;

    // Reservation lead time: only relevant when departure approaches the lead-time window
    if (p.risks && p.reservation_status !== 'booked') {
      for (const risk of p.risks) {
        const lead = extractLeadTimeDays(risk);
        // Only surface when within 2× the lead time (e.g. 14-day booking → show from 28 days out)
        if (lead !== null && d >= 0 && d <= lead * 2) {
          const isLate = d < lead;
          result.push({
            place_id: p.id,
            title: p.title,
            kind: 'reservation_lead_time',
            message: `${risk} — ${isLate ? `已过建议预约期限（提前 ${lead} 天），距出发仅 ${d} 天` : `距出发 ${d} 天，建议尽快预约`}`,
            severity: isLate ? 'urgent' : 'warning',
          });
          break;
        }
      }
    }

    // Unbooked stay within 14 days of departure
    if (p.kind === 'stay' && p.state === 'candidate' && d <= 14) {
      result.push({
        place_id: p.id,
        title: p.title,
        kind: 'unbooked_stay',
        message: `${p.title} 仍在候选池，出发仅 ${d} 天`,
        severity: d <= 7 ? 'urgent' : 'warning',
      });
    }

    // Stale price observation
    if (p.observed_at && d <= 30) {
      const age = Math.round((now.getTime() - new Date(p.observed_at).getTime()) / 86400000);
      if (age > STALE_PRICE_DAYS) {
        result.push({
          place_id: p.id,
          title: p.title,
          kind: 'stale_price',
          message: `${p.title} 价格采集于 ${age} 天前，可能已变动`,
          severity: 'warning',
        });
      }
    }
  }

  return result.sort((a, b) => (a.severity === 'urgent' ? -1 : 1) - (b.severity === 'urgent' ? -1 : 1));
}
