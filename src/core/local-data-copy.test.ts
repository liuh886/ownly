import { describe, expect, it } from 'vitest';
import { getOwnlyLocalDataCopy } from './local-data-copy';

describe('Ownly Web/PWA local-data copy', () => {
  it('uses local-data language in English without implying Obsidian is required', () => {
    const copy = getOwnlyLocalDataCopy('en');

    expect(copy.connected).toBe('Local data connected');
    expect(copy.createOrOpen).toBe('Create or open data');
    expect(copy.onboarding.createTitle).toBe('Create new local data');
    expect(copy.onboarding.openTitle).toBe('Open existing data');
    expect(copy.onboarding.createDescription).toContain('Obsidian is not required');
    expect(JSON.stringify(copy)).not.toContain('Connect Vault');
    expect(JSON.stringify(copy)).not.toContain('Vault connected');
  });

  it('uses idiomatic local-data language in Chinese', () => {
    const copy = getOwnlyLocalDataCopy('zh');

    expect(copy.connected).toBe('本地数据已连接');
    expect(copy.createOrOpen).toBe('创建或打开数据');
    expect(copy.onboarding.createTitle).toBe('创建新的本地数据');
    expect(copy.onboarding.openTitle).toBe('打开已有数据');
    expect(copy.onboarding.createDescription).toContain('无需安装 Obsidian');
    expect(JSON.stringify(copy)).not.toContain('连接 Vault');
  });
});
