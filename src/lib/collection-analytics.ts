// Phase 2-PR3: 轻量转化埋点（本地 console + 可扩展至 PostHog/GA）
// 事件：preview_viewed / import_clicked / import_succeeded
//
// 隐私边界（issue #48）：只发聚合计数，绝不携带 collectionId 等稳定标识。

export type CollectionAnalyticsEvent =
  | { type: 'preview_viewed'; placeCount: number }
  | { type: 'import_clicked'; placeCount: number }
  | { type: 'import_succeeded'; created: number; failed: number };

export function trackCollectionEvent(event: CollectionAnalyticsEvent): void {
  // 可替换为真实上报：posthog.capture(event.type, event)
  if (typeof window !== 'undefined') {
    console.info('[ownly:analytics]', event.type, event);
    window.dispatchEvent(new CustomEvent('ownly:analytics', { detail: event }));
  }
}
