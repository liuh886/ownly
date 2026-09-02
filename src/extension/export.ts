import { buildCollectionExport, type CaptureCollection, type CapturePlace } from '../domain/capture';

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
