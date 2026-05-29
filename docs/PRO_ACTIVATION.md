# Ownly PRO Activation

## Overview

Ownly uses a **first-activation + local permanent unlock** model for PRO membership:

- **Web runtime**: Always PRO. No activation needed.
- **Obsidian runtime**: Defaults to Free. Activate once with a license key; the unlock state is stored locally and read on every restart — fully offline after first activation.

No vault data is ever sent to any server. Only the license key leaves the device during the one-time Gumroad verification request.

---

## How It Works

### First Activation (Obsidian)

1. Open **Settings → Ownly → Activate Pro**.
2. Paste your Gumroad license key.
3. Click **Activate**.
4. The plugin first checks if the key matches a special key (local SHA-256 hash comparison — no network).
5. If not a special key, the plugin sends the key to the **Gumroad License Verify API** (`https://api.gumroad.com/v2/licenses/verify`) via Obsidian's `requestUrl` (no CORS issues).
6. If Gumroad returns `success: true` and the purchase is not refunded/chargebacked/disputed, PRO is unlocked.
7. The `proUnlocked` flag is saved to plugin settings. Done.

### Subsequent Starts (Offline)

1. On plugin load, `proUnlocked` is read from settings.
2. If `true` → `membership = pro_lifetime`. No network request. No telemetry.
3. If `false` or missing → `membership = free`.

### Deactivation

In **Settings → Ownly**, click **Deactivate** to clear all activation state and return to Free.

---

## Special Key

A special license key can be configured via SHA-256 hash in `src/core/activation.ts`. The real key is never stored in code — only its hash. This enables offline testing or special promotions without a network round-trip.

```ts
// Generate hash: echo -n "YOUR-KEY" | sha256sum
// See src/core/activation.ts for the active hash value.
const SPECIAL_LICENSE_KEY_SHA256 = '<sha256-hash>';
```

Special key matching is enabled when the hash in `activation.ts` is set to a real value.

---

## Open Source Boundary

| What | Where | Public? |
|---|---|---|
| Gumroad product ID | `src/core/activation.ts` | Yes |
| Special key SHA-256 hash | `src/core/activation.ts` | Yes |
| Verification logic | `src/core/activation.ts` | Yes |
| Membership resolution | `src/core/membership.ts` | Yes |
| Gumroad access token | Not in this repo | No |
| License key database | Gumroad only | No |

The plugin calls Gumroad directly. There is no separate activation service.

---

## Security Considerations

- **No vault data is transmitted.** Only the license key is sent during the one-time activation.
- **No token signing.** No private keys, no ECDSA, no JWT. Just a boolean flag.
- **Gumroad product ID is public.** This is by design — the product ID alone cannot grant access.
- **`proUnlocked` is a local flag.** It is stored in Obsidian's plugin data (not encrypted). This is acceptable for a small indie product.
- **License key is stored in settings** for reference (last 4 chars displayed). The full key persists locally to allow re-verification if needed.

---

## Settings Fields

| Field | Type | Purpose |
|---|---|---|
| `licenseKey` | `string` | Full license key (stored locally) |
| `proUnlocked` | `boolean` | Whether PRO is active |
| `licenseSource` | `'gumroad' \| 'special' \| 'test' \| ''` | How activation happened |
| `licenseKeyLast4` | `string` | Last 4 chars for display |
| `activatedAt` | `string` | ISO timestamp of activation |

---

## Files

- `src/core/activation.ts` — Gumroad verify, special key check, product ID
- `src/core/membership.ts` — Membership resolution (reads `proUnlocked`, synchronous)
- `src/obsidian/main.ts` — Obsidian settings activation flow
- `src/components/shells/WebShell.tsx` — Web always PRO (hardcoded)
