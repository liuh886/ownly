export interface SavedListMatchContext {
  title?: string;
  tags?: string[];
}

export function normalizeSavedListName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/^[\s📁⭐🌟★]+|[\s📁⭐🌟★]+$/g, '')
    .replace(/\s*[·•|-]\s*\d+\s*(?:places?|items?|个地点|项)\s*$/i, '')
    .replace(/\s*\(\s*\d+\s*(?:places?|items?|个地点|项)?\s*\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function matchesSavedListContext(listName: string, context?: SavedListMatchContext | null): boolean {
  if (!context) return false;
  const list = normalizeSavedListName(listName);
  if (!list) return false;
  const targets = [...(context.tags ?? []), context.title ?? '']
    .map(normalizeSavedListName)
    .filter(Boolean);
  if (targets.some((target) => target === list)) return true;
  return targets.some((target) => target.length >= 3 && list.length >= 3 && (target.includes(list) || list.includes(target)));
}

export function extractGoogleMapsSavedListId(value: string): string | undefined {
  let text = value;
  try { text = decodeURIComponent(value); } catch {}
  const match = /(?:!1s|!2s)([A-Za-z0-9_-]{8,})|\/placelists\/list\/([A-Za-z0-9_-]{8,})|[?&](?:list|list_id)=([A-Za-z0-9_-]{8,})/i.exec(text);
  return match?.[1] || match?.[2] || match?.[3] || undefined;
}
