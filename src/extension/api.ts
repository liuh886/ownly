import { ensurePlaceKindTag, inferPlaceKind, normalizeObservedPrice, type CaptureContext, type PlannerTripPlace } from '../domain/planner';
import { cleanExtractedText, findEntityListCategory, findEntityListPlaceId, isJunkNavigationText, parseEntityListCoordinates, today } from './utils';
import { PLACE_PARSER } from './place-parser';

export interface ResolvedListRef {
  finalUrl: string;
  listId: string;
}

/**
 * Expands short links and extracts the list id without hitting the entitylist
 * endpoint — safe to call from any extension context.
 */
export async function expandAndExtractListId(rawUrl: string): Promise<ResolvedListRef | null> {
  let finalUrl = rawUrl;
  if (rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('goo.gl/maps')) {
    try {
      const res = await fetch(rawUrl, { redirect: 'follow' });
      finalUrl = res.url;
    } catch (e) {
      console.warn('Short link expansion failed:', e);
      return null;
    }
  }
  const match = /!2s([A-Za-z0-9_-]{20,})|\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(finalUrl);
  const listId = match?.[1] || match?.[2];
  return listId ? { finalUrl, listId } : null;
}

export async function resolveGoogleMapsListByUrl(rawUrl: string, activeContext?: CaptureContext): Promise<PlannerTripPlace[]> {
  try {
    let finalUrl = rawUrl;
    if (rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('goo.gl/maps')) {
      try {
        const res = await fetch(rawUrl, { redirect: 'follow' });
        finalUrl = res.url;
      } catch (e) {
        throw new Error(`短链接跳转失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const listIdMatch = /!2s([A-Za-z0-9_-]{20,})|\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(finalUrl);
    const listId = listIdMatch?.[1] || listIdMatch?.[2];
    if (!listId) {
      throw new Error(`无法从链接中提取列表 ID: ${finalUrl}`);
    }
    const fetchUrl = `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=zh-CN&pb=!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
    const res = await fetch(fetchUrl);
    if (!res.ok) {
      throw new Error(`获取列表失败, HTTP ${res.status}`);
    }
    const raw = await res.text();
    const cleanJson = raw.replace(/^\)\]\}'\s*/, '');
    const data = JSON.parse(cleanJson);
    const listName = cleanExtractedText(data[0]?.[4] || 'Google Maps 收藏列表');
    const rawItems = data[0]?.[8];
    if (Array.isArray(rawItems)) {
      const now = new Date().toISOString();
      const combinedTags = Array.from(new Set([...(activeContext?.tags ?? []), listName]));
      const places: PlannerTripPlace[] = [];
      for (const item of rawItems) {
        const placeInfo = item[1];
        const rawTitle = item[2] || (placeInfo && placeInfo[2]);
        if (!rawTitle) continue;
        const placeTitle = cleanExtractedText(rawTitle);
        if (!placeTitle || isJunkNavigationText(placeTitle)) continue;

        const rawAddress = placeInfo ? placeInfo[4] : undefined;
        const address = rawAddress ? cleanExtractedText(rawAddress) : undefined;
        const rawNote = item[3] || undefined;
        const userNote = (rawNote && !isJunkNavigationText(rawNote)) ? cleanExtractedText(rawNote) : undefined;

        const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeTitle)}`;
        const research = PLACE_PARSER.extractEntityListResearch(item, placeTitle);
        const sourceCategory = research.category || findEntityListCategory(item, placeTitle);
        const normalizedPrice = normalizeObservedPrice(research.priceLevel);
        const placeArea = (address && address.includes(','))
          ? address.split(/[,，]/).map((p: string) => p.trim()).filter(Boolean)[0]
          : undefined;

        const inferredKind = inferPlaceKind([placeTitle, sourceCategory, address, ...(research.types || [])].filter(Boolean).join(' '));
        places.push({
          schema_version: '0.1',
          type: 'trip_place',
          id: crypto.randomUUID(),
          trip_id: activeContext?.tripId || '',
          title: placeTitle,
          source_provider: 'google_maps',
          source_url: sourceUrl,
          source_category: sourceCategory,
          kind: inferredKind,
          area: placeArea,
          priority: 'want',
          tags: ensurePlaceKindTag(combinedTags, inferredKind),
          why: userNote,
          signals: [],
          risks: [],
          notes: userNote,
          observed_rating: research.rating,
          observed_review_count: research.reviewCount,
          observed_price: research.priceLevel,
          price_currency: normalizedPrice?.currency,
          price_min: normalizedPrice?.min,
          price_max: normalizedPrice?.max,
          price_unit: normalizedPrice?.unit,
          price_level: normalizedPrice?.level,
          types: research.types,
          address,
          coordinates: parseEntityListCoordinates(placeInfo),
          source_place_id: findEntityListPlaceId(item),
          observed_at: today(),
          reservation_status: 'none',
          state: 'candidate',
          created_at: now,
          updated_at: now,
        });
      }
      return places;
    } else {
      throw new Error('解析列表失败：接口未返回项目数据');
    }
  } catch (err) {
    console.warn('Could not resolve google maps list link:', err);
    throw err;
  }
}