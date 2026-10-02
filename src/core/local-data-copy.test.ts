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

  it('distinguishes "no folder" from demo mode in both languages', () => {
    const en = getOwnlyLocalDataCopy('en');
    const zh = getOwnlyLocalDataCopy('zh');

    // These were the same string, which is why a user could not tell a
    // deliberate demo session from a failed connection.
    expect(en.disconnected).not.toBe(en.connected);
    expect(zh.disconnected).toBe('未连接数据目录');
    expect(zh.connected).toBe('数据目录已连接');
    expect(en.disconnectedDescription).toContain('demo mode');
    expect(zh.disconnectedDescription).toContain('演示模式');
  });

  it('states plainly that demo mode saves nothing', () => {
    const en = getOwnlyLocalDataCopy('en');
    const zh = getOwnlyLocalDataCopy('zh');

    expect(en.demoNote).toContain('never writes a file');
    expect(zh.demoNote).toContain('不会写入任何文件');
    expect(zh.demoNote).toContain('不会被保留');
  });

  it('warns that connecting discards the demo session', () => {
    const en = getOwnlyLocalDataCopy('en');
    const zh = getOwnlyLocalDataCopy('zh');

    expect(en.onboarding.connectDiscardsDemo).toContain('discarded');
    expect(zh.onboarding.connectDiscardsDemo).toContain('丢弃');
  });

  it('offers demo mode as a labelled peer choice with a neutral escape', () => {
    const en = getOwnlyLocalDataCopy('en');
    const zh = getOwnlyLocalDataCopy('zh');

    expect(en.onboarding.demoTitle).toBeTruthy();
    expect(en.onboarding.demoButton).toBeTruthy();
    expect(en.onboarding.dismiss).toBe('Decide later');
    expect(zh.onboarding.dismiss).toBe('以后再说');
    expect(en.onboarding.demoDescription).toContain('read-only');
    expect(zh.onboarding.demoDescription).toContain('只读');
  });

  it('offers a way back out of a connected folder', () => {
    expect(getOwnlyLocalDataCopy('en').disconnect).toBe('Disconnect');
    expect(getOwnlyLocalDataCopy('zh').disconnect).toBe('断开连接');
  });
});
