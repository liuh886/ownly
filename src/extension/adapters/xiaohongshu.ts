import type { PageAdapter, CurrentResearchPlace, DetectedSavedList } from './types';
import { inferPlaceKind } from '../../domain/planner';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  isFakePlaceLabel,
  isJunkNavigationText,
} from '../utils';
import { detectCurrencyFromPage } from '../currency-detector';
import { injectInlineCaptureButton } from '../ui/inline-capture-button';

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
  const noteId = /(?:explore|discovery\/item)\/([a-zA-Z0-9_-]+)/.exec(sourceUrl)?.[1];
  const kind = inferPlaceKind([title, locationTag, summary].filter(Boolean).join(' '));

  return {
    title,
    sourceUrl,
    sourceProvider: 'xiaohongshu',
    sourcePlaceId: noteId,
    kind,
    category: '小红书灵感',
    detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined, hintCurrency, overrideCurrency) ?? 'CNY',
    summary: locationTag ? `来自笔记「${noteTitle}」· 地标：${locationTag}` : `来自小红书笔记「${noteTitle}」`,
    address,
    coordinates: extractXiaohongshuCoordinates(),
    types: ['point_of_interest', 'establishment'],
  };
}

/**
 * Best-effort coordinates from the note's location tag subtree (link hrefs
 * or embedded data attributes). Notes often carry no geo at all — undefined
 * then, and the query-pin flow resolves via text search instead.
 */
export function extractXiaohongshuCoordinates(): { lat: number; lng: number } | undefined {
  const locEl = document.querySelector<HTMLElement>('.location-item, .geo');
  const hay = (locEl?.outerHTML || '').slice(0, 4000);
  if (!hay) return undefined;
  const patterns = [
    /(?:lat(?:itude)?|y)[=:](-?\d+(?:\.\d+)?)[,&; ]+(?:lng|long(?:itude)?|x)[=:](-?\d+(?:\.\d+)?)/i,
    /geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /"(?:latitude|lat)"\s*:\s*(-?\d+(?:\.\d+)?)[^}]{0,60}"(?:longitude|lng)"\s*:\s*(-?\d+(?:\.\d+)?)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(hay);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      (Math.abs(lat) > 0.01 || Math.abs(lng) > 0.01)
    ) {
      return { lat, lng };
    }
  }
  return undefined;
}

export function detectXiaohongshuNoteList(): DetectedSavedList | null {
  const noteTitle = extractXiaohongshuPlace()?.title || document.title.replace(/ - 小红书$/, '');
  const noteId = /(?:explore|discovery\/item)\/([a-zA-Z0-9_-]+)/.exec(window.location.href)?.[1];
  const found = new Map<string, CurrentResearchPlace>();

  const pushPlace = (rawTitle: string) => {
    const rawClean = cleanExtractedText(rawTitle).slice(0, 60);
    const title = cleanTitleForSearch(rawClean);
    if (!title || title.length < 2 || isJunkNavigationText(title) || isFakePlaceLabel(title)) return;
    const key = title.toLowerCase();
    if (found.has(key)) return;

    const kind = inferPlaceKind(title);

    found.set(key, {
      title,
      sourceUrl: window.location.href,
      sourceProvider: 'xiaohongshu',
      sourcePlaceId: noteId ? `${noteId}-${key}` : undefined,
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

/**
 * True on a note-detail page (not feed/profile/search). Exported for tests.
 */
export function isXiaohongshuNotePage(url = window.location.href): boolean {
  return /\/(explore|discovery\/item)\/[a-zA-Z0-9_-]+/.test(url);
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

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;
    // Only on note-detail pages: explore feed, profile, and search pages all
    // carry generic .title nodes where a capture button makes no sense.
    if (!isXiaohongshuNotePage()) return;

    const titleEl = document.querySelector<HTMLElement>('#detail-title, .note-detail-mask .title, .note-container .title');
    if (titleEl) {
      const container = (titleEl.parentElement || titleEl) as HTMLElement;
      if (container.dataset.ownlyCardInjected !== 'true' && !container.querySelector('.ownly-inline-fab-root')) {
        const place = this.extractPlace();
        if (place && place.title) {
          injectInlineCaptureButton({
            container,
            anchor: titleEl,
            position: 'before',
            customStyle: 'margin-right: 8px; margin-bottom: 4px;',
            getPlace: () => this.extractPlace() || place,
          });
        }
      }
    }
  }
}

