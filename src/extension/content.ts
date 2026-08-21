import { inferSourceProvider, type PlannerPlaceSourceProvider } from '../domain/planner';

export interface CurrentResearchPlace {
  title: string;
  sourceUrl: string;
  sourceProvider: PlannerPlaceSourceProvider;
  rating?: number;
  reviewCount?: number;
  category?: string;
  priceLevel?: string;
  detectedCurrency?: string;
  address?: string;
  summary?: string;
  userNote?: string;
  openStatus?: string;
  openHours?: string;
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

function extractUserNote(): string | undefined {
  const noteEl = document.querySelector<HTMLElement>(
    'button[data-item-id="note"] div.fontBodyMedium, div[aria-label*="备注"], div[aria-label*="备忘"], div[aria-label*="Note"], div.P34g2b, div.bJzME, textarea[aria-label*="note"]'
  );
  if (noteEl) {
    const text = (noteEl.textContent || (noteEl as HTMLTextAreaElement).value || '').trim();
    if (text && text.length < 500 && !/^(添加备注|add a note|edit note|编辑备注)$/i.test(text)) return text;
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

function extractOpenHours(): string | undefined {
  const hoursTable = document.querySelector<HTMLElement>('table.eKjhWe, div[aria-label*="营业时间"], div[aria-label*="Opening hours"]');
  if (hoursTable) {
    const rows = Array.from(hoursTable.querySelectorAll('tr, div.y0skZc, div.t39EBf'));
    if (rows.length > 0) {
      const text = rows.map((r) => r.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean).join('; ');
      if (text && text.length < 300) return text;
    }
  }

  const hoursEl = document.querySelector<HTMLElement>('div[data-item-id*="oh"]');
  if (hoursEl) {
    const aria = hoursEl.getAttribute('aria-label');
    if (aria && aria.length < 300) return aria.trim();
    const text = hoursEl.textContent?.replace(/\s+/g, ' ').trim();
    if (text && text.length < 300) return text;
  }

  return undefined;
}

function extractWebsite(): string | undefined {
  const webEl = document.querySelector<HTMLAnchorElement>('a[data-item-id="authority"]');
  if (webEl?.href) return webEl.href;
  return undefined;
}

export function detectCurrencyFromPage(sourceUrl: string, priceText?: string): string | undefined {
  // 1. Gather all actual price strings rendered on the user's active page
  const pricesToScan: string[] = [];
  if (priceText) pricesToScan.push(priceText);

  // Scan visible price elements on the page (place card, hotels, menu, reviews, footer)
  const priceElements = document.querySelectorAll<HTMLElement>(
    'span[aria-label*="价格"], span[aria-label*="Price"], span.fontBodyMedium, div.fontHeadlineSmall, span[class*="price"], div[aria-label*="per night"], div[aria-label*="每晚"]'
  );
  for (const el of Array.from(priceElements).slice(0, 15)) {
    const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
    if (text && text.length < 50 && /[\$¥฿€£₩₫₹]|\b(sgd|hkd|twd|thb|usd|jpy|cny|eur|gbp|aud|cad|krw|vnd|myr|chf|inr)\b/i.test(text)) {
      pricesToScan.push(text);
    }
  }

  const combinedPrices = pricesToScan.join(' ');

  // 2. High-precision explicit currency symbol matching from what is literally on screen
  if (/s\$|\bsgd\b/i.test(combinedPrices)) return 'SGD';
  if (/hk\$|\bhkd\b/i.test(combinedPrices)) return 'HKD';
  if (/nt\$|\btwd\b|\bntd\b|新台币/i.test(combinedPrices)) return 'TWD';
  if (/au\$|a\$|\baud\b/i.test(combinedPrices)) return 'AUD';
  if (/ca\$|c\$|\bcad\b/i.test(combinedPrices)) return 'CAD';
  if (/nz\$|\bnzd\b/i.test(combinedPrices)) return 'NZD';
  if (/us\$|\busd\b/i.test(combinedPrices)) return 'USD';
  if (/฿|\bthb\b|บาท/i.test(combinedPrices)) return 'THB';
  if (/₩|\bkrw\b|원/i.test(combinedPrices)) return 'KRW';
  if (/\brm\b|\bmyr\b/i.test(combinedPrices)) return 'MYR';
  if (/₫|\bvnd\b|đ/i.test(combinedPrices)) return 'VND';
  if (/€|\beur\b/i.test(combinedPrices)) return 'EUR';
  if (/£|\bgbp\b/i.test(combinedPrices)) return 'GBP';
  if (/₹|\binr\b/i.test(combinedPrices)) return 'INR';
  if (/\bchf\b/i.test(combinedPrices)) return 'CHF';
  if (/cn¥|\brmb\b|\bcny\b|人民币/i.test(combinedPrices)) return 'CNY';
  if (/jp¥|\bjpy\b|円/i.test(combinedPrices)) return 'JPY';

  // 3. Domain / TLD the user's browser is currently connected to (e.g. google.com.sg)
  try {
    const urlObj = new URL(sourceUrl || window.location.href);
    const host = urlObj.hostname.toLowerCase();
    if (host.endsWith('.com.sg') || host.endsWith('.sg')) return 'SGD';
    if (host.endsWith('.com.hk') || host.endsWith('.hk')) return 'HKD';
    if (host.endsWith('.com.tw') || host.endsWith('.tw')) return 'TWD';
    if (host.endsWith('.co.jp') || host.endsWith('.jp')) return 'JPY';
    if (host.endsWith('.co.th') || host.endsWith('.th')) return 'THB';
    if (host.endsWith('.co.uk') || host.endsWith('.uk')) return 'GBP';
    if (host.endsWith('.com.au') || host.endsWith('.au')) return 'AUD';
    if (host.endsWith('.ca')) return 'CAD';
    if (host.endsWith('.fr') || host.endsWith('.de') || host.endsWith('.it') || host.endsWith('.es') || host.endsWith('.nl')) return 'EUR';
  } catch {}

  // 4. Ambiguous symbols: bare ¥ or $
  if (combinedPrices.includes('¥')) {
    if (/円/i.test(document.title) || document.documentElement.lang.startsWith('ja')) return 'JPY';
    return 'CNY';
  }
  if (combinedPrices.includes('$')) {
    return 'USD';
  }

  return undefined;
}

export interface DetectedSavedList {
  listName: string;
  listUrl: string;
  detectedCurrency?: string;
  places: CurrentResearchPlace[];
}

const scavengedListPlaces = new Map<string, CurrentResearchPlace>();

function isGenericNavigationTitle(text: string): boolean {
  const norm = text.trim().toLowerCase();
  return /^(google|google maps|google 地图|directions|路线|保存|已保存|saved|share|分享|搜索|search|返回|back|菜单|menu|overview|概览|reviews|评价|photos|照片|about|关于)$/i.test(norm);
}

function scanAllGoogleMapsPlaces(): CurrentResearchPlace[] {
  // Strategy 1: Scan all place link anchors directly
  const linkAnchors = document.querySelectorAll<HTMLAnchorElement>(
    'a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]'
  );
  for (const anchor of Array.from(linkAnchors)) {
    let title = anchor.getAttribute('aria-label') || '';
    const href = anchor.href || '';
    if (!title && href) {
      title = titleFromUrl(href);
    }
    if (!title || title.length < 2 || isGenericNavigationTitle(title)) continue;

    const card = anchor.closest<HTMLElement>(
      'div.Nv2PK, div[role="article"], div[role="listitem"], div.THL29e, div.jANrlb, div.k77Iif, div.w7l8eb, div[jsaction*="placeCard"], li'
    ) || anchor.parentElement;

    const ratingText = card?.querySelector<HTMLElement>('.MW4etd, span[aria-label*="star"], span[aria-label*="星"]')?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card?.querySelector<HTMLElement>('div.W4Efsd, div.fontBodyMedium')?.textContent?.trim();
    const category = infoText ? infoText.split(/·|•/)[0]?.trim() : undefined;
    const address = card?.querySelector<HTMLElement>('button[data-item-id="address"], div[aria-label*="地址"]')?.textContent?.trim();
    const userNote = card?.querySelector<HTMLElement>('.fontBodySmall, .bJzME, div[class*="note"], textarea, div.P34g2b')?.textContent?.trim();

    const titleKey = title.trim().toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: title.trim(),
        sourceUrl: href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(href, undefined),
        summary: userNote,
        userNote,
      });
    }
  }

  // Strategy 2: Scan all distinct item card containers inside lists
  const cardElements = document.querySelectorAll<HTMLElement>(
    'div.Nv2PK, div[role="article"], div[role="listitem"], div.THL29e, div.jANrlb, div.k77Iif, div.w7l8eb, div[jsaction*="placeCard"], div[role="feed"] > div'
  );
  for (const card of Array.from(cardElements)) {
    const headEl = card.querySelector<HTMLElement>(
      '.qBF1Pd, div.fontHeadlineSmall, span.fontHeadlineSmall, h3, h2, div.OSrXXb, div.fontBodyMedium.bJzME, div[class*="title"]'
    );
    const title = headEl?.textContent?.trim() || card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[aria-label]')?.getAttribute('aria-label') || '';
    if (!title || title.length < 2 || title.length > 80 || isGenericNavigationTitle(title)) continue;

    const linkEl = card.querySelector<HTMLAnchorElement>('a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]');
    const sourceUrl = linkEl?.href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

    const ratingText = card.querySelector<HTMLElement>('.MW4etd, span[aria-label*="star"], span[aria-label*="星"]')?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card.querySelector<HTMLElement>('div.W4Efsd, div.fontBodyMedium')?.textContent?.trim();
    const category = infoText ? infoText.split(/·|•/)[0]?.trim() : undefined;
    const address = card.querySelector<HTMLElement>('button[data-item-id="address"], div[aria-label*="地址"]')?.textContent?.trim();
    const userNote = card.querySelector<HTMLElement>('.fontBodySmall, .bJzME, div[class*="note"], textarea, div.P34g2b')?.textContent?.trim();

    const titleKey = title.trim().toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: title.trim(),
        sourceUrl,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined),
        summary: userNote,
        userNote,
      });
    }
  }

  // Strategy 3: Scan all list item cards and rows inside feed/pane
  const feedItems = document.querySelectorAll<HTMLElement>(
    'div[role="feed"] > div, div[role="main"] div[jsaction], div.m6QErb > div[jsaction], div.m6QErb > div'
  );
  for (const card of Array.from(feedItems)) {
    const titleEl = card.querySelector<HTMLElement>(
      'h1, h2, h3, .fontHeadlineSmall, .qBF1Pd, .OSrXXb, div.bJzME, [role="heading"], div[class*="headline"], span[class*="headline"]'
    );
    const title = titleEl?.textContent?.trim() || card.querySelector('[aria-label]')?.getAttribute('aria-label') || '';
    if (!title || title.length < 2 || title.length > 80 || isGenericNavigationTitle(title)) continue;

    const linkEl = card.querySelector<HTMLAnchorElement>('a[href*="/maps/place/"], a[href*="/place/"], a.hfpxzc, a');
    const sourceUrl = linkEl?.href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

    const ratingText = card.querySelector<HTMLElement>('.MW4etd, span[aria-label*="star"], span[aria-label*="星"]')?.textContent?.trim();
    const rating = ratingText ? parseFloat(ratingText.replace(',', '.')) : undefined;

    const infoText = card.querySelector<HTMLElement>('div.W4Efsd, div.fontBodyMedium')?.textContent?.trim();
    const category = infoText ? infoText.split(/·|•/)[0]?.trim() : undefined;
    const address = card.querySelector<HTMLElement>('button[data-item-id="address"], div[aria-label*="地址"]')?.textContent?.trim();
    const userNote = card.querySelector<HTMLElement>('.fontBodySmall, .bJzME, div[class*="note"], textarea, div.P34g2b')?.textContent?.trim();

    const titleKey = title.trim().toLowerCase();
    if (!scavengedListPlaces.has(titleKey)) {
      scavengedListPlaces.set(titleKey, {
        title: title.trim(),
        sourceUrl,
        sourceProvider: 'google_maps',
        rating: Number.isFinite(rating) && rating && rating >= 1 && rating <= 5 ? rating : undefined,
        category,
        address,
        detectedCurrency: detectCurrencyFromPage(sourceUrl, undefined),
        summary: userNote,
        userNote,
      });
    }
  }

  return Array.from(scavengedListPlaces.values());
}

function extractGoogleMapsPlace(): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  const listPlaces = scanAllGoogleMapsPlaces();
  const isDedicatedPlacePage = /\/maps\/place\/[^/?#]+/.test(window.location.pathname) || /data=.*!1s0x/.test(window.location.href);

  // If there are multiple places in a list, don't falsely recognize the list header as a single place
  if (listPlaces.length > 1 && !isDedicatedPlacePage) {
    return null;
  }

  const heading = document.querySelector<HTMLElement>('h1.DUwDvf')
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || titleFromUrl(sourceUrl);
  if (!title || (!/\/maps\/(place|search|dir|saved|@)\//.test(window.location.pathname) && !window.location.pathname.includes('/maps/'))) return null;

  const priceLevel = extractPrice();
  const address = extractAddress();
  const detectedCurrency = detectCurrencyFromPage(sourceUrl, priceLevel);
  const userNote = extractUserNote();
  const summary = extractSummary();
  const openHours = extractOpenHours();
  const openStatus = extractOpenStatus();

  return {
    title,
    sourceUrl,
    sourceProvider: 'google_maps',
    rating: extractRating(),
    reviewCount: extractReviewCount(),
    category: extractCategory(),
    priceLevel,
    detectedCurrency,
    address,
    summary,
    userNote,
    openStatus,
    openHours,
    website: extractWebsite(),
  };
}

function extractGoogleMapsListId(): string | null {
  // Check URL pathname and search parameters for list ID pattern !2s<ID>
  const urlMatch = /!2s([A-Za-z0-9_-]{20,})/.exec(window.location.href);
  if (urlMatch?.[1]) return urlMatch[1];

  const placeListMatch = /\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(window.location.href);
  if (placeListMatch?.[1]) return placeListMatch[1];

  // Check preload link
  const preloadEl = document.querySelector<HTMLLinkElement>('link[href*="entitylist/getlist"]');
  if (preloadEl?.href) {
    const pbMatch = /!1s([A-Za-z0-9_-]{20,})/.exec(preloadEl.href);
    if (pbMatch?.[1]) return pbMatch[1];
  }

  return null;
}

let cachedEntityList: DetectedSavedList | null = null;
let lastScannedListId: string | null = null;

async function resolveGoogleMapsList(): Promise<DetectedSavedList | null> {
  const listId = extractGoogleMapsListId();
  if (listId && listId === lastScannedListId && cachedEntityList) {
    return cachedEntityList;
  }

  if (listId) {
    try {
      const fetchUrl = `/maps/preview/entitylist/getlist?authuser=0&hl=zh-CN&pb=!1m4!1s${listId}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
      const res = await fetch(fetchUrl);
      if (res.ok) {
        const raw = await res.text();
        const cleanJson = raw.replace(/^\)\]\}'\s*/, '');
        const data = JSON.parse(cleanJson);
        const listName = data[0]?.[4] || 'Google Maps 收藏列表';
        const rawItems = data[0]?.[8];
        if (Array.isArray(rawItems)) {
          const places: CurrentResearchPlace[] = [];
          for (const item of rawItems) {
            const placeInfo = item[1];
            const title = item[2] || (placeInfo && placeInfo[2]);
            if (!title) continue;

            const address = placeInfo ? placeInfo[4] : undefined;
            const userNote = item[3] || undefined;
            const lat = placeInfo?.[5]?.[2];
            const lng = placeInfo?.[5]?.[3];
            const sourceUrl = (lat && lng)
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}`;

            places.push({
              title: String(title).trim(),
              sourceUrl,
              sourceProvider: 'google_maps',
              address,
              userNote,
              summary: userNote,
              category: 'Google Maps 收藏地点',
              detectedCurrency: detectCurrencyFromPage(window.location.href, undefined),
            });
          }

          if (places.length > 0) {
            cachedEntityList = {
              listName,
              listUrl: window.location.href,
              detectedCurrency: detectCurrencyFromPage(window.location.href, undefined),
              places,
            };
            lastScannedListId = listId;
            return cachedEntityList;
          }
        }
      }
    } catch (e) {
      console.warn('Entitylist direct fetch failed:', e);
    }
  }

  // Fallback to DOM scan
  const domList = detectGoogleMapsSavedList();
  if (domList) {
    cachedEntityList = domList;
    return domList;
  }
  return null;
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

  const places = scanAllGoogleMapsPlaces();
  if (!listName && places.length === 0) return null;

  const listCurrency = detectCurrencyFromPage(window.location.href, undefined);

  return {
    listName: listName || 'Google Maps 收藏列表',
    listUrl: window.location.href,
    detectedCurrency: listCurrency,
    places,
  };
}

function detectGoogleMapsListPlaces(): CurrentResearchPlace[] {
  return scanAllGoogleMapsPlaces();
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
    void (async () => {
      const savedList = await resolveGoogleMapsList();
      const place = currentPlace();
      sendResponse({ place, savedList });
    })();
    return true;
  }
  if (msgType === 'OWNLY_GET_VISIBLE_LIST_PLACES') {
    void (async () => {
      const savedList = await resolveGoogleMapsList();
      const listPlaces = savedList?.places ?? detectGoogleMapsListPlaces();
      sendResponse({ listPlaces });
    })();
    return true;
  }
  if (msgType === 'OWNLY_GET_SAVED_LIST') {
    void (async () => {
      const savedList = await resolveGoogleMapsList();
      sendResponse({ savedList });
    })();
    return true;
  }
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('scroll', () => { scanAllGoogleMapsPlaces(); }, { passive: true });
  try {
    const observer = new MutationObserver(() => { scanAllGoogleMapsPlaces(); });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } catch {}
}
