import type { WYQDActivationHeader, WYQDActivationPayload, WYQDActivationTokenParts } from './activation-types';

export const OWNLY_ACTIVATION_ENDPOINT = 'https://activate.ownly.app/api/activate';

const WYQD_ACTIVATION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPkpAyyt86gdhy0LICl41m5xx8SeE
7ckN5/pAZ241lCeKKXoYOtvQh5BZg4cHLy8niUmLnIgKwq1ezw4XkdlB5g==
-----END PUBLIC KEY-----`;

function pemToSpkiBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function parseActivationToken(token: string): WYQDActivationTokenParts | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const headerJson = JSON.parse(atob(parts[0]));
    const payloadJson = JSON.parse(atob(parts[1]));
    const signatureBytes = base64ToBytes(parts[2]);

    const signedText = `${parts[0]}.${parts[1]}`;
    const encoder = new TextEncoder();
    const signedBytes = encoder.encode(signedText);

    if (headerJson.alg !== 'ES256' || headerJson.typ !== 'OWNLY-ACT') return null;

    return {
      header: headerJson as WYQDActivationHeader,
      payload: payloadJson as WYQDActivationPayload,
      signatureBytes,
      signedBytes,
    };
  } catch {
    return null;
  }
}

export async function verifyActivationToken(token: string): Promise<WYQDActivationPayload | null> {
  try {
    const parts = parseActivationToken(token);
    if (!parts) return null;

    // Check expiry
    if (parts.payload.exp !== null && parts.payload.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000);
      if (now > parts.payload.exp) return null;
    }

    // Verify signature
    const spkiBytes = pemToSpkiBytes(WYQD_ACTIVATION_PUBLIC_KEY_PEM);
    const publicKey = await crypto.subtle.importKey(
      'spki',
      spkiBytes as unknown as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      parts.signatureBytes as unknown as ArrayBuffer,
      parts.signedBytes as unknown as ArrayBuffer,
    );

    return valid ? parts.payload : null;
  } catch {
    return null;
  }
}

export async function activateLicenseKey(
  endpoint: string,
  licenseKey: string,
): Promise<{ token: string } | { error: string }> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: body?.error || `HTTP ${response.status}` };
    }

    const body = await response.json();
    if (!body.token) return { error: 'No token in response' };

    return { token: body.token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}
