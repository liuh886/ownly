import { parseTripBundle, type OwnlyTripBundle } from './trip-bundle';

export const OWNLY_TRIP_SHARE_HASH_KEY = 'ownly-trip';
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
    throw new Error('当前浏览器不支持解压这个 Ownly Trip 分享链接。请升级浏览器或让分享者改用 Trip Bundle 文件。');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeTripSharePayload(
  bundle: OwnlyTripBundle,
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

export async function decodeTripSharePayload(payload: string): Promise<OwnlyTripBundle> {
  const normalized = payload.trim();
  if (!normalized) throw new Error('Trip 分享链接缺少数据。');
  let bytes: Uint8Array;
  if (normalized.startsWith(GZIP_PREFIX)) {
    bytes = await gunzip(base64UrlToBytes(normalized.slice(GZIP_PREFIX.length)));
  } else if (normalized.startsWith(RAW_PREFIX)) {
    bytes = base64UrlToBytes(normalized.slice(RAW_PREFIX.length));
  } else {
    throw new Error('不支持的 Ownly Trip 分享链接版本。');
  }
  return parseTripBundle(new TextDecoder().decode(bytes));
}

export async function buildTripShareUrl(bundle: OwnlyTripBundle, pageUrl: string): Promise<string> {
  const payload = await encodeTripSharePayload(bundle);
  const cleanPageUrl = pageUrl.split('#')[0];
  return `${cleanPageUrl}#${OWNLY_TRIP_SHARE_HASH_KEY}=${payload}`;
}

export function extractTripSharePayload(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  return params.get(OWNLY_TRIP_SHARE_HASH_KEY);
}

export async function parseTripShareHash(hash: string): Promise<OwnlyTripBundle | null> {
  const payload = extractTripSharePayload(hash);
  return payload ? decodeTripSharePayload(payload) : null;
}

export function clearTripShareHash(): void {
  if (typeof window === 'undefined') return;
  const url = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', url);
}
