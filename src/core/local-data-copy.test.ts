import { describe, expect, it } from 'vitest';
import { getOwnlyLocalDataCopy } from './local-data-copy';

describe('Ownly Web/PWA storage copy', () => {
  it('describes user-controlled storage in English without implying an Ownly cloud backend', () => {
    const copy = getOwnlyLocalDataCopy('en');

    expect(copy.connected).toBe('Data folder connected');
    expect(copy.createOrOpen).toBe('Choose data folder');
    expect(copy.onboarding.title).toBe('Choose where your Ownly files live');
    expect(copy.onboarding.localTitle).toBe('On this device');
    expect(copy.onboarding.cloudTitle).toBe('In your personal cloud folder');
    expect(copy.onboarding.cloudDescription).toContain('Google Drive');
    expect(copy.onboarding.cloudNote).toContain('provider handles synchronization');
    expect(copy.onboarding.cloudRule).toContain('one sync provider');
    expect(copy.onboarding.description).toContain('does not upload your records to an Ownly server');
    expect(JSON.stringify(copy)).not.toContain('Connect Vault');
    expect(JSON.stringify(copy)).not.toContain('Ownly Cloud');
  });

  it('uses the same user-controlled storage boundary in Chinese', () => {
    const copy = getOwnlyLocalDataCopy('zh');

    expect(copy.connected).toBe('数据目录已连接');
    expect(copy.createOrOpen).toBe('选择数据目录');
    expect(copy.onboarding.title).toBe('选择 Ownly 文件保存在哪里');
    expect(copy.onboarding.localTitle).toBe('保存在这台设备上');
    expect(copy.onboarding.cloudTitle).toBe('保存在个人云盘目录中');
    expect(copy.onboarding.cloudDescription).toContain('Google Drive');
    expect(copy.onboarding.cloudNote).toContain('同步由你的云盘服务负责');
    expect(copy.onboarding.cloudRule).toContain('一个 Ownly 数据目录只使用一个同步服务');
    expect(copy.onboarding.description).toContain('不会把记录上传到 Ownly 服务器');
    expect(JSON.stringify(copy)).not.toContain('连接 Vault');
  });
});
