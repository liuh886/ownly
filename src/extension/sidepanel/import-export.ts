import { getActiveCollection, getActivePlaces, store } from './store';
import { el } from '../dom';
import { downloadCollectionJson } from '../export';
import { createShareableCollectionShareLink } from '../../domain/collection-share';
import { setStatus } from './ui';

export function setupImportExportHandlers(): void {
  // Merged Share & Export handler
  el.btnExportActiveCollection.addEventListener('click', async () => {
    const collection = getActiveCollection();
    const places = getActivePlaces();
    if (!collection || places.length === 0) {
      setStatus(store.lang === 'zh' ? '当前合集没有可导出的地点。' : 'No places to export.', 'error');
      return;
    }

    // 1. Download collection JSON
    downloadCollectionJson(collection, places);

    // 2. Also generate and copy share link if applicable
    const { url, truncated } = createShareableCollectionShareLink(collection, places);
    if (!truncated && url) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus(store.lang === 'zh' ? `已导出 JSON 文件，并将 ${places.length} 个地点的分享链接复制到剪贴板！` : `Exported JSON & copied share link for ${places.length} places!`, 'success');
        return;
      } catch {}
    }

    setStatus(store.lang === 'zh' ? `已导出 ${places.length} 个地点的合集 JSON 文件。` : `Exported collection JSON (${places.length} places).`, 'success');
  });
}
