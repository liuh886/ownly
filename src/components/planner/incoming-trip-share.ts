import { consumeTripShareHash, extractTripSharePayload } from '@/domain/trip-share-link';

/** Offer a link once, then remove only its observed URL fragment. */
export function observeIncomingTripShare(offer: (payload: string) => void): () => void {
  const check = () => {
    const payload = extractTripSharePayload(window.location.hash);
    if (!payload) return;
    offer(payload);
    consumeTripShareHash(payload);
  };
  check();
  window.addEventListener('hashchange', check);
  return () => window.removeEventListener('hashchange', check);
}
