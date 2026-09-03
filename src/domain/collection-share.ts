import type { CaptureCollection, CapturePlace, OwnlyCollectionExportV1 } from './capture';
import { buildShareableCollectionExport, isCollectionExport, parseCaptureCollectionExport } from './capture';

/**
 * Phase 2-PR1: 本地分享链接
 * 无后端：token = base64url(JSON)，置于 URL hash，避免服务端存储
 * 约束：URL 长度 < 2KB 需提示「请用下载 JSON 分享」（超大合集降级）
 */

const MAX_URL_TOKEN_LENGTH = 1800; // 留给 origin + /#/c/ + 其他参数

function toBase64Url(json: string): string {
  const b64 = typeof Buffer !== 'undefined'
    ? Buffer.from(json, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token: string): string | null {
  try {
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return null;
  }
}

export interface ShareLinkResult {
  url: string;
  token: string;
  truncated: boolean; // true 表示超长，已降级提示
}

export function createCollectionShareLink(
  exportData: OwnlyCollectionExportV1,
  origin: string = typeof window !== 'undefined' ? window.location.origin : 'https://ownly.app',
): ShareLinkResult {
  const json = JSON.stringify(exportData);
  const token = toBase64Url(json);
  const url = `${origin.replace(/\/$/, '')}/#/c/${token}`;
  const truncated = token.length > MAX_URL_TOKEN_LENGTH;
  return { url, token, truncated };
}

/** P0+P1: 便捷创建「可分享」链接（自动净化 + 附加来源追踪） */
export function createShareableCollectionShareLink(
  collection: CaptureCollection,
  places: CapturePlace[],
  opts: { creator?: string; origin?: string } = {},
): ShareLinkResult {
  const exportData = buildShareableCollectionExport(collection, places, {
    source_type: 'shared_collection',
    creator: opts.creator,
    collection_id: collection.id,
    shared_at: new Date().toISOString(),
  });
  return createCollectionShareLink(exportData, opts.origin);
}

export function parseCollectionShareToken(token: string): OwnlyCollectionExportV1 | null {
  const json = fromBase64Url(token);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!isCollectionExport(parsed)) return null;
    return parseCaptureCollectionExport(parsed);
  } catch {
    return null;
  }
}

export function getCollectionShareTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // 支持 /#/c/<token> (hash) 和 /c/<token> (path)
    const hashMatch = u.hash.match(/#\/c\/([^/?#]+)/);
    if (hashMatch) return hashMatch[1];
    const pathMatch = u.pathname.match(/\/c\/([^/?#]+)/);
    if (pathMatch) return pathMatch[1];
    return null;
  } catch {
    return null;
  }
}
