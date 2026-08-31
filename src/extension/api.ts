export interface ResolvedListRef {
  finalUrl: string;
  listId: string;
}

/**
 * Expands short links and extracts the list id without hitting the entitylist
 * endpoint — safe to call from any extension context.
 */
export async function expandAndExtractListId(rawUrl: string): Promise<ResolvedListRef | null> {
  let finalUrl = rawUrl;
  if (rawUrl.includes('maps.app.goo.gl') || rawUrl.includes('goo.gl/maps')) {
    try {
      const res = await fetch(rawUrl, { redirect: 'follow' });
      finalUrl = res.url;
    } catch (e) {
      console.warn('Short link expansion failed:', e);
      return null;
    }
  }
  const match = /!2s([A-Za-z0-9_-]{20,})|\/placelists\/list\/([A-Za-z0-9_-]{20,})/.exec(finalUrl);
  const listId = match?.[1] || match?.[2];
  return listId ? { finalUrl, listId } : null;
}