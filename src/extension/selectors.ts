export const SELECTORS = {
  placeHeading: 'h1.DUwDvf, main h1, h1',
  rating: 'div.F7nice span[aria-hidden="true"]',
  ratingAria: 'span.ceNzKf, span[aria-label*="star"], span[aria-label*="星"]',
  reviewCount: 'div.F7nice span:last-child, span[aria-label*="reviews"], span[aria-label*="评价"]',
  category: 'button.DkEaL, button[jsaction*="category"], div.fontBodyMedium button[jsaction*="pane"], button[jsaction*="pane.rating.category"], div.skqShb, div.LBgpqf button, span.mgr77e span.fontBodyMedium, span[class*="category"]',
  priceBadge: 'span[aria-label*="价格"], span[aria-label*="Price"], span.fontBodyMedium span[aria-label*="£"], span.fontBodyMedium span[aria-label*="$"], span.fontBodyMedium span[aria-label*="¥"], span[aria-label*="฿"], span.mgr77e span, div.mgr77e, span[class*="price"], div[aria-label*="per night"], div[aria-label*="每晚"], div[class*="price"]',
  priceInfoSpans: 'div.fontBodyMedium span, div.W4Efsd span, div.mgr77e',
  priceLevels: 'span[aria-label*="Moderate"], span[aria-label*="Inexpensive"], span[aria-label*="Expensive"], span[aria-label*="适中"], span[aria-label*="实惠"]',
  address: 'button[data-item-id="address"] div.fontBodyMedium, button[data-item-id="address"], div[aria-label*="地址"], div[aria-label*="Address"]',
  note: 'button[data-item-id="note"] div.fontBodyMedium, button[data-item-id="note"], div[data-item-id="note"], textarea[aria-label*="note" i], textarea[aria-label*="备注" i]',
  summary: 'div.PYvSYb, div.WeS02d, div[class*="editorialSummary"], div.fontBodyMedium div[class*="content"]',
  openStatus: 'div[data-item-id*="oh"] span.fontBodyMedium, span[aria-label*="营业"], span[aria-label*="Hours"]',
  hoursTable: 'table.eKjhWe, div[aria-label*="营业时间"], div[aria-label*="Opening hours"]',
  hoursRows: 'tr, div.y0skZc, div.t39EBf',
  website: 'a[data-item-id="authority"]',
  phone: 'button[data-item-id^="phone"], a[data-item-id^="phone"], a[href^="tel:"], button[aria-label*="电话"], button[aria-label*="Phone" i]',
  plusCode: 'button[data-item-id^="oloc"], span[itemprop="plusCode"], button[aria-label*="Plus code" i], button[aria-label*="地区代码"]',
  menuLink: '[data-item-id="menu"], a[href*="/menu"], button[jsaction*="menu"]',
  reserveAction: '[data-item-id*="reserve"], [aria-label*="Reserve" i], [aria-label*="Book a table" i], [aria-label*="预订"], [aria-label*="订座"], [jsaction*="reservation"]',
  reviewTopicChips: 'button[jsaction*="review"], div[role="listitem"] button[aria-label]',
  feedAnchors: 'a.hfpxzc, a[href*="/maps/place/"], a[href*="/place/"], a[data-place-id]',
  cardContainers: 'div.Nv2PK, div[role="article"], div[role="listitem"], div.THL29e, div.jANrlb, div.k77Iif, div.w7l8eb, div[jsaction*="placeCard"], li',
  cardTitle: '.qBF1Pd, div.fontHeadlineSmall, span.fontHeadlineSmall, h3, h2, div.OSrXXb, div[class*="title"]',
  cardRating: '.MW4etd, span[aria-label*="star"], span[aria-label*="星"]',
  cardInfo: 'div.W4Efsd, div.fontBodyMedium',
  cardNote: 'button[data-item-id="note"] div.fontBodyMedium, div[data-item-id="note"], textarea[aria-label*="note" i], div.ahS6Le',
  feed: 'div[role="feed"]',
  savedListHeading: 'h1.DUwDvf, div.fontHeadlineLarge, div.m6QErb h1, h1',
} as const;

const drifted = new Set<string>();

export function driftCheck(key: keyof typeof SELECTORS, found: Element | null): void {
  if (found) return;
  if (drifted.has(key)) return;
  drifted.add(key);
  console.warn(`[Ownly Capture] selector drift detected for "${key}" — Google Maps markup may have changed.`);
  try {
    void chrome.runtime.sendMessage({ type: 'OWNLY_SELECTOR_DRIFT', selector: key }).catch(() => {});
  } catch {}
}
