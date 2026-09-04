import { describe, it, expect } from 'vitest';
import { detectPageCurrency, extractExplicitToken } from './currency-detector';

describe('Unified Currency Detector & Cross-Validation Engine', () => {
  describe('extractExplicitToken', () => {
    it('extracts compound and unambiguous symbols accurately', () => {
      expect(extractExplicitToken('S$45.00')).toBe('SGD');
      expect(extractExplicitToken('HK$120')).toBe('HKD');
      expect(extractExplicitToken('NT$500')).toBe('TWD');
      expect(extractExplicitToken('A$60')).toBe('AUD');
      expect(extractExplicitToken('C$50')).toBe('CAD');
      expect(extractExplicitToken('NZ$45')).toBe('NZD');
      expect(extractExplicitToken('US$100')).toBe('USD');
      expect(extractExplicitToken('฿400–1,000')).toBe('THB');
      expect(extractExplicitToken('10,000円')).toBe('JPY');
      expect(extractExplicitToken('€45')).toBe('EUR');
      expect(extractExplicitToken('£20')).toBe('GBP');
      expect(extractExplicitToken('₩50,000')).toBe('KRW');
      expect(extractExplicitToken('150,000₫')).toBe('VND');
      expect(extractExplicitToken('RM 35')).toBe('MYR');
      expect(extractExplicitToken('500新台币')).toBe('TWD');
      expect(extractExplicitToken('45新币')).toBe('SGD');
      expect(extractExplicitToken('80港币')).toBe('HKD');
      expect(extractExplicitToken('₱500')).toBe('PHP');
      expect(extractExplicitToken('Rp 150,000')).toBe('IDR');
      expect(extractExplicitToken('AED 250')).toBe('AED');
      expect(extractExplicitToken('120 ₺')).toBe('TRY');
      expect(extractExplicitToken('MOP$ 300')).toBe('MOP');
      expect(extractExplicitToken('JP¥8,473')).toBe('JPY');
      expect(extractExplicitToken('CN¥500')).toBe('CNY');
      expect(extractExplicitToken('45 zł')).toBe('PLN');
      expect(extractExplicitToken('ZL 120')).toBe('PLN');
      expect(extractExplicitToken('RP 500,000')).toBe('IDR');
    });

    it('returns null for ambiguous symbols or non-currency text', () => {
      expect(extractExplicitToken('$100')).toBeNull();
      expect(extractExplicitToken('¥3,500')).toBeNull();
      expect(extractExplicitToken('400–1,000')).toBeNull();
      expect(extractExplicitToken('Tokyo Tower')).toBeNull();
    });
  });

  describe('detectPageCurrency cross-validation', () => {
    it('detects currency from SEO Schema.org JSON-LD structured data', () => {
      const mockDoc = {
        querySelectorAll: (sel: string) => {
          if (sel.includes('application/ld+json')) {
            return [{
              textContent: JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'Hotel',
                'name': 'Marina Bay Sands',
                'offers': {
                  '@type': 'Offer',
                  'priceCurrency': 'SGD',
                  'price': '850.00'
                }
              })
            }];
          }
          return [];
        },
        querySelector: () => null,
        documentElement: { getAttribute: () => null },
        body: { textContent: '' },
      } as unknown as Document;

      const result = detectPageCurrency({
        priceText: '$850.00',
        doc: mockDoc,
      });
      expect(result.currency).toBe('SGD');
      expect(result.signals.some(s => s.source === 'json_ld')).toBe(true);
    });

    it('detects currency from site-level active currency picker / HTML data-currency', () => {
      const mockDoc = {
        querySelectorAll: () => [],
        querySelector: (sel: string) => {
          if (sel.includes('currency')) {
            return {
              getAttribute: (attr: string) => attr === 'data-currency' ? 'SGD' : null,
              textContent: 'SGD',
            };
          }
          return null;
        },
        documentElement: { getAttribute: (attr: string) => attr === 'data-currency' ? 'SGD' : null },
        body: { textContent: '' },
      } as unknown as Document;

      const result = detectPageCurrency({
        priceText: '$150.00',
        doc: mockDoc,
      });
      expect(result.currency).toBe('SGD');
      expect(result.signals.some(s => s.source === 'site_switcher')).toBe(true);
    });

    it('disambiguates bare "$" to SGD in Singapore via phone code +65', () => {
      const result = detectPageCurrency({
        priceText: '$45.00',
        phoneText: '+65 6789 1234',
        url: 'https://example.com/restaurant',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to SGD in Singapore via Google Maps coordinates', () => {
      const result = detectPageCurrency({
        priceText: '$50–100',
        url: 'https://www.google.com/maps/@1.3521,103.8198,15z',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to SGD in Singapore via Google Maps RPC !3d!4d coordinates', () => {
      const result = detectPageCurrency({
        priceText: '$35.00',
        url: 'https://www.google.com/maps/place/Marina+Bay+Sands/data=!4m2!3m1!1s0x0:0x0!3d1.2838!4d103.8591',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to SGD via Singapore location keywords in URL or title', () => {
      const result = detectPageCurrency({
        priceText: '$60.00',
        url: 'https://travel-blog.com/top-food-in-singapore',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to SGD when active trip currency is SGD (hintCurrency)', () => {
      const result = detectPageCurrency({
        priceText: '$45.00',
        url: 'https://generic-restaurant.com/menu',
        hintCurrency: 'SGD',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to SGD via Singapore 9% GST statutory tax signal', () => {
      const result = detectPageCurrency({
        priceText: '$85.00',
        pageText: 'All prices are subject to 10% service charge and 9% GST.',
        url: 'https://hotel-booking.com/singapore/stay',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to HKD in Hong Kong via +852 phone and coordinates', () => {
      const result = detectPageCurrency({
        priceText: '$180 per person',
        phoneText: '+852 2345 6789',
        url: 'https://www.google.com/maps/@22.3193,114.1694,14z',
      });
      expect(result.currency).toBe('HKD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to AUD in Australia via +61 and 10% GST', () => {
      const result = detectPageCurrency({
        priceText: '$75.00',
        phoneText: '+61 2 9876 5432',
        pageText: 'Prices incl. 10% GST for Australia dining.',
        url: 'https://sydney-cafe.com.au/menu',
      });
      expect(result.currency).toBe('AUD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates bare "$" to CAD on Canadian .ca domains', () => {
      const result = detectPageCurrency({
        priceText: '$45.00',
        url: 'https://montreal-tour.ca/tickets',
      });
      expect(result.currency).toBe('CAD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('defaults bare "$" to USD when no regional signals are present', () => {
      const result = detectPageCurrency({
        priceText: '$120.00',
        url: 'https://general-travel.com/package',
      });
      expect(result.currency).toBe('USD');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates "¥" to JPY in Japan via Consumption Tax signal or +81 phone', () => {
      const result = detectPageCurrency({
        priceText: '¥3,500',
        phoneText: '+81 3 1234 5678',
        pageText: '料金は税込価格です。',
        url: 'https://tabelog.com/tokyo/A1301/A130101/13000001/',
      });
      expect(result.currency).toBe('JPY');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('disambiguates "¥" to CNY when on a Chinese site without Japan signals', () => {
      const result = detectPageCurrency({
        priceText: '¥120',
        url: 'https://dianping.com/shop/123456',
        pageText: '人均消费 120元 人民币',
      });
      expect(result.currency).toBe('CNY');
      expect(result.isAmbiguousResolved).toBe(true);
    });

    it('identifies bare numbers in Thailand via GPS coordinates and +66 phone', () => {
      const result = detectPageCurrency({
        priceText: '400 - 1000',
        phoneText: '+66 2 123 4567',
        url: 'https://www.google.com/maps/@13.7563,100.5018,16z',
      });
      expect(result.currency).toBe('THB');
    });

    it('honors user manual override above all other signals', () => {
      const result = detectPageCurrency({
        priceText: '$45.00',
        phoneText: '+65 6789 1234',
        url: 'https://www.google.com/maps/@1.3521,103.8198,15z',
        overrideCurrency: 'EUR',
      });
      expect(result.currency).toBe('EUR');
      expect(result.confidence).toBe(100);
    });

    it('honors overrideCurrency SGD for bare $84 hotel in Pattaya Thailand', () => {
      const result = detectPageCurrency({
        priceText: '$84',
        url: 'https://www.google.com/maps/place/Cross+Pattaya+Pratamnak/@12.9188285,100.8576083,19z',
        overrideCurrency: 'SGD',
      });
      expect(result.currency).toBe('SGD');
      expect(result.confidence).toBe(100);
    });

    it('disambiguates bare $84 to SGD in Thailand when active trip currency is SGD (hintCurrency)', () => {
      const result = detectPageCurrency({
        priceText: '$84',
        url: 'https://www.google.com/maps/place/Cross+Pattaya+Pratamnak/@12.9188285,100.8576083,19z',
        hintCurrency: 'SGD',
      });
      expect(result.currency).toBe('SGD');
      expect(result.isAmbiguousResolved).toBe(true);
    });
  });
});
