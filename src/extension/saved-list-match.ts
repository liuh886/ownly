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
  if (match?.[1]) {
    // D-step identity guard (D/M scheme): `!1s0xAAA:0xBBB` is a PLACE feature
    // id, not a list. The greedy class stops at the colon, so check the very
    // next char — a colon means place, anything else means list.
    const after = text[match.index + 3 + match[1].length];
    if (after === ':') return match[2] || match[3] || undefined;
    // `!1sChIJ…` place references are identity too, never lists.
    if (/^ChIJ[A-Za-z0-9_-]{8,}/.test(match[1])) return match[2] || match[3] || undefined;
    return match[1];
  }
  return match?.[2] || match?.[3] || undefined;
}
