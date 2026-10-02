import { describe, expect, it } from 'vitest';
import { isReadOnlyMode, resolveLocalDataMode } from './local-data-mode';

describe('local data mode', () => {
  it('tells connected, demo and disconnected apart', () => {
    expect(resolveLocalDataMode(true, false)).toBe('connected');
    expect(resolveLocalDataMode(false, true)).toBe('demo');
    expect(resolveLocalDataMode(false, false)).toBe('disconnected');
  });

  it('prefers demo over a bare false, which is the ambiguous case', () => {
    // A folderless user browsing examples and a user who never connected both
    // have isConnected === false. Collapsing them is what made "am I in demo
    // mode?" unanswerable.
    expect(resolveLocalDataMode(false, false)).not.toBe(resolveLocalDataMode(false, true));
  });

  it('lets a connected folder win over a stale demo flag', () => {
    // Mid-transition the shell can hold both for a tick; a real folder must
    // never be reported as a demo.
    expect(resolveLocalDataMode(true, true)).toBe('connected');
  });

  it('treats only a connected folder as writable', () => {
    expect(isReadOnlyMode('connected')).toBe(false);
    expect(isReadOnlyMode('demo')).toBe(true);
    expect(isReadOnlyMode('disconnected')).toBe(true);
  });
});
