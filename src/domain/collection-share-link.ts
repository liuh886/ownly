/**
 * Collection Share Link
 *
 * Encodes/decodes Capture Collection exports into compact URL-safe strings.
 * Allows sharing place collections via simple links.
 *
 * Format: #ownly-collection=<base64url-encoded-gzip-compressed-JSON>
 */
import { parseCaptureCollectionExport, type OwnlyCollectionExportV1 } from './capture';

export const OWNLY_COLLECTION_SHARE_HASH_KEY = 'ownly-collection';
const RAW_PREFIX = 'r.';
const GZIP_PREFIX = 'g.';

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持解压这个 Ownly Collection 分享链接。请升级浏览器。');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeCollectionSharePayload(
  bundle: OwnlyCollectionExportV1,
  options: { compress?: boolean } = {},
): Promise<string> {
  const json = JSON.stringify(bundle);
  const rawBytes = new TextEncoder().encode(json);
  const shouldCompress = options.compress !== false;
  if (shouldCompress) {
    const compressed = await gzip(rawBytes);
    if (compressed && compressed.length < rawBytes.length) {
      return `${GZIP_PREFIX}${bytesToBase64Url(compressed)}`;
    }
  }
  return `${RAW_PREFIX}${bytesToBase64Url(rawBytes)}`;
}

export async function decodeCollectionSharePayload(payload: string): Promise<OwnlyCollectionExportV1> {
  const normalized = payload.trim();
  if (!normalized) throw new Error('Collection 分享链接缺少数据。');
  let bytes: Uint8Array;
  if (normalized.startsWith(GZIP_PREFIX)) {
    bytes = await gunzip(base64UrlToBytes(normalized.slice(GZIP_PREFIX.length)));
  } else if (normalized.startsWith(RAW_PREFIX)) {
    bytes = base64UrlToBytes(normalized.slice(RAW_PREFIX.length));
  } else {
    throw new Error('不支持的 Ownly Collection 分享链接版本。');
  }
  const json = new TextDecoder().decode(bytes);
  const parsed = parseCaptureCollectionExport(JSON.parse(json));
  if (!parsed) throw new Error('Collection 分享链接数据无效。');
  return parsed;
}

export async function buildCollectionShareUrl(bundle: OwnlyCollectionExportV1, pageUrl: string): Promise<string> {
  const payload = await encodeCollectionSharePayload(bundle);
  const cleanPageUrl = pageUrl.split('#')[0];
  return `${cleanPageUrl}#${OWNLY_COLLECTION_SHARE_HASH_KEY}=${payload}`;
}

export function extractCollectionSharePayload(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return params.get(OWNLY_COLLECTION_SHARE_HASH_KEY);
}

export async function parseCollectionShareHash(hash: string): Promise<OwnlyCollectionExportV1 | null> {
  const payload = extractCollectionSharePayload(hash);
  return payload ? decodeCollectionSharePayload(payload) : null;
}

export function clearCollectionShareHash(): void {
  if (typeof window === 'undefined') return;
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', url);
}
