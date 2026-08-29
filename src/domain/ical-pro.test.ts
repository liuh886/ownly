import { describe, expect, it } from 'vitest';
import {
  calculateDayTimeSlots,
  exportTripToICalProMarkdown,
  generateAiItineraryPlan,
  parseICalProMarkdown,
} from './ical-pro';
import type { PlannerTrip, PlannerTripPlace } from './planner';

const mockTrip: PlannerTrip = {
  schema_version: '0.1',
  type: 'trip',
  id: 'trip-tokyo-2026',
  title: 'Tokyo 2026 Autumn Tour',
  start_date: '2026-10-20',
  end_date: '2026-10-22',
  destinations: ['Tokyo', 'Asakusa', 'Shinjuku'],
  status: 'planning',
  currency: 'JPY',
  members: ['Alice', 'Bob'],
  created_at: '2026-08-20T00:00:00Z',
  updated_at: '2026-08-20T00:00:00Z',
};

const mockPlaces: PlannerTripPlace[] = [
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-sensoji',
    trip_id: 'trip-tokyo-2026',
    title: 'Senso-ji Temple',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?q=sensoji',
    kind: 'attraction',
    priority: 'must',
    tags: ['sightseeing', 'historic'],
    signals: [],
    risks: [],
    area: 'Asakusa',
    address: '2-3-1 Asakusa, Taito City, Tokyo',
    open_hours: '06:00 - 17:00',
    phone: '+81 3-3842-0181',
    observed_price: 'Free',
    observed_rating: 4.6,
    why: 'Oldest temple in Tokyo, iconic Kaminarimon gate',
    notes: 'Arrive early to avoid crowds',
    reservation_status: 'none',
    state: 'scheduled',
    scheduled_date: '2026-10-20',
    sort_order: 0,
    locked: true,
    coordinates: { lat: 35.7147, lng: 139.7966 },
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  },
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-skytree',
    trip_id: 'trip-tokyo-2026',
    title: 'Tokyo Skytree',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?q=skytree',
    kind: 'attraction',
    priority: 'want',
    tags: ['sightseeing', 'view'],
    signals: [],
    risks: [],
    area: 'Sumida',
    address: '1-1-2 Oshiage, Sumida City, Tokyo',
    open_hours: '10:00 - 21:00',
    observed_price: '¥3,100',
    observed_rating: 4.4,
    why: 'Panorama view of Tokyo city',
    reservation_status: 'none',
    state: 'scheduled',
    scheduled_date: '2026-10-20',
    sort_order: 1,
    locked: false,
    coordinates: { lat: 35.7100, lng: 139.8107 },
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  },
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-ramen',
    trip_id: 'trip-tokyo-2026',
    title: 'Rokurinsha Ramen',
    source_provider: 'tabelog',
    source_url: 'https://tabelog.com/tokyo/A1302/A130201/13093047/',
    kind: 'food',
    priority: 'must',
    tags: ['food', 'ramen'],
    signals: [],
    risks: [],
    area: 'Tokyo Station',
    address: 'Tokyo Station Ichibangai B1F',
    open_hours: '07:30 - 23:00',
    observed_price: '¥1,200',
    observed_rating: 3.78,
    why: 'Top-tier Tsukemen',
    reservation_status: 'none',
    state: 'candidate',
    coordinates: { lat: 35.6812, lng: 139.7671 },
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  },
  {
    schema_version: '0.1',
    type: 'trip_place',
    id: 'place-shinjuku-gyoen',
    trip_id: 'trip-tokyo-2026',
    title: 'Shinjuku Gyoen National Garden',
    source_provider: 'google_maps',
    source_url: 'https://maps.google.com/?q=shinjukugyoen',
    kind: 'attraction',
    priority: 'optional',
    tags: ['garden', 'nature'],
    signals: [],
    risks: [],
    area: 'Shinjuku',
    address: '11 Naitomachi, Shinjuku City, Tokyo',
    open_hours: '09:00 - 16:30, Closed on Monday',
    observed_price: '¥500',
    observed_rating: 4.5,
    reservation_status: 'none',
    state: 'candidate',
    coordinates: { lat: 35.6851, lng: 139.7100 },
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
  },
];

describe('iCal Pro & AI Planner Engine', () => {
  describe('calculateDayTimeSlots', () => {
    it('calculates sequential start and end times with buffer', () => {
      const slots = calculateDayTimeSlots([mockPlaces[0], mockPlaces[1]], {
        defaultStartTime: '09:00',
        transitBufferMinutes: 30,
      });

      expect(slots).toHaveLength(2);
      expect(slots[0].startTime).toBe('09:00');
      expect(slots[0].endTime).toBe('10:30'); // 90 min default attraction duration
      expect(slots[1].startTime).toBe('11:00'); // 10:30 + 30 min transit
      expect(slots[1].endTime).toBe('12:30');
    });

    it('respects preferred window time shift', () => {
      const afternoonPlace: PlannerTripPlace = {
        ...mockPlaces[0],
        preferred_window: 'afternoon',
      };
      const slots = calculateDayTimeSlots([afternoonPlace], {
        defaultStartTime: '09:00',
      });
      expect(slots[0].startTime).toBe('13:00');
      expect(slots[0].endTime).toBe('14:30');
    });
  });

  describe('exportTripToICalProMarkdown', () => {
    it('exports obsidian-ical-plugin-pro compliant markdown with VEVENT task syntax', () => {
      const md = exportTripToICalProMarkdown(mockTrip, mockPlaces, {
        includeAlarm: true,
        alarmMinutes: 15,
        language: 'zh',
      });

      expect(md).toContain('type: trip_itinerary');
      expect(md).toContain('## Day 1 · 2026-10-20');
      // Must-have task line with VEVENT timed format and alarm
      expect(md).toMatch(/- \[ \] 2026-10-20 09:00-10:30 🏰 Senso-ji Temple ⏫ ⏰ 15/);
      // Want task line without alarm
      expect(md).toMatch(/- \[ \] 2026-10-20 11:00-12:30 🏰 Tokyo Skytree 🔼/);
      // Indented context for VEVENT description
      expect(md).toContain('    - 📍 地址: 2-3-1 Asakusa, Taito City, Tokyo');
      expect(md).toContain('    - 💡 理由: Oldest temple in Tokyo, iconic Kaminarimon gate');
      expect(md).toContain('    - ⏰ 营业时间: 06:00 - 17:00');
      // Candidate pool section
      expect(md).toContain('## 💡 备选研究灵感池 (VTODO)');
      expect(md).toMatch(/- \[ \] 🍜 Rokurinsha Ramen ⏫/);
    });
  });

  describe('parseICalProMarkdown', () => {
    it('parses iCal Pro markdown back into structured planner places', () => {
      const md = exportTripToICalProMarkdown(mockTrip, mockPlaces);
      const parsed = parseICalProMarkdown(md, mockTrip.id);

      expect(parsed.length).toBeGreaterThanOrEqual(4);

      const sensoji = parsed.find((p) => p.title.includes('Senso-ji'));
      expect(sensoji).toBeDefined();
      expect(sensoji?.scheduled_date).toBe('2026-10-20');
      expect(sensoji?.state).toBe('scheduled');
      expect(sensoji?.priority).toBe('must');
      expect(sensoji?.address).toBe('2-3-1 Asakusa, Taito City, Tokyo');
      expect(sensoji?.open_hours).toBe('06:00 - 17:00');
      expect(sensoji?.why).toContain('Oldest temple');

      const skytree = parsed.find((p) => p.title.includes('Tokyo Skytree'));
      expect(skytree).toBeDefined();
      expect(skytree?.priority).toBe('want');

      const ramen = parsed.find((p) => p.title.includes('Rokurinsha'));
      expect(ramen).toBeDefined();
      expect(ramen?.state).toBe('candidate');
      expect(ramen?.priority).toBe('must');
    });

    it('parses inline date and time without headings', () => {
      const text = `
- [ ] 2026-11-05 14:00-16:00 ☕ Fuglen Tokyo ⏫ ⏰ 15
    - 📍 Address: 1-16-11 Tomigaya, Shibuya City
    - 💡 Why: Famous Nordic coffee
`;
      const parsed = parseICalProMarkdown(text, 'trip-123');
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe('Fuglen Tokyo');
      expect(parsed[0].kind).toBe('cafe');
      expect(parsed[0].priority).toBe('must');
      expect(parsed[0].scheduled_date).toBe('2026-11-05');
      expect(parsed[0].duration_minutes).toBe(120);
      expect(parsed[0].address).toBe('1-16-11 Tomigaya, Shibuya City');
      expect(parsed[0].why).toBe('Famous Nordic coffee');
    });
  });

  describe('generateAiItineraryPlan', () => {
    it('intelligently assigns candidate places across dates respecting priorities and locations', () => {
      const result = generateAiItineraryPlan(mockPlaces, mockTrip, {
        maxPlacesPerDay: 2,
        startTime: '09:00',
      });

      expect(result.scheduledCount).toBeGreaterThanOrEqual(3);
      expect(result.plannedPlaces.length).toBe(mockPlaces.length);

      // Day 1 has Senso-ji and Skytree (already scheduled/close)
      const day1 = result.plannedPlaces.filter((p) => p.scheduled_date === '2026-10-20');
      expect(day1.length).toBe(2);

      // Other candidates were distributed to Day 2 or Day 3
      const day2or3 = result.plannedPlaces.filter((p) => p.scheduled_date === '2026-10-21' || p.scheduled_date === '2026-10-22');
      expect(day2or3.length).toBeGreaterThanOrEqual(1);

      // Markdown output generated
      expect(result.icalProMarkdown).toContain('Tokyo 2026 Autumn Tour');
      expect(result.icalProMarkdown).toContain('2026-10-20');
    });
  });
});
