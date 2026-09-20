import { describe, expect, it } from 'vitest';
import { detectOwnlyRoot } from './ownly-root-detector';

function existsAmong(paths: string[]): (p: string) => boolean {
  const set = new Set(paths);
  return (p) => set.has(p);
}

describe('detectOwnlyRoot', () => {
  it('accepts a folder already named Ownly', () => {
    expect(detectOwnlyRoot('/Users/me/Ownly', existsAmong(['/Users/me/Ownly'])))
      .toMatchObject({ status: 'ok', path: '/Users/me/Ownly' });
    expect(detectOwnlyRoot('Ownly', existsAmong(['Ownly'])))
      .toMatchObject({ status: 'ok', path: 'Ownly' });
  });

  it('normalizes trailing slashes before matching', () => {
    expect(detectOwnlyRoot('/Users/me/Ownly/', existsAmong(['/Users/me/Ownly'])))
      .toMatchObject({ status: 'ok', path: '/Users/me/Ownly' });
  });

  it('finds a nested Ownly inside a selected Vault', () => {
    const result = detectOwnlyRoot('/Vault', existsAmong(['/Vault', '/Vault/Ownly']));
    expect(result).toMatchObject({ status: 'ok', path: '/Vault/Ownly' });
  });

  it('proposes creating Ownly inside an empty folder', () => {
    expect(detectOwnlyRoot('/Empty', existsAmong(['/Empty'])))
      .toMatchObject({ status: 'create', path: '/Empty/Ownly' });
  });

  it('proposes creating Ownly inside an Obsidian Vault root', () => {
    expect(detectOwnlyRoot('/Vault', existsAmong(['/Vault', '/Vault/.obsidian'])))
      .toMatchObject({ status: 'create', path: '/Vault/Ownly' });
  });

  it('proposes creating Ownly for a non-existent path', () => {
    expect(detectOwnlyRoot('/Missing', existsAmong([])))
      .toMatchObject({ status: 'create', path: '/Missing/Ownly' });
  });
});
