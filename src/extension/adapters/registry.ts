import type { PageAdapter } from './types';
import { GoogleMapsAdapter } from './google-maps';
import { GoogleTravelAdapter } from './google-travel';
import { AgodaAdapter } from './agoda';
import { BookingAdapter } from './booking';
import { XiaohongshuAdapter } from './xiaohongshu';
import { TabelogAdapter } from './tabelog';

export class AdapterRegistry {
  private readonly adapters: PageAdapter[] = [
    new GoogleMapsAdapter(),
    new GoogleTravelAdapter(),
    new AgodaAdapter(),
    new BookingAdapter(),
    new XiaohongshuAdapter(),
    new TabelogAdapter(),
  ];

  getAdapterForUrl(url: string): PageAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return null;
  }

  getAllAdapters(): readonly PageAdapter[] {
    return this.adapters;
  }
}

export const adapterRegistry = new AdapterRegistry();

export function getAdapterForUrl(url: string): PageAdapter | null {
  return adapterRegistry.getAdapterForUrl(url);
}
