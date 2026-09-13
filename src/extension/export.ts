import { buildCollectionExport, type CaptureCollection, type CapturePlace } from '../domain/capture';

function slugify(title: string): string {
  const slug = title.trim().replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '-').toLowerCase() || 'ownly-collection';
  return slug.slice(0, 60);
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Human-readable Markdown export for standalone collector use: no Ownly
 * account or website needed — collect on Google Maps, download or copy text.
 */
export function buildCollectionMarkdown(
  collection: CaptureCollection,
  places: CapturePlace[],
  lang: 'zh' | 'en' = 'zh',
): string {
  const zh = lang === 'zh';
  const lines: string[] = [
    `## ${collection.title}`,
    '',
    zh
      ? `共 ${places.length} 个地点 · Ownly Capture 导出 · ${todayStamp()}`
      : `${places.length} places · exported by Ownly Capture · ${todayStamp()}`,
    '',
  ];
  places.forEach((place, index) => {
    const kind = place.inferred_kind || place.source.category || '';
    const countParen = typeof place.review_count === 'number'
      ? (zh ? `（${place.review_count}）` : ` (${place.review_count})`)
      : '';
    const rating = typeof place.rating === 'number' ? `★${place.rating}${countParen}` : '';
    const head = [place.title, [kind, rating].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
    lines.push(`${index + 1}. **${head}**`);
    if (place.address) lines.push(zh ? `   - 地址：${place.address}` : `   - Address: ${place.address}`);
    if (place.open_hours) lines.push(zh ? `   - 营业时间：${place.open_hours}` : `   - Hours: ${place.open_hours}`);
    if (place.price?.raw) lines.push(zh ? `   - 价格：${place.price.raw}` : `   - Price: ${place.price.raw}`);
    if (place.phone) lines.push(zh ? `   - 电话：${place.phone}` : `   - Phone: ${place.phone}`);
    const note = place.user?.why || place.user?.notes;
    if (note) lines.push(zh ? `   - 备注：${note}` : `   - Note: ${note}`);
    if (place.user?.tags && place.user.tags.length > 0) lines.push(`   - #${place.user.tags.join(' #')}`);
    if (place.source.url) lines.push(`   - 🗺️ ${place.source.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function downloadTextFile(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Deferred revoke: Firefox/Safari may still be fetching the blob on click return.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCollectionMarkdown(
  collection: CaptureCollection,
  places: CapturePlace[],
  lang: 'zh' | 'en' = 'zh',
): void {
  downloadTextFile(
    `ownly-collection-${slugify(collection.title)}-${todayStamp()}.md`,
    buildCollectionMarkdown(collection, places, lang),
  );
}

/**
 * Build a portable Capture Collection export and trigger a JSON file download.
 *
 * The exported file follows the `OwnlyCollectionExportV1` schema and can be
 * re-imported by Capture or by Planner via the adapter layer.
 */
export function downloadCollectionJson(
  collection: CaptureCollection,
  places: CapturePlace[],
): void {
  const exportData = buildCollectionExport(collection, places);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `ownly-collection-${collection.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
