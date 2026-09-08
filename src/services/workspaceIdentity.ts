const STORAGE_KEY = 'ownly_workspace_id';

/**
 * Privacy boundary (issue #48, Gate 3): this is a stable identifier derived
 * from the local device. It must NEVER be transmitted — no analytics params
 * (see the `workspaceid` denylist entry in scripts/validate-analytics.mjs),
 * no backup payloads, no shared exports, no URLs. Local-only uses (e.g.
 * namespacing device-local caches) are the only approved consumers, and each
 * new caller must be justified on the PR that introduces it.
 */
function readStored(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw.length >= 8 && raw.length <= 64) return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStored(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Locked-down storage (private mode): keep the session-only id.
  }
}

function randomId(): string {
  try {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // randomUUID exists but throws (non-secure context) — try raw bytes.
  }
  try {
    if (typeof crypto?.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Fall through to the non-crypto fallback below.
  }
  // Non-secure contexts only: uniqueness without cryptographic strength.
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getWorkspaceId(): string {
  return readStored() ?? (() => {
    const id = randomId();
    writeStored(id);
    return id;
  })();
}
