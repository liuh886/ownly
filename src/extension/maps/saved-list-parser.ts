// PR5 saved-list parser — true owner of Google Maps saved-list interpretation
// content.ts remains DOM access only; this module owns interpretation + coverage + snapshot.

import {
  cleanExtractedText,
  extractFeatureIdFromUrl,
  findEntityListCategory,
  findEntityListPlaceId,
  isFakePlaceLabel,
  isJunkNavigationText,
  parseEntityListCoordinates,
} from '../utils';
import { PLACE_PARSER } from '../place-parser';
import { detectPageCurrency } from '../currency-detector';
import { inferPlaceKind } from '../../domain/planner';
import {
  extractGoogleMapsResearchFromHtml,
  googleMapsDetailUrlFromSourceId,
  type GoogleMapsResearchFacts,
} from '../google-maps-research';

// ------------------------------------------------------------------
// Public contracts — user requested shape
// ------------------------------------------------------------------

export interface SavedPlaceCandidate {
  title: string;
  url: string; // sourceUrl
  featureId?: string; // canonical 0x…:0x…
  sourcePlaceId?: string; // alias
  kind?: string;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  address?: string;
  userNote?: string;
  summary?: string;
  coordinates?: { lat: number; lng: number };
  detectedCurrency?: string;
  types?: string[];
  sourceProvider?: 'google_maps';
}

export interface SavedListCoverage {
  title: number;
  url: number;
  id: number;
}

export interface SavedListResult {
  places: SavedPlaceCandidate[];
  coverage: SavedListCoverage;
  rawCount: number;
  failed: Array<{ reason: string; rawTitle?: string }>;
}

export interface ExtractionSnapshot {
  url: string;
  timestamp: string; // ISO
  parser: 'saved-list' | 'entitylist' | 'dom-scan' | 'hybrid';
  found: number;
  success: number;
  failed: Array<{ reason: string; rawTitle?: string }>;
  coverage: SavedListCoverage;
  durationMs?: number;
}

export interface EntityListParseInput {
  listName: string;
  listUrl: string;
  rawItems: unknown[];
  origin: string;
  overrideCurrency?: string;
}

// ------------------------------------------------------------------
// Helpers migrated from content.ts — pure, testable
// ------------------------------------------------------------------

function isGenericNavigationTitle(text: string): boolean {
  const norm = text.trim().toLowerCase();
  return /^(google|google maps|google 地图|directions|路线|保存|已保存|saved|share|分享|搜索|search|返回|back|菜单|menu|overview|概览|reviews|评价|photos|照片|about|关于)$/i.test(
    norm,
  );
}

function detectCurrencyForPlace(sourceUrl: string, priceLevel?: string, hint?: string, override?: string): string | undefined {
  const r = detectPageCurrency({
    url: sourceUrl,
    priceText: priceLevel,
    hintCurrency: hint,
    overrideCurrency: override,
    doc: typeof document !== 'undefined' ? document : undefined,
  });
  return r.currency;
}

// ------------------------------------------------------------------
// DOM-card interpretation — pure; content.ts feeds raw DOM strings
// ------------------------------------------------------------------

export interface RawDomCard {
  rawTitle: string;
  href: string;
  ratingText?: string;
  infoTexts: string[];
  addressRaw?: string;
  noteRaw?: string;
  origin?: string;
  overrideCurrency?: string;
}

export function interpretRawDomCard(raw: RawDomCard): { candidate?: SavedPlaceCandidate; failedReason?: string } {
  const cleanTitle = cleanExtractedText(raw.rawTitle);
  if (!cleanTitle || cleanTitle.length < 2 || cleanTitle.length > 80 || isGenericNavigationTitle(cleanTitle) || isJunkNavigationText(cleanTitle) || isFakePlaceLabel(cleanTitle)) {
    return { failedReason: !cleanTitle ? 'no title' : isFakePlaceLabel(cleanTitle) ? 'fake label' : isJunkNavigationText(cleanTitle) ? 'junk navigation' : 'invalid title' };
  }
  if (!raw.href && !cleanTitle) return { failedReason: 'no url' };

  // rating
  let rating: number | undefined;
  if (raw.ratingText) rating = PLACE_PARSER.parseRating(raw.ratingText);

  // subtitle decomposition across info lines
  let sub: ReturnType<typeof PLACE_PARSER.parseSubtitleInfo> = {};
  if (raw.infoTexts.length === 0) {
    sub = PLACE_PARSER.parseSubtitleInfo(`${cleanTitle} ${raw.addressRaw ?? ''}`);
  } else {
    for (const t of raw.infoTexts) {
      if (!t) continue;
      const p = PLACE_PARSER.parseSubtitleInfo(t);
      sub = {
        rating: sub.rating ?? p.rating,
        reviewCount: sub.reviewCount ?? p.reviewCount,
        category: sub.category ?? p.category,
        priceLevel: sub.priceLevel ?? p.priceLevel,
        openStatus: sub.openStatus ?? p.openStatus,
        area: sub.area ?? p.area,
      };
    }
  }
  // direct rating fallback
  if (rating !== undefined) sub.rating = rating;

  // address / note
  const address = raw.addressRaw ? cleanExtractedText(raw.addressRaw) : (sub.area || undefined);
  const userNote = raw.noteRaw && !isJunkNavigationText(raw.noteRaw) ? cleanExtractedText(raw.noteRaw) : undefined;

  const href = raw.href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanTitle)}`;
  const featureId = extractFeatureIdFromUrl(href);
  const rawKind = inferPlaceKind((sub.category || '') + ' ' + cleanTitle + ' ' + (address || ''));
  const kind = rawKind;

  // lightweight coordinates from URL if present
  let coordinates: { lat: number; lng: number } | undefined;
  try {
    const u = new URL(href);
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(href) || /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(href);
    if (at) {
      // @ path is lat,lng ; !3d!4d is lat,lng as well
      const lat = Number(at[1]);
      const lng = Number(at[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) coordinates = { lat, lng };
    } else if (u.searchParams.get('query')) {
      // no coords available — leave undefined; enrichment will resolve later
    }
  } catch {}

  const candidate: SavedPlaceCandidate = {
    title: cleanTitle,
    url: href,
    featureId,
    sourcePlaceId: featureId,
    kind,
    rating: sub.rating,
    reviewCount: sub.reviewCount,
    category: sub.category,
    priceLevel: sub.priceLevel,
    address,
    userNote,
    summary: userNote,
    coordinates,
    detectedCurrency: detectCurrencyForPlace(href, sub.priceLevel, undefined, raw.overrideCurrency),
    types: undefined,
    sourceProvider: 'google_maps',
  };
  // keep sourceKind inferred strictly via domain helper — not stored but used by caller

  // Enforce minimal completeness: must have at least title+url
  if (!candidate.title) return { failedReason: 'no title' };
  if (!candidate.url) return { failedReason: 'no url' };
  return { candidate };
}

export function interpretDomBatch(cards: RawDomCard[]): SavedListResult {
  const places: SavedPlaceCandidate[] = [];
  const failed: SavedListResult['failed'] = [];
  const seen = new Set<string>();
  const coverage: SavedListCoverage = { title: 0, url: 0, id: 0 };
  for (const card of cards) {
    const { candidate, failedReason } = interpretRawDomCard(card);
    if (!candidate) {
      failed.push({ reason: failedReason || 'unknown', rawTitle: card.rawTitle?.slice(0, 60) });
      continue;
    }
    const key = candidate.featureId || candidate.url || `unresolved:${candidate.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (candidate.title) coverage.title += 1;
    if (candidate.url) coverage.url += 1;
    if (candidate.featureId) coverage.id += 1;
    places.push(candidate);
  }
  return { places, coverage, rawCount: cards.length, failed };
}

// ------------------------------------------------------------------
// EntityList interpretation — pure; content.ts only fetches + hands rawItems
// ------------------------------------------------------------------

export function buildFromEntityList(input: EntityListParseInput): SavedListResult {
  const places: SavedPlaceCandidate[] = [];
  const failed: SavedListResult['failed'] = [];
  const coverage: SavedListCoverage = { title: 0, url: 0, id: 0 };

  for (const item of input.rawItems) {
    if (!Array.isArray(item)) {
      failed.push({ reason: 'invalid item shape' });
      continue;
    }
    const placeInfo = (item as unknown[])[1];
    const rawTitle = (item as unknown[])[2] || (placeInfo && (placeInfo as unknown[])[2]);
    if (!rawTitle || typeof rawTitle !== 'string') {
      failed.push({ reason: 'no title' });
      continue;
    }
    const title = cleanExtractedText(rawTitle);
    if (!title || isJunkNavigationText(title) || isFakePlaceLabel(title)) {
      failed.push({ reason: !title ? 'no title' : 'junk/fake', rawTitle: rawTitle.slice(0, 40) });
      continue;
    }
    const rawAddress = placeInfo ? (placeInfo as unknown[])[4] : undefined;
    const address = typeof rawAddress === 'string' ? cleanExtractedText(rawAddress) : undefined;
    const rawNote = (item as unknown[])[3] as string | undefined;
    const userNote = rawNote && !isJunkNavigationText(rawNote) ? cleanExtractedText(rawNote) : undefined;
    const coordinates = parseEntityListCoordinates(placeInfo);
    const sourcePlaceId = findEntityListPlaceId(item);
    const sourceUrl = googleMapsDetailUrlFromSourceId(sourcePlaceId, title, input.origin) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
    const research = PLACE_PARSER.extractEntityListResearch(item, title);
    const category = research.category || findEntityListCategory(item, title);
    const priceLevel = research.priceLevel;
    const detectedCurrency = detectCurrencyForPlace(input.listUrl, priceLevel, undefined, input.overrideCurrency);
    const kind = inferPlaceKind((category || '') + ' ' + title + ' ' + (address || ''));

    const cand: SavedPlaceCandidate = {
      title,
      url: sourceUrl,
      featureId: sourcePlaceId,
      sourcePlaceId,
      kind,
      rating: research.rating,
      reviewCount: research.reviewCount,
      category,
      priceLevel,
      address,
      userNote,
      summary: userNote,
      coordinates,
      detectedCurrency,
      types: research.types,
      sourceProvider: 'google_maps',
    };
    if (cand.title) coverage.title += 1;
    if (cand.url) coverage.url += 1;
    if (cand.featureId) coverage.id += 1;
    places.push(cand);
  }

  return { places, coverage, rawCount: input.rawItems.length, failed };
}

// ------------------------------------------------------------------
// Snapshot factory — used by content.ts after each list resolve
// ------------------------------------------------------------------

export function createSnapshot(params: {
  url: string;
  parser: ExtractionSnapshot['parser'];
  result: SavedListResult;
  durationMs?: number;
}): ExtractionSnapshot {
  return {
    url: params.url,
    timestamp: new Date().toISOString(),
    parser: params.parser,
    found: params.result.rawCount,
    success: params.result.places.length,
    failed: params.result.failed.slice(0, 20),
    coverage: params.result.coverage,
    durationMs: params.durationMs,
  };
}

// ------------------------------------------------------------------
// Back-compat re-exports for existing maps consumers
// ------------------------------------------------------------------

export type { GoogleMapsResearchFacts };
export { extractGoogleMapsPreviewFacts } from '../google-maps-research';
export { extractGoogleMapsResearchFromHtml } from '../google-maps-research';
export { featureIdToCid, googleMapsDetailUrlFromSourceId, googleMapsPreviewPlaceUrl } from '../google-maps-research';
