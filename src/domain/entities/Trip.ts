/**
 * P0: 唯一 Trip 真源
 */
export type TripId = string;

export interface Trip {
  id: TripId;
  title: string;
  status: 'planning' | 'active' | 'completed';
  start_date: string;
  end_date: string;
  destinations: string[];
  currency?: string;
  created_at: string;
  updated_at?: string;
}

export interface TripPlaceRef {
  tripId: TripId;
  placeId: string;
  sort_order?: number;
  scheduled_date?: string;
}
