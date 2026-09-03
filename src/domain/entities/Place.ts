/**
 * P0: 唯一 Place 真源 — 统一 Capture 与 Planner 的地点模型
 * 现有 CapturePlace / PlannerTripPlace 逐步收敛至此，保留 re-export 兼容
 */
export type PlaceId = string;

export interface PlaceSource {
  provider: 'google_maps' | 'booking' | 'tabelog' | 'xiaohongshu' | 'other';
  place_id?: string;
  url: string;
  category?: string;
  types?: string[];
}

export interface Place {
  id: PlaceId;
  title: string;
  source: PlaceSource;
  address?: string;
  coordinates?: { lat: number; lng: number };
  rating?: number;
  review_count?: number;
  price?: { raw?: string; currency?: string; min?: number; max?: number; unit?: string; level?: number };
  open_hours?: string;
  phone?: string;
  plus_code?: string;
  inferred_kind?: 'attraction' | 'food' | 'cafe' | 'stay' | 'shopping' | 'transit' | 'experience' | 'service' | 'other';
  captured_at: string;
  updated_at?: string;
}
