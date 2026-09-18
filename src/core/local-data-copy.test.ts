import { describe, expect, it } from 'vitest';
import { getOwnlyLocalDataCopy, isMobileDevice } from './local-data-copy';

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
    expect(copy.mobileNotSupported).toContain('demo mode');
    expect(copy.mobileNotSupported).toContain('desktop Chrome');
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
    expect(copy.mobileNotSupported).toContain('演示模式');
    expect(copy.mobileNotSupported).toContain('桌面');
    expect(JSON.stringify(copy)).not.toContain('连接 Vault');
  });

  it('detects phone/tablet browsers for the mobile storage message', () => {
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe(false);
    expect(isMobileDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
    expect(isMobileDevice('')).toBe(false);
  });
});
