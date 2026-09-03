import { writeState, getActiveCollection, getActivePlaces, store, t } from './store';
import { el } from '../dom';
import { downloadCollectionJson } from '../export';
import { createShareableCollectionShareLink } from '../../domain/collection-share';
import {
  renderCandidatesList,
  renderCurrentPlace,
  renderSmartListCard,
  renderState,
  setStatus,
} from './ui';
import type { OwnlyCaptureStateV2, OwnlyCaptureStateV3 } from '../../domain/capture';

export function setupImportExportHandlers(): void {
  el.btnShareCollection.addEventListener('click', async () => {
    const collection = getActiveCollection();
    const places = getActivePlaces();
    if (!collection || places.length === 0) {
      setStatus(store.lang === 'zh' ? '没有可分享的地点。' : 'No places to share.', 'error');
      return;
    }
    const { url, truncated } = createShareableCollectionShareLink(collection, places);
    if (truncated) {
      setStatus(store.lang === 'zh' ? '合集过大，已自动净化但链接仍超长，建议用“导出当前合集”分享 JSON。' : 'Collection too large for link — use Export JSON instead.', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus(store.lang === 'zh' ? '分享链接已复制到剪贴板。' : 'Share link copied to clipboard.', 'success');
    } catch {
      // Fallback: prompt
      window.prompt(store.lang === 'zh' ? '复制分享链接：' : 'Copy share link:', url);
    }
  });

  el.btnExportCollection.addEventListener('click', () => {
    const collection = getActiveCollection();
    const places = getActivePlaces();
    if (!collection || places.length === 0) {
      setStatus(store.lang === 'zh' ? '没有可导出的地点。' : 'No places to export.', 'error');
      return;
    }
    downloadCollectionJson(collection, places);
    setStatus(t().exportSaved || (store.lang === 'zh' ? '合集已导出。' : 'Collection exported.'), 'success');
  });

  el.btnBackupState.addEventListener('click', () => {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), captureState: store.stateV3 }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ownly-capture-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t().backupSaved, 'success');
  });

  el.btnRestoreState.addEventListener('click', () => el.fileRestoreState.click());

  el.fileRestoreState.addEventListener('change', () => {
    void (async () => {
      const file = el.fileRestoreState.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text()) as { captureState?: unknown };
        if (!window.confirm(t().confirmRestore)) return;
        const raw = parsed.captureState ?? parsed;
        let next;
        if (raw && typeof raw === 'object' && 'version' in raw && (raw as { version: number }).version === 3) {
          next = raw as OwnlyCaptureStateV3;
        } else {
          next = (await import('../../domain/capture')).migrateV2ToV3(raw as OwnlyCaptureStateV2);
        }
        await writeState(next);
        renderState();
        renderCurrentPlace();
        renderSmartListCard();
        renderCandidatesList();
        const places = getActivePlaces();
        setStatus(t().restoredCount(places.length), 'success');
      } catch {
        setStatus(store.lang === 'zh' ? '备份文件无效。' : 'Invalid backup file.', 'error');
      }
      el.fileRestoreState.value = '';
    })();
  });
}
