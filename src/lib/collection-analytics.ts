// Phase 2-PR3: 轻量转化埋点（本地 console + 可扩展至 PostHog/GA）
// 事件：share_link_generated / preview_viewed / import_clicked / import_succeeded

export type CollectionAnalyticsEvent =
  | { type: 'share_link_generated'; collectionId: string; placeCount: number; truncated: boolean }
  | { type: 'preview_viewed'; collectionId: string; placeCount: number }
  | { type: 'import_clicked'; collectionId: string; placeCount: number }
  | { type: 'import_succeeded'; collectionId: string; created: number; failed: number };

export function trackCollectionEvent(event: CollectionAnalyticsEvent): void {
  // 可替换为真实上报：posthog.capture(event.type, event)
  if (typeof window !== 'undefined') {
    console.info('[ownly:analytics]', event.type, event);
    window.dispatchEvent(new CustomEvent('ownly:analytics', { detail: event }));
  }
}
