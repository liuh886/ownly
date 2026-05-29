// Gumroad License Verify — client-side first-activation check.
// No Activation Service, no token signing, no private keys.

export const GUMROAD_PRODUCT_ID = 'PoPpMpnKR1EcYsy_wqBb1Q==';

// SHA-256 hash of the special license key.
// Generate: echo -n "YOUR-KEY" | sha256sum
const SPECIAL_LICENSE_KEY_SHA256 = '728782f74b24dd3526f9941ad99d6237a46e58017d7e1001055435e6c0222af0';

export interface GumroadVerifyResult {
  success: boolean;
  error?: string;
}

/**
 * Verify a license key against the Gumroad License Verify API.
 * Uses application/x-www-form-urlencoded as required by Gumroad.
 * Returns { success: true } on valid license, or { success: false, error } on failure.
 */
export async function verifyGumroadLicense(licenseKey: string): Promise<GumroadVerifyResult> {
  try {
    const params = new URLSearchParams();
    params.set('product_id', GUMROAD_PRODUCT_ID);
    params.set('license_key', licenseKey);
    params.set('increment_uses_count', 'true');

    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.success) {
      return { success: false, error: data.message || 'Invalid license key' };
    }

    // Check for abnormal purchase states
    if (data.purchase) {
      if (data.purchase.refunded || data.purchase.chargebacked || data.purchase.disputed) {
        return { success: false, error: 'This license has been refunded or disputed.' };
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Check if a key matches the special license key via SHA-256 hash comparison.
 * The real key is never stored in code — only its hash.
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
