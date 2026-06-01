// Ownly Pro Activation — single source of truth.
// Simple, sincere, no anti-crack measures.
// Accepts: Gumroad license keys + special developer keys.

export const GUMROAD_PRODUCT_ID = 'PoPpMpnKR1EcYsy_wqBb1Q==';

// SHA-256 hash of the special developer license key.
// Generate: echo -n "YOUR-KEY" | sha256sum
const SPECIAL_LICENSE_KEY_SHA256 = '728782f74b24dd3526f9941ad99d6237a46e58017d7e1001055435e6c0222af0';

export type ActivationSource = 'gumroad' | 'special' | '';

export interface ActivationResult {
  success: boolean;
  source: ActivationSource;
  error?: string;
}

/**
 * Check if a key matches the special developer key via SHA-256 hash.
 * The real key is never stored — only its hash.
 */
export async function checkSpecialKey(key: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === SPECIAL_LICENSE_KEY_SHA256;
  } catch {
    return false;
  }
}

/**
 * Verify a license key against the Gumroad License Verify API.
 * Returns { success: true } on valid license, or { success: false, error } on failure.
 */
export async function verifyGumroadLicense(licenseKey: string): Promise<ActivationResult> {
  try {
    const params = new URLSearchParams();
    params.set('product_id', GUMROAD_PRODUCT_ID);
    params.set('license_key', licenseKey);
    params.set('increment_uses_count', 'false');

    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      return { success: false, source: '', error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.success) {
      return { success: false, source: '', error: data.message || 'Invalid license key' };
    }

    if (data.purchase?.refunded || data.purchase?.chargebacked || data.purchase?.disputed) {
      return { success: false, source: '', error: 'This license has been refunded or disputed.' };
    }

    return { success: true, source: 'gumroad' };
  } catch (err) {
    return { success: false, source: '', error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Unified activation: try special key first, then Gumroad.
 * This is the ONLY function that should be called for license activation.
 */
export async function activateLicense(key: string): Promise<ActivationResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { success: false, source: '', error: 'Please enter a license key.' };
  }

  // 1. Special key (offline, instant)
  const isSpecial = await checkSpecialKey(trimmed);
  if (isSpecial) {
    return { success: true, source: 'special' };
  }

  // 2. Gumroad verification
  return verifyGumroadLicense(trimmed);
}
