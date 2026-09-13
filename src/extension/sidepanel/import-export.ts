import { getActiveCollection, getActivePlaces, store, t } from './store';
import { el } from '../dom';
import { buildCollectionMarkdown, downloadCollectionJson, downloadCollectionMarkdown } from '../export';
import { createShareableCollectionShareLink } from '../../domain/collection-share';
import { setStatus } from './ui';

function closeMenu(): void {
  el.exportMenu.style.display = 'none';
  el.btnExportActiveCollection.setAttribute('aria-expanded', 'false');
}

function openMenu(): void {
  el.exportMenu.style.display = 'block';
  el.btnExportActiveCollection.setAttribute('aria-expanded', 'true');
}

function requirePlaces() {
  const dict = t();
  const collection = getActiveCollection();
  const places = getActivePlaces();
  if (!collection || places.length === 0) {
    setStatus(dict.exportEmpty, 'error');
    return null;
  }
  return { collection, places };
}

export function setupImportExportHandlers(): void {
  // Export menu: Markdown file / copy text (standalone collector use) / JSON file.
  el.btnExportActiveCollection.addEventListener('click', (event) => {
    event.stopPropagation();
    if (el.exportMenu.style.display === 'block') closeMenu();
    else openMenu();
  });
  document.addEventListener('click', (event) => {
    if (el.exportMenu.style.display !== 'block') return;
    const target = event.target as HTMLElement | null;
    if (target && (target === el.btnExportActiveCollection || el.btnExportActiveCollection.contains(target))) return;
    closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && el.exportMenu.style.display === 'block') closeMenu();
  });

  el.btnExportMarkdown.addEventListener('click', () => {
    const dict = t();
    const data = requirePlaces();
    closeMenu();
    if (!data) return;
    downloadCollectionMarkdown(data.collection, data.places, store.lang);
    setStatus(dict.exportedMarkdown(data.places.length), 'success');
  });

  el.btnCopyMarkdown.addEventListener('click', async () => {
    const dict = t();
    const data = requirePlaces();
    closeMenu();
    if (!data) return;
    try {
      await navigator.clipboard.writeText(buildCollectionMarkdown(data.collection, data.places, store.lang));
      setStatus(dict.copiedMarkdown(data.places.length), 'success');
    } catch {
      setStatus(dict.copyFailed, 'error');
    }
  });

  el.btnExportJson.addEventListener('click', async () => {
    const dict = t();
    const data = requirePlaces();
    closeMenu();
    if (!data) return;

    // 1. Download collection JSON
    downloadCollectionJson(data.collection, data.places);

    // 2. Also generate and copy share link if applicable
    const { url, truncated } = createShareableCollectionShareLink(data.collection, data.places);
    if (!truncated && url) {
      try {
        await navigator.clipboard.writeText(url);
        setStatus(dict.exportedJsonShare(data.places.length), 'success');
        return;
      } catch {}
    }

    setStatus(dict.exportedJson(data.places.length), 'success');
  });
}
