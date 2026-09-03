// PR1 saved-list layer — placeholder for SavedPlaceCandidate (future)
// Currently saved-list parsing lives in content.ts fetchGoogleMapsEntityList
export interface SavedPlaceCandidate {
  title: string;
  url?: string;
  featureId?: string;
  rating?: number;
  reviewCount?: number;
}
