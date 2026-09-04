import type { PageAdapter, CurrentResearchPlace, DetectedSavedList } from './types';
import { inferPlaceKind } from '../../domain/planner';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  isFakePlaceLabel,
  isJunkNavigationText,
} from '../utils';
import { detectCurrencyFromPage } from '../currency-detector';

export function extractXiaohongshuPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('#detail-title, .title, meta[property="og:title"]');
  const noteTitle = titleEl instanceof HTMLMetaElement ? titleEl.content : titleEl?.textContent?.trim();
  if (!noteTitle) return null;

  const locEl = document.querySelector<HTMLElement>('.location-item, .geo, a[href*="/search_result?keyword="]');
  const locationTag = locEl?.textContent?.trim();

  const rawTitle = locationTag || noteTitle;
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle).slice(0, 60));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const descEl = document.querySelector<HTMLElement>('#detail-desc, .desc, .content');
  const summary = descEl?.textContent?.trim().slice(0, 200) || `来自小红书笔记「${noteTitle}」`;

  const address = locationTag && locationTag !== title ? locationTag : undefined;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title + (address ? ' ' + address : ''))}&hl=zh-CN`;

  const kind = inferPlaceKind([title, locationTag, summary].filter(Boolean).join(' '));

  return {
    title,
    sourceUrl: mapsUrl,
    sourceProvider: 'google_maps',
    kind,
    category: '小红书灵感',
    detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined, hintCurrency, overrideCurrency) ?? 'CNY',
    summary: locationTag ? `来自笔记「${noteTitle}」· 地标：${locationTag}` : `来自小红书笔记「${noteTitle}」`,
    address,
    types: ['point_of_interest', 'establishment'],
  };
}

export function detectXiaohongshuNoteList(): DetectedSavedList | null {
  const noteTitle = extractXiaohongshuPlace()?.title || document.title.replace(/ - 小红书$/, '');
  const found = new Map<string, CurrentResearchPlace>();

  const pushPlace = (rawTitle: string) => {
    const rawClean = cleanExtractedText(rawTitle).slice(0, 60);
    const title = cleanTitleForSearch(rawClean);
    if (!title || title.length < 2 || isJunkNavigationText(title) || isFakePlaceLabel(title)) return;
    const key = title.toLowerCase();
    if (found.has(key)) return;

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}&hl=zh-CN`;
    const kind = inferPlaceKind(title);

    found.set(key, {
      title,
      sourceUrl: mapsUrl,
      sourceProvider: 'google_maps',
      kind,
      category: '小红书笔记地点',
      summary: `来自笔记「${noteTitle}」`,
      types: ['point_of_interest', 'establishment'],
    });
  };

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.location-item, .geo, a[href*="/search_result?keyword="], a[href*="/explore/"] .tag, #detail-desc a'))) {
    pushPlace(el.textContent?.trim() || '');
  }

  const descText = document.querySelector<HTMLElement>('#detail-desc, .desc, .content')?.textContent || '';
  for (const m of descText.matchAll(/📍\s*([^\n📍#]{2,30})/g)) pushPlace(m[1]);
  for (const m of descText.matchAll(/#([^#\s]{2,20})/g)) {
    if (/店|餐|cafe|咖啡|景点|hotel|bar/i.test(m[1])) pushPlace(m[1]);
  }

  if (found.size === 0) return null;
  return {
    listName: `📕 ${noteTitle}`,
    listUrl: window.location.href,
    detectedCurrency: undefined,
    places: [...found.values()],
  };
}

export class XiaohongshuAdapter implements PageAdapter {
  readonly id = 'xiaohongshu' as const;
  readonly name = 'Xiaohongshu';

  matches(url: string): boolean {
    return /xiaohongshu\.com|xhslink\.com/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    return extractXiaohongshuPlace(overrideCurrency, hintCurrency);
  }

  detectSavedList(): DetectedSavedList | null {
    return detectXiaohongshuNoteList();
  }
}
