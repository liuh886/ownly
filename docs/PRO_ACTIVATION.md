# Ownly PRO Activation

## Overview

Ownly uses a **first-activation + local permanent unlock** model for PRO membership:

- **Web runtime**: Always PRO. No activation needed.
- **Obsidian runtime**: Defaults to Free. Activate once with a license key; the token is stored locally and verified offline on every restart.

No vault data is ever sent to any server. Only the license key leaves the device during the one-time activation request.

---

## How It Works

### First Activation (Obsidian)

1. Open **Settings → Ownly → Activate Pro**.
2. Enter your license key (e.g. `OWNLY-ABCD-EFGH`).
3. Click **Activate**.
4. The plugin sends `{ licenseKey }` to the activation endpoint (`https://activate.ownly.app/api/activate`).
5. The endpoint validates the key against Gumroad / 爱发电, and returns a signed activation token.
6. The plugin verifies the token signature locally using the embedded public key.
7. If valid, the token is saved to plugin settings. PRO is unlocked.

### Subsequent Starts (Offline)

1. On plugin load, the saved token is verified offline using the embedded ECDSA public key.
2. No network request is made. No telemetry. No phoning home.
3. If the token is valid and not expired → `membership = pro_lifetime`.
4. If the token is missing, invalid, or expired → `membership = free`.

### Deactivation

In **Settings → Ownly**, click **Deactivate** to clear the saved token and return to Free.

---

## Token Format

A custom base64-encoded token (not JWT):

```
base64(header) . base64(payload) . base64(signature)
```

- **Header**: `{ "alg": "ES256", "typ": "OWNLY-ACT" }`
- **Payload**: `{ "key": "OWNLY-XXXX", "plan": "pro_lifetime", "iat": 1717000000, "exp": null }`
- **Signature**: ECDSA P-256 SHA-256 over `header.payload`
- `exp: null` = lifetime (never expires)
- `exp: <timestamp>` = time-limited plan

---

## Open Source Boundary

| What | Where | Public? |
|---|---|---|
| Public key (PEM) | `src/core/activation.ts` | Yes |
| Token verification logic | `src/core/activation.ts` | Yes |
| Token types | `src/core/activation-types.ts` | Yes |
| Activation endpoint URL | `src/core/activation.ts` | Yes |
| Private key | Activation service only | No |
| Payment validation (Gumroad/爱发电) | Activation service only | No |
| License key database | Activation service only | No |

The activation service is a private, separately hosted API. The Obsidian plugin only contains the public key and verification logic.

---

## Security Considerations

- **Public key is embedded by design.** Anyone can verify tokens; only the activation service can create them.
- **If the private key leaks**, tokens can be forged. This is an accepted risk for a small indie product. The key can be rotated by shipping a plugin update with a new public key.
- **No vault data is transmitted.** Only the license key is sent during activation.
- **Tokens are self-contained.** No server lookup needed for verification.
- **Endpoint URL is a constant.** It can be changed by forking, but the signed token remains valid only for keys the service knows about.

---

## Setting Up the Activation Service

The activation service is **not included** in this repository. It needs to:

1. Accept `POST /api/activate` with `{ licenseKey: string }`.
2. Validate the license key against your payment provider (Gumroad, 爱发电, etc.).
3. Generate a signed token using the ECDSA P-256 private key.
4. Return `{ token: string }` on success, or `{ error: string }` on failure.

The private key must stay outside this repository and should be provided to the private activation service via a secret or environment variable, for example `OWNLY_ACTIVATION_PRIVATE_KEY_PATH`.

---

## Files

- `src/core/activation-types.ts` — Token type definitions
- `src/core/activation.ts` — Token verification, public key, activation endpoint
- `src/core/membership.ts` — Membership resolution (token-aware, async)
- `src/components/common/LicenseKeyModal.tsx` — Runtime-aware activation UI
- `src/obsidian/main.ts` — Obsidian settings activation flow
