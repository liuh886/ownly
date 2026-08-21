export interface CurrentGoogleMapsPlace {
  title: string;
  sourceUrl: string;
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

function currentPlace(): CurrentGoogleMapsPlace | null {
  const sourceUrl = window.location.href;
  const heading = document.querySelector<HTMLElement>('h1.DUwDvf')
    ?? document.querySelector<HTMLElement>('main h1')
    ?? document.querySelector<HTMLElement>('h1');
  const title = heading?.textContent?.trim() || titleFromUrl(sourceUrl);
  if (!title || !/\/maps\/(place|search|dir)\//.test(window.location.pathname)) return null;

  return {
    title,
    sourceUrl,
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if ((message as { type?: string }).type !== 'OWNLY_GET_CURRENT_PLACE') return;
  sendResponse({ place: currentPlace() });
});
