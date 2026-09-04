import type { PlannerPlaceKind, PlannerPlaceSourceProvider } from '../../domain/planner';
import type { HotelPropertyFacts } from '../utils';

export interface CurrentResearchPlace {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  kind?: PlannerPlaceKind;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  area?: string;
  summary?: string;
  userNote?: string;
  openStatus?: string;
  openHours?: string;
  website?: string;
  coordinates?: { lat: number; lng: number };
  sourcePlaceId?: string;
  tierNote?: string;
  phone?: string;
  plusCode?: string;
  menuUrl?: string;
  reservationUrl?: string;
  reviewTopics?: string[];
  types?: string[];
  hotelFacts?: HotelPropertyFacts;
}

export interface DetectedSavedList {
  listName: string;
  listUrl: string;
  detectedCurrency?: string;
  places: CurrentResearchPlace[];
  truncated?: boolean;
}

export interface SavedListCardSummary {
  listId?: string;
  listName: string;
  count?: number;
  url?: string;
}

export interface PageAdapter {
  readonly id: PlannerPlaceSourceProvider;
  readonly name: string;
  matches(url: string): boolean;
  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null;
  detectSavedList?(overrideCurrency?: string): DetectedSavedList | null | Promise<DetectedSavedList | null>;
  initInlineButtons?(): void;
}
