import type { PlannerTripPlace } from '../domain/planner';
import { today } from './utils';

export async function resolveGoogleMapsListByUrl(rawUrl: string, activeTrip?: any): Promise<PlannerTripPlace[]> {
  try {
    let finalUrl = rawUrl;
    if (rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('goo.gl/maps')) {
      try {
        const res = await fetch(rawUrl, { redirect: 'follow' });
        finalUrl = res.url;
      } catch (e: any) {
        throw new Error(`短链接跳转失败: ${e.message}`);
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
    const listName = data[0]?.[4] || 'Google Maps 收藏列表';
    const rawItems = data[0]?.[8];
    if (Array.isArray(rawItems)) {
          const now = new Date().toISOString();
          
          const combinedTags = Array.from(new Set([...(activeTrip?.tags ?? []), listName]));
          const places: PlannerTripPlace[] = [];
          for (const item of rawItems) {
            const placeInfo = item[1];
            const title = item[2] || (placeInfo && placeInfo[2]);
            if (!title) continue;
            const address = placeInfo ? placeInfo[4] : undefined;
            const userNote = item[3] || undefined;
            const sourceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;
            places.push({
              schema_version: '0.1',
              type: 'trip_place',
              id: crypto.randomUUID(),
              trip_id: state.activeTripId!,
              title: String(title).trim(),
              source_provider: 'google_maps',
              source_url: sourceUrl,
              kind: inferPlaceKind(undefined),
              priority: 'want',
              tags: combinedTags,
              why: userNote,
              signals: [],
              risks: [],
              notes: userNote,
              address,
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
  } catch (err: any) {
    console.warn('Could not resolve google maps list link:', err);
    throw err; // Propagate the error so caller can catch and log it
  }
}