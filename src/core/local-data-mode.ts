/**
 * Which data source Ownly is reading right now.
 *
 * The two booleans this replaces (`isConnected`, `isDemoMode`) cannot express
 * the state a folderless user is actually in: `isConnected === false` covers
 * both "deliberately browsing the demo" and "never managed to connect", which
 * need opposite guidance. Every surface that has to tell the user where their
 * data lives reads this one value instead, so "am I in demo mode?" has exactly
 * one answer in the app.
 *
 *  - `connected`     — a real data folder is attached; writes are persisted
 *  - `demo`          — the in-memory example store; read-only, dies with the tab
 *  - `disconnected`  — no folder and no example data; nothing to read or write
 */
export type LocalDataMode = 'connected' | 'demo' | 'disconnected';

/**
 * `isDemoMode` wins over a bare `false` because the demo store is what the
 * repositories are actually pointed at whenever it is attached — a session can
 * be mid-transition between seeding and setting `isConnected`.
 */
export function resolveLocalDataMode(isConnected: boolean, isDemoMode: boolean): LocalDataMode {
  if (isConnected) return 'connected';
  return isDemoMode ? 'demo' : 'disconnected';
}

/** Demo mode is a preview: nothing typed here survives the session. */
export function isReadOnlyMode(mode: LocalDataMode): boolean {
  return mode !== 'connected';
}
