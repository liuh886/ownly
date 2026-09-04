import type { PageAdapter, CurrentResearchPlace } from './types';
import {
  cleanExtractedText,
  cleanTitleForSearch,
  isFakePlaceLabel,
  isJunkNavigationText,
  isPlausiblePriceText,
} from '../utils';
import { detectCurrencyFromPage } from '../currency-detector';
import { injectInlineCaptureButton } from '../ui/inline-capture-button';

export function extractTabelogPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
  const sourceUrl = window.location.href;
  if (/rstLst/i.test(sourceUrl) || Boolean(document.querySelector('div.list-rst, div.js-rst-cassette'))) {
    return null;
  }

  const titleEl = document.querySelector<HTMLElement>('h2.display-name, h1.rstinfo-table__name, .rdheader-rst-name');
  const rawTitle = titleEl?.textContent?.trim() || '';
  if (!rawTitle) return null;

  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const ratingEl = document.querySelector<HTMLElement>('span.c-rating__val, b.c-rating__val');
  const rating = ratingEl?.textContent ? parseFloat(ratingEl.textContent.trim()) : undefined;

  const catEl = document.querySelector<HTMLElement>('span.rstinfo-table__badge, span.rstinfo-table__subject-text, div.rdhead-subinfo dl dd');
  const category = catEl?.textContent?.trim() || 'Tabelog 美食';

  const priceEl = document.querySelector<HTMLElement>('p.c-rating-v3__time span, span.c-rating-v3__val');
  const rawPrice = priceEl?.textContent?.trim();
  const priceLevel = rawPrice && isPlausiblePriceText(rawPrice) ? rawPrice : undefined;

  const addrEl = document.querySelector<HTMLElement>('p.rstinfo-table__address, p.rdhead-subinfo__address');
  const address = addrEl?.textContent?.trim();

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title + (address ? ' ' + address : ''))}&hl=zh-CN`;

  return {
    title,
    sourceUrl: mapsUrl,
    sourceProvider: 'google_maps',
    kind: 'food',
    rating: Number.isFinite(rating) && rating ? rating : undefined,
    category: `Tabelog: ${category}`,
    priceLevel,
    detectedCurrency: detectCurrencyFromPage(sourceUrl, priceLevel, hintCurrency, overrideCurrency) ?? 'JPY',
    address,
    types: ['restaurant', 'food', 'establishment'],
    summary: '来自 Tabelog',
  };
}

export function parseTabelogCard(cardEl: HTMLElement, overrideCurrency?: string): CurrentResearchPlace | null {
  const titleEl = cardEl.querySelector<HTMLElement>('.list-rst__rst-name-target, a.list-rst__name, h3');
  const rawTitle = titleEl?.textContent?.trim() || '';
  const title = cleanTitleForSearch(cleanExtractedText(rawTitle));
  if (!title || isFakePlaceLabel(title) || isJunkNavigationText(title)) return null;

  const ratingEl = cardEl.querySelector<HTMLElement>('.c-rating__val, .list-rst__rating-val');
  const ratingText = ratingEl?.textContent?.trim();
  const rating = ratingText ? parseFloat(ratingText) : undefined;

  const areaCatEl = cardEl.querySelector<HTMLElement>('.list-rst__area-genre');
  const category = areaCatEl?.textContent?.trim() || 'Tabelog 美食';

  const priceEl = cardEl.querySelector<HTMLElement>('.c-rating-v3__val, .list-rst__budget-val');
  const rawPrice = priceEl?.textContent?.trim();
  const priceLevel = rawPrice && isPlausiblePriceText(rawPrice) ? rawPrice : undefined;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}&hl=zh-CN`;

  return {
    title,
    sourceUrl: mapsUrl,
    sourceProvider: 'google_maps',
    kind: 'food',
    rating: Number.isFinite(rating) && rating ? rating : undefined,
    category: `Tabelog: ${category}`,
    priceLevel,
    detectedCurrency: detectCurrencyFromPage(window.location.href, priceLevel, undefined, overrideCurrency) ?? 'JPY',
    types: ['restaurant', 'food', 'establishment'],
    summary: '来自 Tabelog',
  };
}

export class TabelogAdapter implements PageAdapter {
  readonly id = 'tabelog' as const;
  readonly name = 'Tabelog';

  matches(url: string): boolean {
    return /tabelog\.com/i.test(url);
  }

  extractPlace(overrideCurrency?: string, hintCurrency?: string): CurrentResearchPlace | null {
    return extractTabelogPlace(overrideCurrency, hintCurrency);
  }

  initInlineButtons(): void {
    if (typeof document === 'undefined' || !document.body) return;

    // 1. Single Restaurant Detail Page: inject next to restaurant title
    const detailTitleEl = document.querySelector<HTMLElement>(
      'h2.display-name, h1.rst-name, [data-name="rst-name"], .rst-header__name'
    );
    if (detailTitleEl && !document.querySelector('div.list-rst')) {
      const container = (detailTitleEl.parentElement || detailTitleEl) as HTMLElement;
      if (container.dataset.ownlyCardInjected !== 'true' && !container.querySelector('.ownly-inline-fab-root')) {
        const place = this.extractPlace();
        if (place && place.title) {
          injectInlineCaptureButton({
            container,
            anchor: detailTitleEl,
            position: 'before',
            customStyle: 'margin-right: 10px; margin-bottom: 4px;',
            getPlace: () => this.extractPlace() || place,
          });
        }
      }
    }

    // 2. Search Result List
    const cards = document.querySelectorAll<HTMLElement>(
      'div.list-rst, li.list-rst, div.js-rst-cassette'
    );

    for (const card of Array.from(cards)) {
      if (card.dataset.ownlyCardInjected === 'true' || card.querySelector('.ownly-inline-fab-root')) continue;

      const parsedPlace = parseTabelogCard(card);
      if (!parsedPlace || !parsedPlace.title) continue;

      const actionTarget = card.querySelector<HTMLElement>(
        '.list-rst__rst-name-target, a.list-rst__name, h3'
      );
      if (!actionTarget) continue;

      injectInlineCaptureButton({
        container: card,
        anchor: actionTarget,
        position: 'before',
        getPlace: () => parseTabelogCard(card) || parsedPlace,
      });
    }
  }
}

