import { inferSourceProvider, type PlannerPlaceSourceProvider } from '../domain/planner';

export interface CurrentResearchPlace {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  address?: string;
  summary?: string;
  openStatus?: string;
  website?: string;
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const match = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
    if (!match?.[1]) return '';
    return decodeURIComponent(match[1].replaceAll('+', ' ')).trim();
  } catch {
    return '';
  }
}

function extractRating(): number | undefined {
  const ratingEl = document.querySelector<HTMLElement>('div.F7nice span[aria-hidden="true"]');
  if (ratingEl?.textContent) {
    const val = parseFloat(ratingEl.textContent.replace(',', '.').trim());
    if (Number.isFinite(val) && val >= 1 && val <= 5) return val;
  }
  const ariaEl = document.querySelector<HTMLElement>('span.ceNzKf, span[aria-label*="star"], span[aria-label*="星"]');
  if (ariaEl) {
    const aria = ariaEl.getAttribute('aria-label') || '';
    const match = /(\d+(\.\d+)?)/.exec(aria);
    if (match?.[1]) {
      const val = parseFloat(match[1]);
      if (Number.isFinite(val) && val >= 1 && val <= 5) return val;
    }
  }
  return undefined;
}

function extractReviewCount(): number | undefined {
  const countEl = document.querySelector<HTMLElement>('div.F7nice span:last-child, span[aria-label*="reviews"], span[aria-label*="评价"]');
  if (countEl) {
    const text = countEl.textContent || countEl.getAttribute('aria-label') || '';
    const cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned) {
      const count = parseInt(cleaned, 10);
      if (Number.isFinite(count) && count > 0) return count;
    }
  }
  return undefined;
}

function extractCategory(): string | undefined {
  const catBtn = document.querySelector<HTMLElement>('button.DkEaL, button[jsaction*="category"], div.fontBodyMedium button[jsaction*="pane"]');
  if (catBtn?.textContent) {
    const cat = catBtn.textContent.trim();
    if (cat && cat.length < 50) return cat;
  }
  return undefined;
}

function extractPrice(): string | undefined {
  const priceEl = document.querySelector<HTMLElement>('span[aria-label*="价格"], span[aria-label*="Price"], span.fontBodyMedium span[aria-label*="£"], span.fontBodyMedium span[aria-label*="$"], span.fontBodyMedium span[aria-label*="¥"]');
  if (priceEl) {
    const text = (priceEl.getAttribute('aria-label') || priceEl.textContent || '').trim();
    if (text) return text;
  }
  return undefined;
}

function extractAddress(): string | undefined {
  const addrEl = document.querySelector<HTMLElement>('button[data-item-id="address"] div.fontBodyMedium, button[data-item-id="address"], div[aria-label*="地址"], div[aria-label*="Address"]');
  if (addrEl?.textContent) {
    const addr = addrEl.textContent.trim();
    if (addr && addr.length < 150) return addr;
  }
  return undefined;
}

function extractSummary(): string | undefined {
  const summaryEl = document.querySelector<HTMLElement>('div.PYvSYb, div.WeS02d, div[class*="editorialSummary"], div.fontBodyMedium div[class*="content"]');
  if (summaryEl?.textContent) {
    const sum = summaryEl.textContent.trim();
    if (sum && sum.length < 300) return sum;
  }
  return undefined;
}

function extractOpenStatus(): string | undefined {
  const openEl = document.querySelector<HTMLElement>('div[data-item-id*="oh"] span.fontBodyMedium, span[aria-label*="营业"], span[aria-label*="Hours"]');
  if (openEl?.textContent) {
    const status = openEl.textContent.trim();
    if (status && status.length < 40) return status;
  }
  return undefined;
}

function extractWebsite(): string | undefined {
  const webEl = document.querySelector<HTMLAnchorElement>('a[data-item-id="authority"]');
  if (webEl?.href) return webEl.href;
  return undefined;
}

export interface DetectedSavedList {
  listName: string;
  listUrl: string;
  places: CurrentResearchPlace[];
}

function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const heading = document.querySelector<HTMLElement>('h1.DUwDvf')
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || titleFromUrl(sourceUrl);
  if (!title || (!/\/maps\/(place|search|dir|saved|@)\//.test(window.location.pathname) && !window.location.pathname.includes('/maps/'))) return null;

  return {
    title,
    sourceUrl,
    sourceProvider: 'google_maps',
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    category: extractCategory(),
    priceLevel: extractPrice(),
    address: extractAddress(),
    summary: extractSummary(),
    openStatus: extractOpenStatus(),
    website: extractWebsite(),
  };
}

function detectGoogleMapsSavedList(): DetectedSavedList | null {
  // Extract list name from Google Maps Saved / Lists page
  let listName = '';
  const heading = document.querySelector<HTMLElement>('h1.DUwDvf, div.fontHeadlineLarge, div.m6QErb h1, h1');
  if (heading?.textContent?.trim()) {
    listName = heading.textContent.trim();
  } else {
    const docTitle = document.title || '';
    const match = /^(.*?)\s*[-–—·]\s*Google/i.exec(docTitle);
    if (match?.[1]) {
      listName = match[1].trim();
    }
  }

  // Find all place items inside the list
  const placesMap = new Map<string, CurrentResearchPlace>();
  const linkElements = document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"], a.hfpxzc');

  for (const linkEl of Array.from(linkElements)) {
    if (placesMap.size >= 100) break;
    const sourceUrl = linkEl.href;
    if (!sourceUrl) continue;

    const card = linkEl.closest<HTMLElement>('div.Nv2PK, div[role="article"], div.m6QErb, div[jsaction], li') || linkEl.parentElement;

    let title = linkEl.getAttribute('aria-label') || '';
    if (!title && card) {
      title = card.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall, .OSrXXb, h3, h2, .fontBodyMedium')?.textContent?.trim() || '';
    }
    if (!title) {
      title = titleFromUrl(sourceUrl);
    }
    if (!title) continue;

    let rating: number | undefined;
    const ratingText = card?.querySelector<HTMLElement>('.MW4etd, span[aria-label*="star"], span[aria-label*="星"]')?.textContent?.trim();
    if (ratingText) {
      const parsed = parseFloat(ratingText.replace(',', '.'));
      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) rating = parsed;
    }

    const infoText = card?.querySelector<HTMLElement>('div.W4Efsd, div.fontBodyMedium')?.textContent?.trim();
    const category = infoText ? infoText.split(/·|•/)[0]?.trim() : undefined;
    const address = card?.querySelector<HTMLElement>('button[data-item-id="address"], div[aria-label*="地址"]')?.textContent?.trim();
    const userNote = card?.querySelector<HTMLElement>('.fontBodySmall, .bJzME, div[class*="note"], textarea')?.textContent?.trim();

    const placeKey = sourceUrl.split('?')[0];
    if (!placesMap.has(placeKey)) {
      placesMap.set(placeKey, {
        title,
        sourceUrl,
        sourceProvider: 'google_maps',
        rating,
        category,
        address,
        summary: userNote,
      });
    }
  }

  const places = Array.from(placesMap.values());
  if (!listName && places.length === 0) return null;

  return {
    listName: listName || 'Google Maps 收藏列表',
    listUrl: window.location.href,
    places,
  };
}

function detectGoogleMapsListPlaces(): CurrentResearchPlace[] {
  const saved = detectGoogleMapsSavedList();
  if (saved && saved.places.length > 0) {
    return saved.places;
  }

  const items: CurrentResearchPlace[] = [];
  const cards = document.querySelectorAll<HTMLElement>('div.Nv2PK, div[role="article"]');
  for (const card of Array.from(cards)) {
    if (items.length >= 50) break;
    const linkEl = card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[href*="/maps/place/"]');
    const sourceUrl = linkEl?.href;
    const title = linkEl?.getAttribute('aria-label') || card.querySelector<HTMLElement>('.qBF1Pd, .fontHeadlineSmall')?.textContent?.trim();
    if (!title || !sourceUrl) continue;

    const ratingText = card.querySelector<HTMLElement>('span.MW4etd')?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card.querySelector<HTMLElement>('div.W4Efsd')?.textContent?.trim();
    const category = infoText ? infoText.split(/·|•/)[0]?.trim() : undefined;

    items.push({
      title,
      sourceUrl,
      sourceProvider: 'google_maps',
      rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
      category,
    });
  }
  return items;
}

function extractTabelogPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('h2.display-name span, h1.rstinfo-table__name, h1');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const ratingEl = document.querySelector<HTMLElement>('span.c-rating__val, b.c-rating__val');
  const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : undefined;

  const catEl = document.querySelector<HTMLElement>('span.rstinfo-table__badge, span.rstinfo-table__subject-text, div.rdhead-subinfo dl dd');
  const category = catEl?.textContent?.trim();

  const priceEl = document.querySelector<HTMLElement>('p.c-rating-v3__time span, span.c-rating-v3__val');
  const priceLevel = priceEl?.textContent?.trim();

  const addrEl = document.querySelector<HTMLElement>('p.rstinfo-table__address, p.rdhead-subinfo__address');
  const address = addrEl?.textContent?.trim();

  return {
    title,
    sourceUrl,
    sourceProvider: 'tabelog',
    rating: Number.isFinite(rating) && rating ? rating : undefined,
    category: category ? `Tabelog: ${category}` : 'Tabelog 美食',
    priceLevel,
    address,
  };
}

function extractXiaohongshuPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('#detail-title, .title, meta[property="og:title"]');
  const title = titleEl instanceof HTMLMetaElement ? titleEl.content : titleEl?.textContent?.trim();
  if (!title) return null;

  const descEl = document.querySelector<HTMLElement>('#detail-desc, .desc, .content');
  const summary = descEl?.textContent?.trim().slice(0, 200);

  const locEl = document.querySelector<HTMLElement>('.location-item, .geo, a[href*="/search_result?keyword="]');
  const address = locEl?.textContent?.trim();

  return {
    title: title.slice(0, 50),
    sourceUrl,
    sourceProvider: 'xiaohongshu',
    category: '小红书灵感',
    summary,
    address,
  };
}

function extractBookingPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const titleEl = document.querySelector<HTMLElement>('h2.d2fee87e0b, h2.pp-header__title, h1');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const ratingEl = document.querySelector<HTMLElement>('div.a3b8729ab1, div.d10a0e9803');
  const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : undefined;

  const addrEl = document.querySelector<HTMLElement>('span.hp_address_subtitle');
  const address = addrEl?.textContent?.trim();

  return {
    title,
    sourceUrl,
    sourceProvider: 'booking',
    rating: Number.isFinite(rating) && rating ? Math.min(5, Math.round((rating / 2) * 10) / 10) : undefined,
    category: 'Booking 住宿',
    address,
  };
}

function currentPlace(): CurrentResearchPlace | null {
  const provider = inferSourceProvider(window.location.href);
  if (provider === 'google_maps') return extractGoogleMapsPlace();
  if (provider === 'tabelog') return extractTabelogPlace();
  if (provider === 'xiaohongshu') return extractXiaohongshuPlace();
  if (provider === 'booking') return extractBookingPlace();
  return extractGoogleMapsPlace();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  const msgType = (message as { type?: string }).type;
  if (msgType === 'OWNLY_GET_CURRENT_PLACE') {
    sendResponse({ place: currentPlace(), savedList: detectGoogleMapsSavedList() });
    return;
  }
  if (msgType === 'OWNLY_GET_VISIBLE_LIST_PLACES') {
    sendResponse({ listPlaces: detectGoogleMapsListPlaces() });
    return;
  }
  if (msgType === 'OWNLY_GET_SAVED_LIST') {
    sendResponse({ savedList: detectGoogleMapsSavedList() });
    return;
  }
});
